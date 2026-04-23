import { incomeQuarterly, cashFlowQuarterly, balanceQuarterly, historicalPrice, profile, ratiosTTM, keyMetricsTTM, incomeAnnual, cashFlowAnnual } from './_lib/fmp.js';
import { percentile, median, ttmSum, priceOnOrBefore, cagr } from './_lib/finance.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Bounded universe. Keeps data quality tight and lets us hardcode moat notes.
const ALLOWED = new Set(['AAPL','AMZN','GOOG','META','MSFT','NVDA','V','MA']);

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }

// Defensive field access — FMP occasionally renames fields across versions.
function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return null;
}

// Build 40-quarter TTM valuation series for own-history percentiles.
// Returns {pe: {current, percentile, median}, fcfYield: {...}, evEbitda: {...}}.
async function ownHistory(symbol, kv, currentPrice) {
  const [inc, cf, bs, hist] = await Promise.all([
    incomeQuarterly(symbol, kv),
    cashFlowQuarterly(symbol, kv),
    balanceQuarterly(symbol, kv),
    historicalPrice(symbol, kv),
  ]);
  if (!Array.isArray(inc) || !inc.length) return null;

  const incA = [...inc].reverse();
  const cfA = [...cf].reverse();
  const bsA = [...bs].reverse();
  const cfByDate = Object.fromEntries(cfA.map(q => [q.date, q]));
  const bsByDate = Object.fromEntries(bsA.map(q => [q.date, q]));
  const prices = (hist?.historical || []).map(p => ({ date: p.date, close: p.close })).sort((a, b) => a.date.localeCompare(b.date));

  const series = [];
  for (let i = 0; i + 3 < incA.length; i++) {
    const q = incA[i + 3];
    const priceRow = priceOnOrBefore(prices, q.date);
    if (!priceRow) continue;
    const px = priceRow.close;

    const ttmNet = ttmSum(incA, i, x => x.netIncome);
    const shares = q.weightedAverageShsOutDil || q.weightedAverageShsOut || null;
    const eps = (ttmNet != null && shares) ? ttmNet / shares : null;
    const pe = (eps && eps > 0) ? px / eps : null;

    const fcfFor = r => (r.freeCashFlow != null ? r.freeCashFlow : (r.operatingCashFlow != null && r.capitalExpenditure != null ? r.operatingCashFlow + r.capitalExpenditure : null));
    const ttmFcf = ttmSum(cfA.map(r => ({ freeCashFlow: fcfFor(r) })), i, x => x.freeCashFlow);
    const mktCap = (shares && px) ? shares * px : null;
    const fcfYield = (ttmFcf != null && mktCap) ? (ttmFcf / mktCap) * 100 : null;

    const ttmEbit = ttmSum(incA, i, x => x.operatingIncome);
    const ttmDA = ttmSum(cfA, i, x => x.depreciationAndAmortization);
    const ttmEbitda = (ttmEbit != null && ttmDA != null) ? ttmEbit + ttmDA : null;
    const bsRow = bsByDate[q.date];
    const netDebt = bsRow ? ((bsRow.totalDebt || 0) - (bsRow.cashAndShortTermInvestments || bsRow.cashAndCashEquivalents || 0)) : null;
    const ev = (mktCap != null && netDebt != null) ? mktCap + netDebt : null;
    const evEbitda = (ev != null && ttmEbitda != null && ttmEbitda > 0) ? ev / ttmEbitda : null;

    series.push({ pe, fcfYield, evEbitda, price: px });
  }
  if (!series.length) return null;

  // Scale the latest snapshot to the current price — percentiles should reflect
  // today's multiples, not the quarter-end snapshot from weeks ago.
  const latest = series[series.length - 1];
  const ratio = (currentPrice && latest.price) ? currentPrice / latest.price : 1;
  const pe = latest.pe != null ? latest.pe * ratio : null;
  const fcfY = latest.fcfYield != null ? latest.fcfYield / ratio : null;
  const evE = latest.evEbitda != null ? latest.evEbitda * ratio : null;

  const peSeries = series.map(s => s.pe).filter(x => x != null && x > 0);
  const fcfSeries = series.map(s => s.fcfYield).filter(x => x != null);
  const evSeries = series.map(s => s.evEbitda).filter(x => x != null && x > 0);

  return {
    sampleSize: series.length,
    pe:       { percentile: percentile(peSeries, pe),     median: median(peSeries) },
    fcfYield: { percentile: percentile(fcfSeries, fcfY),  median: median(fcfSeries) },
    evEbitda: { percentile: percentile(evSeries, evE),    median: median(evSeries) },
  };
}

function toPct(x) {
  if (x == null || !isFinite(x)) return null;
  // FMP returns some ratios as decimals (0.34 = 34%) and others as percentages.
  // The TTM endpoints use decimals. Convert to % for display.
  return x * 100;
}

async function analyseSide(symbol, kv) {
  const [prof, rat, km, incA, cfA] = await Promise.all([
    profile(symbol, kv),
    ratiosTTM(symbol, kv),
    keyMetricsTTM(symbol, kv),
    incomeAnnual(symbol, kv),
    cashFlowAnnual(symbol, kv),
  ]);

  const p = prof?.[0];
  const r = Array.isArray(rat) ? rat[0] : rat;
  const k = Array.isArray(km) ? km[0] : km;
  if (!p) throw new Error(`no profile for ${symbol}`);

  const history = await ownHistory(symbol, kv, p.price);

  // 5y growth from annual statements (FMP newest-first).
  const rev = (incA || []).slice(0, 6).map(x => x.revenue).filter(x => x != null && x > 0);
  const revenue5yCAGR = rev.length >= 2 ? cagr(rev[rev.length - 1], rev[0], rev.length - 1) : null;

  const fcfFor = x => (x.freeCashFlow != null ? x.freeCashFlow : (x.operatingCashFlow != null && x.capitalExpenditure != null ? x.operatingCashFlow + x.capitalExpenditure : null));
  const fcf = (cfA || []).slice(0, 6).map(fcfFor).filter(x => x != null && x > 0);
  const fcf5yCAGR = fcf.length >= 2 ? cagr(fcf[fcf.length - 1], fcf[0], fcf.length - 1) : null;

  const peTTM = pick(r, 'priceEarningsRatioTTM', 'peRatioTTM');
  const fcfYieldTTM = toPct(pick(k, 'freeCashFlowYieldTTM'));
  const evEbitdaTTM = pick(k, 'enterpriseValueOverEBITDATTM', 'evToEbitdaTTM');
  const opMargin = toPct(pick(r, 'operatingProfitMarginTTM', 'operatingMarginTTM'));
  const roic = toPct(pick(r, 'returnOnCapitalEmployedTTM', 'roicTTM'));
  const dividendYield = toPct(pick(r, 'dividendYieldTTM'));
  const netDebtEbitda = pick(k, 'netDebtToEBITDATTM');

  return {
    symbol,
    name: p.companyName || symbol,
    sector: p.sector || null,
    price: p.price ?? null,
    marketCap: p.mktCap ?? null,
    valuation: {
      pe:       { value: peTTM,       percentile: history?.pe.percentile ?? null,       median: history?.pe.median ?? null },
      fcfYield: { value: fcfYieldTTM, percentile: history?.fcfYield.percentile ?? null, median: history?.fcfYield.median ?? null },
      evEbitda: { value: evEbitdaTTM, percentile: history?.evEbitda.percentile ?? null, median: history?.evEbitda.median ?? null },
    },
    quality: { opMargin, roic, dividendYield, netDebtEbitda },
    growth: { revenue5yCAGR, fcf5yCAGR },
    historySampleSize: history?.sampleSize ?? 0,
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
    const url = new URL(req.url);
    const a = (url.searchParams.get('a') || '').toUpperCase().trim();
    const b = (url.searchParams.get('b') || '').toUpperCase().trim();
    if (!a || !b) return new Response(JSON.stringify({ error: 'a and b params required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    if (!ALLOWED.has(a) || !ALLOWED.has(b)) {
      return new Response(JSON.stringify({ error: `tickers must be one of: ${[...ALLOWED].join(', ')}` }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    if (a === b) return new Response(JSON.stringify({ error: 'pick two different tickers' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });

    const kv = await getKV();
    const [sideA, sideB] = await Promise.all([analyseSide(a, kv), analyseSide(b, kv)]);

    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), a: sideA, b: sideB }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
