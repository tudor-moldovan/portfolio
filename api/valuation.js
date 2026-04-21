import { incomeQuarterly, cashFlowQuarterly, balanceQuarterly, historicalPrice, profile } from './_lib/fmp.js';
import { percentile, ttmSum, priceOnOrBefore, median, zoneLabel } from './_lib/finance.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }

// Build historical P/E, FCF yield, EV/EBITDA series for a stock.
// One point per fiscal quarter using trailing-twelve-months fundamentals
// and the quarter-end market price.
async function analyseSymbol(symbol, kv) {
  const [inc, cf, bs, hist, prof] = await Promise.all([
    incomeQuarterly(symbol, kv),
    cashFlowQuarterly(symbol, kv),
    balanceQuarterly(symbol, kv),
    historicalPrice(symbol, kv),
    profile(symbol, kv),
  ]);

  if (!Array.isArray(inc) || !inc.length) throw new Error('no income data');
  if (!Array.isArray(cf) || !cf.length) throw new Error('no cash flow data');
  if (!Array.isArray(bs) || !bs.length) throw new Error('no balance sheet data');

  // FMP returns newest-first. Sort oldest-first for rolling calcs.
  const incA = [...inc].reverse();
  const cfA = [...cf].reverse();
  const bsA = [...bs].reverse();
  // Align by fiscal-date — build a lookup on the cf/bs side.
  const cfByDate = Object.fromEntries(cfA.map(q => [q.date, q]));
  const bsByDate = Object.fromEntries(bsA.map(q => [q.date, q]));
  // Price series ascending.
  const prices = (hist?.historical || []).map(p => ({ date: p.date, close: p.close })).sort((a, b) => a.date.localeCompare(b.date));

  const series = []; // [{date, pe, fcfYield, evEbitda}]
  // i counts from newest side; but we already sorted ascending. i = index in incA;
  // we need 4 subsequent quarters after i to compute TTM, so max i = len - 4.
  // We'll roll forward and at each quarter with a valid TTM emit a snapshot.
  for (let i = 0; i + 3 < incA.length; i++) {
    const q = incA[i + 3]; // ending quarter
    const date = q.date;
    const priceRow = priceOnOrBefore(prices, date);
    if (!priceRow) continue;
    const px = priceRow.close;

    // TTM net income → EPS diluted.
    const ttmNet = ttmSum(incA, i, x => x.netIncome);
    const dilutedShares = q.weightedAverageShsOutDil || q.weightedAverageShsOut || null;
    const ttmEps = (ttmNet != null && dilutedShares) ? ttmNet / dilutedShares : null;
    const pe = (ttmEps && ttmEps > 0) ? px / ttmEps : null;

    // TTM FCF (ops cash flow - capex). FMP gives freeCashFlow directly; fall back if missing.
    const fcfForQuarter = (r) => (r.freeCashFlow != null
      ? r.freeCashFlow
      : (r.operatingCashFlow != null && r.capitalExpenditure != null ? r.operatingCashFlow + r.capitalExpenditure : null));
    const ttmFcf = ttmSum(cfA.map(r => ({ freeCashFlow: fcfForQuarter(r) })), i, x => x.freeCashFlow);
    const marketCap = (dilutedShares && px) ? dilutedShares * px : null;
    const fcfYield = (ttmFcf != null && marketCap) ? (ttmFcf / marketCap) * 100 : null;

    // TTM EBITDA — approximated as operating income + D&A (from cash flow statement).
    const cfRow = cfByDate[date];
    const ttmEbit = ttmSum(incA, i, x => x.operatingIncome);
    const ttmDA = cfA.length > i ? ttmSum(cfA, i, x => x.depreciationAndAmortization) : null;
    const ttmEbitda = (ttmEbit != null && ttmDA != null) ? ttmEbit + ttmDA : null;
    const bsRow = bsByDate[date];
    const netDebt = bsRow ? ((bsRow.totalDebt || 0) - (bsRow.cashAndShortTermInvestments || bsRow.cashAndCashEquivalents || 0)) : null;
    const ev = (marketCap != null && netDebt != null) ? marketCap + netDebt : null;
    const evEbitda = (ev != null && ttmEbitda != null && ttmEbitda > 0) ? ev / ttmEbitda : null;

    series.push({ date, pe, fcfYield, evEbitda, price: px });
  }

  if (!series.length) throw new Error('no historical snapshots computed');

  // Current values: use the latest profile price (fresher) but latest TTM fundamentals.
  const latest = series[series.length - 1];
  const currentPrice = prof?.[0]?.price ?? latest.price;
  const priceRatio = (currentPrice && latest.price) ? currentPrice / latest.price : 1;
  const current = {
    pe: latest.pe != null ? latest.pe * priceRatio : null,
    // FCF yield scales inversely to price
    fcfYield: latest.fcfYield != null ? latest.fcfYield / priceRatio : null,
    evEbitda: latest.evEbitda != null ? latest.evEbitda * priceRatio : null,
    price: currentPrice,
  };

  const peSeries = series.map(s => s.pe).filter(x => x != null && x > 0);
  const fcfSeries = series.map(s => s.fcfYield).filter(x => x != null);
  const evSeries = series.map(s => s.evEbitda).filter(x => x != null && x > 0);

  return {
    symbol,
    currentPrice,
    asOf: latest.date,
    current,
    percentiles: {
      pe: percentile(peSeries, current.pe),
      fcfYield: percentile(fcfSeries, current.fcfYield),
      evEbitda: percentile(evSeries, current.evEbitda),
    },
    medians: {
      pe: median(peSeries),
      fcfYield: median(fcfSeries),
      evEbitda: median(evSeries),
    },
    zones: {
      pe: zoneLabel(percentile(peSeries, current.pe)),
      fcfYield: (() => {
        // FCF yield is inverted: HIGH yield = cheap. Invert the zone label.
        const p = percentile(fcfSeries, current.fcfYield);
        if (p == null) return 'n/a';
        if (p >= 75) return 'cheap';
        if (p <= 25) return 'expensive';
        return 'fair';
      })(),
      evEbitda: zoneLabel(percentile(evSeries, current.evEbitda)),
    },
    sampleSize: series.length,
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (!process.env.FMP_API_KEY) {
      return new Response(JSON.stringify({ error: 'FMP_API_KEY not configured on Vercel' }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const kv = await getKV();
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols') || '';
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return new Response(JSON.stringify({ error: 'symbols param required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });

    const settled = await Promise.allSettled(symbols.map(s => analyseSymbol(s, kv)));
    const results = {};
    for (let i = 0; i < symbols.length; i++) {
      const r = settled[i];
      results[symbols[i]] = r.status === 'fulfilled' ? r.value : { symbol: symbols[i], error: r.reason?.message || String(r.reason) };
    }
    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), results }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
