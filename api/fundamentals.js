export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' };

// ── FMP (Financial Modeling Prep) — real multi-year financials ───────────
async function fetchFMP(symbol, apiKey) {
  const base = 'https://financialmodelingprep.com/api/v3';
  const [incRes, cfRes, ratRes, profRes] = await Promise.all([
    fetch(`${base}/income-statement/${symbol}?period=annual&limit=6&apikey=${apiKey}`, { signal: AbortSignal.timeout(6000) }),
    fetch(`${base}/cash-flow-statement/${symbol}?period=annual&limit=6&apikey=${apiKey}`, { signal: AbortSignal.timeout(6000) }),
    fetch(`${base}/ratios/${symbol}?period=annual&limit=6&apikey=${apiKey}`, { signal: AbortSignal.timeout(6000) }),
    fetch(`${base}/profile/${symbol}?apikey=${apiKey}`, { signal: AbortSignal.timeout(6000) }),
  ]);

  const [inc, cf, rat, prof] = await Promise.all([
    incRes.ok ? incRes.json() : [], cfRes.ok ? cfRes.json() : [],
    ratRes.ok ? ratRes.json() : [], profRes.ok ? profRes.json() : [],
  ]);

  if (!inc.length) return null;

  const years = inc.map(y => ({
    year: y.calendarYear || y.date?.slice(0, 4),
    revenue: y.revenue,
    grossProfit: y.grossProfit,
    operatingIncome: y.operatingIncome,
    netIncome: y.netIncome,
    eps: y.eps,
    grossMargin: y.revenue ? y.grossProfit / y.revenue : null,
    operatingMargin: y.revenue ? y.operatingIncome / y.revenue : null,
    netMargin: y.revenue ? y.netIncome / y.revenue : null,
  }));

  const cfYears = cf.map(y => ({
    year: y.calendarYear || y.date?.slice(0, 4),
    operatingCashFlow: y.operatingCashFlow,
    capitalExpenditure: y.capitalExpenditure,
    freeCashFlow: y.freeCashFlow,
    fcfMargin: inc.find(i => (i.calendarYear || i.date?.slice(0, 4)) === (y.calendarYear || y.date?.slice(0, 4)))?.revenue
      ? y.freeCashFlow / inc.find(i => (i.calendarYear || i.date?.slice(0, 4)) === (y.calendarYear || y.date?.slice(0, 4))).revenue : null,
  }));

  const ratYears = rat.map(y => ({
    year: y.calendarYear || y.date?.slice(0, 4),
    roic: y.returnOnCapitalEmployed,
    roe: y.returnOnEquity,
    debtToEquity: y.debtEquityRatio,
    currentRatio: y.currentRatio,
    peRatio: y.priceEarningsRatio,
    pfcfRatio: y.priceToFreeCashFlowsRatio,
  }));

  const profile = prof[0] || {};

  return {
    source: 'FMP',
    name: profile.companyName || symbol,
    sector: profile.sector,
    industry: profile.industry,
    marketCap: profile.mktCap,
    description: profile.description?.slice(0, 300),
    incomeStatement: years.reverse(),
    cashFlow: cfYears.reverse(),
    ratios: ratYears.reverse(),
  };
}

// ── Yahoo Finance fallback (latest year only) ───────────────────────────
async function fetchYahooFallback(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,financialData,defaultKeyStatistics,incomeStatementHistory,cashflowStatementHistory`;
    let res = await fetch(url, { headers: YF, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      res = await fetch(url.replace('query2', 'query1'), { headers: YF, signal: AbortSignal.timeout(8000) });
    }
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;

    const fd = r.financialData || {};
    const ks = r.defaultKeyStatistics || {};
    const pr = r.price || {};
    const incStmts = r.incomeStatementHistory?.incomeStatementHistory || [];
    const cfStmts = r.cashflowStatementHistory?.cashflowStatements || [];

    const years = incStmts.map(y => ({
      year: new Date(y.endDate?.raw * 1000).getFullYear().toString(),
      revenue: y.totalRevenue?.raw,
      grossProfit: y.grossProfit?.raw,
      netIncome: y.netIncome?.raw,
      grossMargin: y.totalRevenue?.raw ? y.grossProfit?.raw / y.totalRevenue?.raw : null,
      netMargin: y.totalRevenue?.raw ? y.netIncome?.raw / y.totalRevenue?.raw : null,
    })).reverse();

    const cfYears = cfStmts.map(y => ({
      year: new Date(y.endDate?.raw * 1000).getFullYear().toString(),
      operatingCashFlow: y.totalCashFromOperatingActivities?.raw,
      capitalExpenditure: y.capitalExpenditures?.raw,
      freeCashFlow: (y.totalCashFromOperatingActivities?.raw || 0) + (y.capitalExpenditures?.raw || 0),
    })).reverse();

    return {
      source: 'Yahoo',
      name: pr.shortName || symbol,
      sector: pr.sector,
      marketCap: pr.marketCap?.raw,
      incomeStatement: years,
      cashFlow: cfYears,
      ratios: [{
        year: 'TTM',
        roic: null,
        roe: ks.returnOnEquity?.raw,
        debtToEquity: fd.debtToEquity?.raw ? fd.debtToEquity.raw / 100 : null,
        peRatio: ks.trailingPE?.raw || pr.trailingPE?.raw,
        pfcfRatio: null,
      }],
    };
  } catch { return null; }
}

// ── Moat Score Calculation (from real data) ─────────────────────────────
function computeMoatScore(data) {
  if (!data || !data.incomeStatement?.length) return null;
  const inc = data.incomeStatement;
  const cf = data.cashFlow || [];
  const rat = data.ratios || [];
  const scores = {};

  // 1. Gross margin consistency (20%) — stable high margins = pricing power
  const margins = inc.map(y => y.grossMargin).filter(m => m != null);
  if (margins.length >= 3) {
    const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
    const volatility = Math.sqrt(margins.reduce((s, m) => s + (m - avg) ** 2, 0) / margins.length);
    const stability = Math.max(0, 1 - volatility * 10); // low vol = high score
    const level = avg > 0.6 ? 1 : avg > 0.4 ? 0.8 : avg > 0.25 ? 0.5 : 0.2;
    scores.grossMargin = { score: stability * 0.4 + level * 0.6, avg: avg * 100, volatility: volatility * 100 };
  }

  // 2. Revenue growth consistency (20%) — sustained growth = demand moat
  if (inc.length >= 3) {
    const revs = inc.map(y => y.revenue).filter(r => r != null && r > 0);
    if (revs.length >= 3) {
      const cagr = Math.pow(revs[revs.length - 1] / revs[0], 1 / (revs.length - 1)) - 1;
      const yoyGrowths = [];
      for (let i = 1; i < revs.length; i++) yoyGrowths.push((revs[i] - revs[i - 1]) / revs[i - 1]);
      const positiveYears = yoyGrowths.filter(g => g > 0).length / yoyGrowths.length;
      scores.revenueGrowth = { score: Math.min(1, cagr * 3) * 0.5 + positiveYears * 0.5, cagr: cagr * 100, positiveYears: positiveYears * 100 };
    }
  }

  // 3. ROIC persistence (25%) — high returns on capital = competitive advantage
  const roics = rat.map(y => y.roic).filter(r => r != null);
  if (roics.length >= 2) {
    const avgRoic = roics.reduce((a, b) => a + b, 0) / roics.length;
    const aboveWacc = roics.filter(r => r > 0.10).length / roics.length; // proxy: ROIC > 10% = above WACC
    scores.roic = { score: Math.min(1, avgRoic * 3) * 0.5 + aboveWacc * 0.5, avg: avgRoic * 100, aboveWacc: aboveWacc * 100 };
  } else {
    // Fallback: use ROE if ROIC not available
    const roes = rat.map(y => y.roe).filter(r => r != null);
    if (roes.length >= 1) {
      const avgRoe = roes.reduce((a, b) => a + b, 0) / roes.length;
      scores.roic = { score: Math.min(1, avgRoe * 2), avg: avgRoe * 100, aboveWacc: null, metric: 'ROE' };
    }
  }

  // 4. FCF conversion (15%) — cash generation = real earnings quality
  if (cf.length >= 2 && inc.length >= 2) {
    const fcfMargins = [];
    for (const c of cf) {
      const matchInc = inc.find(i => i.year === c.year);
      if (matchInc?.revenue && c.freeCashFlow) fcfMargins.push(c.freeCashFlow / matchInc.revenue);
    }
    if (fcfMargins.length >= 2) {
      const avg = fcfMargins.reduce((a, b) => a + b, 0) / fcfMargins.length;
      const positive = fcfMargins.filter(m => m > 0).length / fcfMargins.length;
      scores.fcf = { score: Math.min(1, avg * 4) * 0.5 + positive * 0.5, avgMargin: avg * 100, positiveYears: positive * 100 };
    }
  }

  // 5. Financial health (10%) — low debt, high liquidity = resilience
  const latestRat = rat[rat.length - 1] || {};
  if (latestRat.debtToEquity != null) {
    const deScore = latestRat.debtToEquity < 0.3 ? 1 : latestRat.debtToEquity < 0.8 ? 0.7 : latestRat.debtToEquity < 1.5 ? 0.4 : 0.1;
    scores.health = { score: deScore, debtToEquity: latestRat.debtToEquity };
  }

  // 6. Valuation context (10%) — P/E and P/FCF for context
  const latestPE = rat.find(y => y.peRatio)?.peRatio;
  const latestPFCF = rat.find(y => y.pfcfRatio)?.pfcfRatio;
  if (latestPE) {
    scores.valuation = { pe: latestPE, pfcf: latestPFCF };
  }

  // Weighted total
  const weights = { grossMargin: 0.20, revenueGrowth: 0.20, roic: 0.25, fcf: 0.15, health: 0.10 };
  let totalScore = 0, totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (scores[key]?.score != null) {
      totalScore += scores[key].score * weight;
      totalWeight += weight;
    }
  }
  const moatScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : null;
  const rating = moatScore >= 80 ? 'FORTRESS' : moatScore >= 60 ? 'STRONG' : moatScore >= 40 ? 'INTACT' : 'ERODING';

  return { moatScore, rating, components: scores, yearsOfData: inc.length };
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const fmpKey = process.env.FMP_API_KEY;
    let data = null;

    // Try FMP first (best data), fall back to Yahoo
    if (fmpKey) {
      try { data = await fetchFMP(symbol, fmpKey); } catch {}
    }
    if (!data) {
      try { data = await fetchYahooFallback(symbol); } catch {}
    }

    if (!data) {
      return new Response(JSON.stringify({ error: 'Could not fetch fundamentals for ' + symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const moat = computeMoatScore(data);

    return new Response(JSON.stringify({ symbol, ...data, moat }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Fundamentals failed: ' + e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
