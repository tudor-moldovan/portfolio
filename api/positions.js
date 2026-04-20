import { POSITIONS_SEED } from './_lib/positions_seed.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function parseJSON(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
}

// Minimal shape check so a typo in the edit page doesn't nuke the portfolio.
function validatePositions(arr) {
  if (!Array.isArray(arr)) throw new Error('positions must be an array');
  if (arr.length > 50) throw new Error('too many positions (max 50)');
  const seen = new Set();
  for (const p of arr) {
    if (!p || typeof p !== 'object') throw new Error('each position must be an object');
    if (typeof p.symbol !== 'string' || !p.symbol) throw new Error('symbol required');
    if (seen.has(p.symbol)) throw new Error(`duplicate symbol: ${p.symbol}`);
    seen.add(p.symbol);
    if (typeof p.units !== 'number' || p.units <= 0) throw new Error(`${p.symbol}: units must be > 0`);
    if (typeof p.avgCost !== 'number' || p.avgCost <= 0) throw new Error(`${p.symbol}: avgCost must be > 0`);
    if (!['USD','EUR','RON'].includes(p.currency)) throw new Error(`${p.symbol}: currency must be USD/EUR/RON`);
  }
}

function checkAuth(req) {
  const want = process.env.APP_KEY;
  if (!want) return true; // if unset, allow (dev)
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const url = new URL(req.url);
  const qkey = url.searchParams.get('key');
  return bearer === want || qkey === want;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const kv = await getKV();

  if (req.method === 'GET') {
    let positions = POSITIONS_SEED;
    if (kv) {
      try {
        const raw = await kv.get('positions:current');
        const parsed = parseJSON(raw, null);
        if (Array.isArray(parsed) && parsed.length) positions = parsed;
        else await kv.set('positions:current', JSON.stringify(POSITIONS_SEED));
      } catch {}
    }
    return new Response(JSON.stringify({ positions, source: kv ? 'kv' : 'seed' }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  }

  if (req.method === 'PUT') {
    if (!checkAuth(req)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    if (!kv) {
      return new Response(JSON.stringify({ error: 'KV not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const positions = Array.isArray(body) ? body : body?.positions;
    try { validatePositions(positions); } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    await kv.set('positions:current', JSON.stringify(positions));
    return new Response(JSON.stringify({ ok: true, count: positions.length }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
