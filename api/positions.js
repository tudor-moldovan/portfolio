export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-pin',
};

const KEY = 'portfolio:positions';

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function safeParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

function headerOf(req, name) {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name.toLowerCase()] ?? null;
}

function validateAndNormalize(payload) {
  if (!payload || typeof payload !== 'object') return { error: 'Body must be an object' };
  if (!Array.isArray(payload.positions)) return { error: 'positions must be an array' };
  const positions = [];
  for (const [i, p] of payload.positions.entries()) {
    if (!p.sym || typeof p.sym !== 'string') return { error: `positions[${i}].sym required` };
    if (typeof p.units !== 'number' || p.units <= 0) return { error: `positions[${i}].units must be a positive number` };
    if (typeof p.avg !== 'number' || p.avg <= 0) return { error: `positions[${i}].avg must be a positive number` };
    const ccy = (p.ccy || 'USD').toUpperCase();
    if (!['USD', 'EUR', 'RON', 'GBP', 'CHF'].includes(ccy)) return { error: `positions[${i}].ccy unsupported` };
    if (p.broker && typeof p.broker !== 'string') return { error: `positions[${i}].broker must be a string` };
    positions.push({
      broker: p.broker || null,
      sym: p.sym.toUpperCase().trim(),
      units: p.units,
      avg: p.avg,
      ccy,
    });
  }
  if (payload.fx && typeof payload.fx !== 'object') return { error: 'fx must be an object' };
  return { positions, fx: payload.fx || {} };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const kv = await getKV();
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (req.method === 'GET') {
    try {
      const raw = await kv.get(KEY);
      const data = safeParse(raw, null);
      return new Response(JSON.stringify(data || { positions: [], fx: {} }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  if (req.method === 'POST') {
    // PIN auth. If POSITIONS_SECRET is set on the deployment, POST must
    // include `x-pin: <secret>`. If not set, POST is open (single-user
    // local / personal use).
    const secret = process.env.POSITIONS_SECRET;
    if (secret) {
      const pin = headerOf(req, 'x-pin');
      if (pin !== secret) {
        return new Response(JSON.stringify({ error: 'Invalid PIN' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
    }
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const v = validateAndNormalize(body);
    if (v.error) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const payload = {
      positions: v.positions,
      fx: v.fx,
      updatedAt: new Date().toISOString(),
    };
    try {
      await kv.set(KEY, JSON.stringify(payload));
      return new Response(JSON.stringify({ ok: true, ...payload }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'KV write failed: ' + e.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
