import { cashFlowAnnual, balanceQuarterly, profile } from './_lib/fmp.js';
import { cagr } from './_lib/finance.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }

// Two-stage DCF enterprise value:
//   Stage 1: years 1..N grow at `g` annually
//   Stage 2: terminal at `tg` discounted by (r - tg)
// r = discount rate, tg = terminal growth.
function enterpriseValue(baseFCF, g, years, r, tg) {
  let ev = 0;
  let fcf = baseFCF;
  for (let t = 1; t <= years; t++) {
    fcf = fcf * (1 + g);
    ev += fcf / Math.pow(1 + r, t);
  }
  // Terminal at end of explicit period
  const terminal = (fcf * (1 + tg)) / (r - tg);
  ev += terminal / Math.pow(1 + r, years);
  return ev;
}

// Bisect for growth rate that makes DCF EV == target EV. Bounded at [-30%, 80%].
function solveImpliedGrowth(baseFCF, targetEV, years, r, tg) {
  let lo = -0.30, hi = 0.80;
  // Need monotone. DCF EV is monotonically increasing in g across our range.
  const evLo = enterpriseValue(baseFCF, lo, years, r, tg);
  const evHi = enterpriseValue(baseFCF, hi, years, r, tg);
  if (targetEV <= evLo) return lo;
  if (targetEV >= evHi) return hi;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const ev = enterpriseValue(baseFCF, mid, years, r, tg);
    if (ev < targetEV) lo = mid; else hi = mid;
    if (hi - lo < 1e-5) break;
  }
  return (lo + hi) / 2;
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
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
    if (!symbol) return new Response(JSON.stringify({ error: 'symbol param required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });

    // Knobs — exposed so the UI can sweep them if we want later.
    const discountRate = parseFloat(url.searchParams.get('r') || '0.10');
    const terminalGrowth = parseFloat(url.searchParams.get('tg') || '0.03');
    const years = parseInt(url.searchParams.get('years') || '10', 10);

    if (!(discountRate > terminalGrowth)) {
      return new Response(JSON.stringify({ error: 'discount rate must exceed terminal growth' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const kv = await getKV();
    const [cfA, bs, prof] = await Promise.all([
      cashFlowAnnual(symbol, kv),
      balanceQuarterly(symbol, kv),
      profile(symbol, kv),
    ]);

    if (!Array.isArray(cfA) || !cfA.length) throw new Error('no annual cash flow data');
    const fcfFor = r => (r.freeCashFlow != null ? r.freeCashFlow : (r.operatingCashFlow != null && r.capitalExpenditure != null ? r.operatingCashFlow + r.capitalExpenditure : null));
    const annual = cfA.slice(0, 10).map(r => ({ date: r.date, fcf: fcfFor(r) })).filter(r => r.fcf != null);
    if (annual.length < 2) throw new Error('insufficient FCF history');
    const latestFCF = annual[0].fcf;

    // Trailing 5y CAGR (uses 5 years ago vs latest; fall back to all available if <5).
    const oldestIdx = Math.min(5, annual.length - 1);
    const baseYears = oldestIdx;
    const trailingCAGR = cagr(annual[oldestIdx].fcf, latestFCF, baseYears);

    const p = prof?.[0];
    if (!p) throw new Error('no profile data');
    const currentPrice = p.price;
    const sharesOut = p.mktCap && currentPrice ? p.mktCap / currentPrice : null;
    const marketCap = p.mktCap;
    if (!marketCap) throw new Error('missing market cap');

    // Net debt: from latest quarterly balance sheet.
    const bsLatest = Array.isArray(bs) && bs.length ? bs[0] : null;
    const cash = bsLatest?.cashAndShortTermInvestments ?? bsLatest?.cashAndCashEquivalents ?? 0;
    const debt = bsLatest?.totalDebt ?? 0;
    const netDebt = debt - cash;
    const currentEV = marketCap + netDebt;

    const impliedG = solveImpliedGrowth(latestFCF, currentEV, years, discountRate, terminalGrowth);

    return new Response(JSON.stringify({
      symbol, generatedAt: new Date().toISOString(),
      assumptions: { years, discountRate, terminalGrowth },
      inputs: {
        latestFCF, fcfYear: annual[0].date,
        marketCap, netDebt, currentEV, currentPrice, sharesOut,
      },
      impliedGrowth: impliedG * 100,  // expressed as %
      trailingCAGR,                    // %
      delta: trailingCAGR != null ? (impliedG * 100) - trailingCAGR : null,
      annualFCF: annual,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
