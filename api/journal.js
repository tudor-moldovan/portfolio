import { POSITIONS_SEED } from './_lib/positions_seed.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_ACTIONS = new Set(['note','add','trim','close','rewrite-thesis','thesis-broken','target-hit','stop-hit']);

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }
function parseJSON(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
}
function checkAuth(req) {
  const want = process.env.APP_KEY;
  if (!want) return true;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const url = new URL(req.url);
  const qkey = url.searchParams.get('key');
  return bearer === want || qkey === want;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const kv = await getKV();
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
  const symbol = typeof body?.symbol === 'string' ? body.symbol : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : 'note';
  const date = typeof body?.date === 'string' && ISO_DATE.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);
  if (!symbol) return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  if (note.length < 1) return new Response(JSON.stringify({ error: 'note cannot be empty' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  if (note.length > 2000) return new Response(JSON.stringify({ error: 'note too long (max 2000 chars)' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  if (!VALID_ACTIONS.has(action)) return new Response(JSON.stringify({ error: `action must be one of ${[...VALID_ACTIONS].join(',')}` }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });

  // Load positions from KV (seed as fallback so the first journal entry
  // doesn't wipe out the seed).
  let positions = POSITIONS_SEED;
  try {
    const raw = await kv.get('positions:current');
    const parsed = parseJSON(raw, null);
    if (Array.isArray(parsed) && parsed.length) positions = parsed;
  } catch {}
  const idx = positions.findIndex(p => p.symbol === symbol);
  if (idx < 0) return new Response(JSON.stringify({ error: `unknown symbol: ${symbol}` }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });

  const entry = { date, note, action };
  const updated = [...positions];
  updated[idx] = {
    ...updated[idx],
    journal: [...(Array.isArray(updated[idx].journal) ? updated[idx].journal : []), entry],
  };
  await kv.set('positions:current', JSON.stringify(updated));
  return new Response(JSON.stringify({ ok: true, entry, journalLength: updated[idx].journal.length }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
