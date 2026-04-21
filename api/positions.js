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

// Shape check. buys[] is the source of truth; if someone pastes a legacy
// schema with units+avgCost, coerce it into a single-lot buys[] with an
// unknown date so the app still renders (SPY gap will be approximate).
// Phase 2: thesis + invalidation + reviewBy are required on write.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_THESIS_CHARS = 20;
function normalizePositions(arr) {
  if (!Array.isArray(arr)) throw new Error('positions must be an array');
  if (arr.length > 50) throw new Error('too many positions (max 50)');
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') throw new Error('each position must be an object');
    if (typeof raw.symbol !== 'string' || !raw.symbol) throw new Error('symbol required');
    if (seen.has(raw.symbol)) throw new Error(`duplicate symbol: ${raw.symbol}`);
    seen.add(raw.symbol);
    if (!['USD','EUR','RON'].includes(raw.currency)) throw new Error(`${raw.symbol}: currency must be USD/EUR/RON`);
    let buys = Array.isArray(raw.buys) ? raw.buys : null;
    if (!buys || !buys.length) {
      if (typeof raw.units === 'number' && typeof raw.avgCost === 'number') {
        buys = [{ date: raw.buyDate || '2024-01-01', units: raw.units, price: raw.avgCost }];
      } else {
        throw new Error(`${raw.symbol}: needs buys[] with at least one {date,units,price}`);
      }
    }
    for (const b of buys) {
      if (!b || typeof b !== 'object') throw new Error(`${raw.symbol}: malformed buy lot`);
      if (!ISO_DATE.test(b.date || '')) throw new Error(`${raw.symbol}: buy.date must be YYYY-MM-DD`);
      if (typeof b.units !== 'number' || b.units <= 0) throw new Error(`${raw.symbol}: buy.units must be > 0`);
      if (typeof b.price !== 'number' || b.price <= 0) throw new Error(`${raw.symbol}: buy.price must be > 0`);
    }
    // The Thesis Contract — non-negotiable.
    const thesis = typeof raw.thesis === 'string' ? raw.thesis.trim() : '';
    const invalidation = typeof raw.invalidation === 'string' ? raw.invalidation.trim() : '';
    const reviewBy = typeof raw.reviewBy === 'string' ? raw.reviewBy.trim() : '';
    if (thesis.length < MIN_THESIS_CHARS) throw new Error(`${raw.symbol}: thesis must be at least ${MIN_THESIS_CHARS} chars — why did you buy this?`);
    if (invalidation.length < MIN_THESIS_CHARS) throw new Error(`${raw.symbol}: invalidation must be at least ${MIN_THESIS_CHARS} chars — what would make you sell?`);
    if (!ISO_DATE.test(reviewBy)) throw new Error(`${raw.symbol}: reviewBy must be YYYY-MM-DD — when will you re-evaluate?`);
    // Journal: optional, but if present must be a well-formed array.
    let journal = Array.isArray(raw.journal) ? raw.journal : [];
    journal = journal.map(e => {
      if (!e || typeof e !== 'object') throw new Error(`${raw.symbol}: malformed journal entry`);
      if (!ISO_DATE.test(e.date || '')) throw new Error(`${raw.symbol}: journal.date must be YYYY-MM-DD`);
      if (typeof e.note !== 'string') throw new Error(`${raw.symbol}: journal.note must be a string`);
      return { date: e.date, note: e.note, action: e.action || 'note' };
    });
    out.push({
      symbol: raw.symbol,
      quoteSym: raw.quoteSym || raw.symbol,
      broker: raw.broker || '',
      asset: raw.asset || 'Stock',
      currency: raw.currency,
      buys: buys.map(b => ({ date: b.date, units: b.units, price: b.price })),
      isLump: !!raw.isLump,
      thesis, invalidation, reviewBy,
      journal,
      ...(raw.targetBuy != null ? { targetBuy: raw.targetBuy } : {}),
      ...(raw.targetSell != null ? { targetSell: raw.targetSell } : {}),
      ...(raw.stopLoss != null ? { stopLoss: raw.stopLoss } : {}),
    });
  }
  return out;
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
    const raw = Array.isArray(body) ? body : body?.positions;
    let positions;
    try { positions = normalizePositions(raw); } catch (e) {
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
