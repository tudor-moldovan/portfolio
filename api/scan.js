export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}

// Upstash-backed @vercel/kv auto-deserializes JSON on get, but legacy
// data may still be a raw string. Handle both.
function safeParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const kv = await getKV();
  if (!kv) {
    return new Response(
      JSON.stringify({ error: 'Vercel KV not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  try {
    const scan = await kv.get('latest_scan');
    const history = await kv.get('scan_history');
    return new Response(JSON.stringify({
      latest: safeParse(scan, null),
      history: safeParse(history, []),
    }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
