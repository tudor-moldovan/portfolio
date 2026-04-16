export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let kv = null;
async function getKV() {
  if (kv) return kv;
  try {
    const mod = await import('@vercel/kv');
    kv = mod.kv;
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const store = await getKV();
  if (!store) {
    return new Response(
      JSON.stringify({ error: 'Vercel KV not configured. Add a KV store in Vercel dashboard to enable cloud persistence.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  // GET — retrieve saved portfolio
  if (req.method === 'GET') {
    try {
      const portfolio = await store.get('portfolio');
      const snapshots = await store.get('snapshots');
      return new Response(JSON.stringify({ portfolio, snapshots }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to read: ' + e.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  // POST — save portfolio + snapshots
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    try {
      if (body.portfolio) await store.set('portfolio', body.portfolio);
      if (body.snapshots) await store.set('snapshots', body.snapshots);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to save: ' + e.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
