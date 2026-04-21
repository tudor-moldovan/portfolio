// FMP (financialmodelingprep.com) client with KV caching.
// Free tier: 250 req/day. We cache each endpoint per symbol for 24h.
//
// Set FMP_API_KEY on Vercel (free tier works — register at the site).
// If unset, calls throw so the UI can render a "missing key" state.

const BASE = 'https://financialmodelingprep.com/api/v3';

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
  const k = apiKey();
  const url = `${BASE}/income-statement/${encodeURIComponent(symbol)}?period=quarter&limit=40&apikey=${k}`;
  return fetchCached(url, `fmp:income:q:${symbol}`, kv, 24 * 3600);
}
export async function cashFlowQuarterly(symbol, kv) {
  const k = apiKey();
  const url = `${BASE}/cash-flow-statement/${encodeURIComponent(symbol)}?period=quarter&limit=40&apikey=${k}`;
  return fetchCached(url, `fmp:cash:q:${symbol}`, kv, 24 * 3600);
}
export async function balanceQuarterly(symbol, kv) {
  const k = apiKey();
  const url = `${BASE}/balance-sheet-statement/${encodeURIComponent(symbol)}?period=quarter&limit=40&apikey=${k}`;
  return fetchCached(url, `fmp:balance:q:${symbol}`, kv, 24 * 3600);
}
// Up to 10 years of daily closes.
export async function historicalPrice(symbol, kv) {
  const k = apiKey();
  const url = `${BASE}/historical-price-full/${encodeURIComponent(symbol)}?serietype=line&timeseries=2600&apikey=${k}`;
  return fetchCached(url, `fmp:hist:${symbol}`, kv, 6 * 3600);
}
// Annual FCF — used for the 5y trailing CAGR in reverse DCF.
export async function cashFlowAnnual(symbol, kv) {
  const k = apiKey();
  const url = `${BASE}/cash-flow-statement/${encodeURIComponent(symbol)}?period=annual&limit=10&apikey=${k}`;
  return fetchCached(url, `fmp:cash:a:${symbol}`, kv, 24 * 3600);
}
// Current profile: latest price, shares outstanding, mkt cap.
export async function profile(symbol, kv) {
  const k = apiKey();
  const url = `${BASE}/profile/${encodeURIComponent(symbol)}?apikey=${k}`;
  return fetchCached(url, `fmp:profile:${symbol}`, kv, 3600);
}
