import { fetchNAV, BTAM_TICKERS } from './_lib/btam.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function safeParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url, 'http://localhost');
  const sym = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z_]/g, '');
  if (!sym) {
    return new Response(JSON.stringify({ error: 'symbol required', known: BTAM_TICKERS }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  // Live scrape first
  const result = await fetchNAV(sym);
  const kv = await getKV();
  if (result && !result.error && result.price) {
    // Write-through: every successful scrape populates the KV cache so we
    // always have a last-known-good fallback when BT blocks us later.
    if (kv) {
      try {
        await kv.set('btam:nav:' + sym, JSON.stringify({
          symbol: sym, price: result.price, fetchedAt: new Date().toISOString(),
        }), { ex: 14 * 24 * 3600 });
      } catch {}
    }
    return new Response(JSON.stringify({
      symbol: sym, price: result.price, currency: 'RON',
      source: 'btam.ro', fetchedAt: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10800, s-maxage=10800', ...CORS },
    });
  }
  // Fallback to cached value
  if (kv) {
    try {
      const cached = safeParse(await kv.get('btam:nav:' + sym), null);
      if (cached?.price) {
        return new Response(JSON.stringify({
          symbol: sym, price: cached.price, currency: 'RON',
          source: 'btam.ro-cached', fetchedAt: cached.fetchedAt,
          staleMs: Date.now() - new Date(cached.fetchedAt).getTime(),
          note: 'Live scrape failed; served from KV cache',
        }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...CORS } });
      }
    } catch {}
  }
  return new Response(JSON.stringify({
    error: result?.error || 'Not found', symbol: sym, known: BTAM_TICKERS,
  }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
}
