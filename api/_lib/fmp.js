// FMP (financialmodelingprep.com) client with KV caching.
// Uses the /stable/ API — the legacy /api/v3/ endpoints were deprecated and now
// return 403 for non-grandfathered accounts. New pattern is query-string based:
//   /stable/<endpoint>?symbol=<SYMBOL>&<params>&apikey=<KEY>
//
// Set FMP_API_KEY on Vercel. Free tier works.

const BASE = 'https://financialmodelingprep.com/stable';

async function kvGet(kv, key) {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (raw == null) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}
async function kvSet(kv, key, value, ttlSec) {
  if (!kv) return;
  try { await kv.set(key, JSON.stringify(value), { ex: ttlSec }); } catch {}
}

function apiKey() {
  const k = process.env.FMP_API_KEY;
  if (!k) throw new Error('FMP_API_KEY not configured');
  return k;
}

function buildUrl(path, params) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey() }).toString();
  return `${BASE}/${path}?${qs}`;
}

// Cached fetch. ttlSec: how long to cache successful responses.
async function fetchCached(url, cacheKey, kv, ttlSec) {
  const cached = await kvGet(kv, cacheKey);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FMP ${res.status} on ${url.split('?')[0]}: ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  await kvSet(kv, cacheKey, data, ttlSec);
  return data;
}

// 40 quarters ≈ 10 years of fundamentals.
export async function incomeQuarterly(symbol, kv) {
  const url = buildUrl('income-statement', { symbol, period: 'quarter', limit: 40 });
  return fetchCached(url, `fmp:income:q:${symbol}`, kv, 24 * 3600);
}
export async function cashFlowQuarterly(symbol, kv) {
  const url = buildUrl('cash-flow-statement', { symbol, period: 'quarter', limit: 40 });
  return fetchCached(url, `fmp:cash:q:${symbol}`, kv, 24 * 3600);
}
export async function balanceQuarterly(symbol, kv) {
  const url = buildUrl('balance-sheet-statement', { symbol, period: 'quarter', limit: 40 });
  return fetchCached(url, `fmp:balance:q:${symbol}`, kv, 24 * 3600);
}
// Up to 10 years of daily OHLC + volume. Stable returns either a bare array
// or {historical: [...]}; caller should normalise via historicalSeries().
export async function historicalPrice(symbol, kv) {
  const url = buildUrl('historical-price-eod/full', { symbol });
  return fetchCached(url, `fmp:hist:${symbol}`, kv, 6 * 3600);
}
// Annual cash flow — used for 5y FCF CAGR.
export async function cashFlowAnnual(symbol, kv) {
  const url = buildUrl('cash-flow-statement', { symbol, period: 'annual', limit: 10 });
  return fetchCached(url, `fmp:cash:a:${symbol}`, kv, 24 * 3600);
}
// Current profile: latest price, shares outstanding, mkt cap, sector.
export async function profile(symbol, kv) {
  const url = buildUrl('profile', { symbol });
  return fetchCached(url, `fmp:profile:${symbol}`, kv, 3600);
}
// Up to 10 years of annual revenue / op income / EPS.
export async function incomeAnnual(symbol, kv) {
  const url = buildUrl('income-statement', { symbol, period: 'annual', limit: 10 });
  return fetchCached(url, `fmp:income:a:${symbol}`, kv, 24 * 3600);
}
// TTM ratios: P/E, margins, ROE/ROIC, dividend yield.
export async function ratiosTTM(symbol, kv) {
  const url = buildUrl('ratios-ttm', { symbol });
  return fetchCached(url, `fmp:ratios-ttm:${symbol}`, kv, 12 * 3600);
}
// TTM key metrics: EV/EBITDA, FCF yield, net debt / EBITDA.
export async function keyMetricsTTM(symbol, kv) {
  const url = buildUrl('key-metrics-ttm', { symbol });
  return fetchCached(url, `fmp:key-metrics-ttm:${symbol}`, kv, 12 * 3600);
}

// Normalise historical-price response — stable may return a bare array or
// {historical: [...]} depending on the endpoint variant. Callers should use
// this helper instead of reaching into the raw payload.
export function historicalSeries(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.historical)) return raw.historical;
  return [];
}
