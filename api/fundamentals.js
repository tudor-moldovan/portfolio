import { getFundamentalsWithCache } from './_lib/moat.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}

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

    const kv = await getKV();
    const data = await getFundamentalsWithCache(symbol, kv);

    if (!data) {
      return new Response(JSON.stringify({ error: 'Could not fetch fundamentals for ' + symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Fundamentals failed: ' + e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
