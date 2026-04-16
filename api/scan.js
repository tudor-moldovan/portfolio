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
      latest: scan ? JSON.parse(scan) : null,
      history: history ? JSON.parse(history) : [],
    }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
