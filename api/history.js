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
  const kv = await getKV();
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV not configured', history: {} }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  try {
    const raw = await kv.get('history:valuation');
    const history = safeParse(raw, {});
    return new Response(JSON.stringify({ history }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, history: {} }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
