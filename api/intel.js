export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

async function fetchCrumb() {
  try {
    const res = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YF_HEADERS, 'Cookie': 'A3=d=AQABBCYwKmcCEFoo' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

async function fetchInsiders(symbol) {
  try {
    // Try v10 quoteSummary with query2 endpoint
    const modules = 'insiderTransactions,recommendationTrend,earningsHistory,earningsTrend,calendarEvents,financialData';
    let url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
    const crumb = await fetchCrumb();
    if (crumb) url += '&crumb=' + encodeURIComponent(crumb);

    let res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });

    // Fallback to query1 if query2 fails
    if (!res.ok) {
      const url2 = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
      res = await fetch(url2, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
    }

    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;

    // Insider transactions (last 6 months)
    const insiders = (r.insiderTransactions?.transactions || []).slice(0, 10).map(t => ({
      name: t.filerName,
      relation: t.filerRelation,
      type: t.transactionText,
      shares: t.shares?.raw,
      value: t.value?.raw,
      date: t.startDate?.fmt,
    }));

    // Net insider sentiment
    let insiderBuys = 0, insiderSells = 0;
    for (const t of insiders) {
      if (t.type?.includes('Purchase') || t.type?.includes('Buy')) insiderBuys += (t.value || 0);
      if (t.type?.includes('Sale') || t.type?.includes('Sell')) insiderSells += (t.value || 0);
    }

    // Analyst recommendations
    const recTrend = r.recommendationTrend?.trend?.[0] || {};
    const analysts = {
      strongBuy: recTrend.strongBuy || 0,
      buy: recTrend.buy || 0,
      hold: recTrend.hold || 0,
      sell: recTrend.sell || 0,
      strongSell: recTrend.strongSell || 0,
      period: recTrend.period || 'current',
    };
    const totalAnalysts = analysts.strongBuy + analysts.buy + analysts.hold + analysts.sell + analysts.strongSell;
    const bullPct = totalAnalysts > 0 ? ((analysts.strongBuy + analysts.buy) / totalAnalysts * 100) : null;

    // Earnings history (last 4 quarters)
    const earnings = (r.earningsHistory?.history || []).slice(-4).map(e => ({
      quarter: e.quarter?.fmt || e.period,
      date: e.quarterEnd?.fmt,
      epsEstimate: e.epsEstimate?.raw,
      epsActual: e.epsActual?.raw,
      surprise: e.surprisePercent?.raw,
    }));

    // Earnings trend (forward estimates)
    const trend = (r.earningsTrend?.trend || []).slice(0, 2).map(t => ({
      period: t.period,
      epsEstimate: t.earningsEstimate?.avg?.raw,
      revenueEstimate: t.revenueEstimate?.avg?.raw,
      growth: t.growth?.raw,
    }));

    // Next earnings date
    const cal = r.calendarEvents?.earnings || {};
    const nextEarnings = cal.earningsDate?.[0]?.fmt || null;

    // Target price
    const fd = r.financialData || {};
    const targetHigh = fd.targetHighPrice?.raw;
    const targetLow = fd.targetLowPrice?.raw;
    const targetMean = fd.targetMeanPrice?.raw;
    const currentPrice = fd.currentPrice?.raw;
    const upside = targetMean && currentPrice ? ((targetMean - currentPrice) / currentPrice * 100) : null;

    return {
      insiders,
      insiderNetSentiment: insiderBuys > insiderSells ? 'NET_BUYING' : insiderSells > insiderBuys ? 'NET_SELLING' : 'NEUTRAL',
      insiderBuyValue: insiderBuys,
      insiderSellValue: insiderSells,
      analysts,
      bullPct,
      earnings,
      earningsTrend: trend,
      nextEarnings,
      target: { high: targetHigh, low: targetLow, mean: targetMean, upside },
    };
  } catch (e) { return { _error: e.message }; }
}

// Fallback: build partial data from the chart endpoint (always works)
async function fetchFallbackData(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      insiders: [],
      insiderNetSentiment: 'UNAVAILABLE',
      insiderBuyValue: 0, insiderSellValue: 0,
      analysts: { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      bullPct: null,
      earnings: [],
      earningsTrend: [],
      nextEarnings: null,
      target: { high: null, low: null, mean: null, upside: null },
      _note: 'Detailed data unavailable — Yahoo Finance quoteSummary API restricted. Showing basic data only.',
      _basic: {
        price: meta.regularMarketPrice,
        name: meta.shortName || meta.longName || symbol,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        marketCap: meta.marketCap,
      },
    };
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const sym = symbol.toUpperCase();
  let data = await fetchInsiders(sym);

  // If quoteSummary failed, try fallback
  if (!data || data._error) {
    data = await fetchFallbackData(sym);
  }

  if (!data) {
    return new Response(JSON.stringify({ error: 'Could not fetch data for ' + sym + '. Yahoo Finance may be rate-limiting.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
  });
}
