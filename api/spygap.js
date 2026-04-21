import { POSITIONS_SEED } from './_lib/positions_seed.js';
import { summarize, toUSD, computePL } from './_lib/portfolio.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }
function parseJSON(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
}

async function loadPositions(kv) {
  if (!kv) return POSITIONS_SEED;
  try {
    const raw = await kv.get('positions:current');
    const parsed = parseJSON(raw, null);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return POSITIONS_SEED;
}

async function fetchQuotes(origin, symbols) {
  try {
    const r = await fetch(`${origin}/api/quote?symbols=${symbols.map(encodeURIComponent).join(',')}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

async function fetchFX(origin) {
  try {
    const r = await fetch(`${origin}/api/quote?symbols=EURUSD%3DX,USDRON%3DX`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { EURUSD: 1.18, USDRON: 4.41 };
    const d = await r.json();
    return { EURUSD: d['EURUSD=X']?.price || 1.18, USDRON: d['USDRON=X']?.price || 4.41 };
  } catch { return { EURUSD: 1.18, USDRON: 4.41 }; }
}

// Fetch SPY daily closes covering [earliestDate, now]. Returns a map of
// YYYY-MM-DD → close. Cached per (earliestDate, today) in KV for 12h.
async function fetchSpyHistory(earliestDate, kv) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `spy:hist:${earliestDate}:${today}`;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      const parsed = parseJSON(cached, null);
      if (parsed && parsed.byDate) return parsed;
    } catch {}
  }
  const period1 = Math.floor(new Date(earliestDate + 'T00:00:00Z').getTime() / 1000) - 86400 * 5; // 5-day buffer
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;
  const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SPY history HTTP ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const byDate = {};
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null) byDate[new Date(ts[i] * 1000).toISOString().slice(0, 10)] = closes[i];
  }
  const latestPrice = result?.meta?.regularMarketPrice || closes[closes.length - 1] || null;
  const out = { byDate, latestPrice };
  if (kv) { try { await kv.set(cacheKey, JSON.stringify(out), { ex: 12 * 3600 }); } catch {} }
  return out;
}

// Find SPY close on date or the nearest trading day on/before it.
function spyOnOrBefore(byDate, date) {
  if (byDate[date]) return byDate[date];
  const d = new Date(date + 'T00:00:00Z');
  for (let step = 1; step <= 10; step++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const k = d.toISOString().slice(0, 10);
    if (byDate[k]) return byDate[k];
  }
  return null;
}

function computePositionSpyGap(pos, spy, fx, livePriceLocal) {
  // For each buy lot: convert its USD cost to SPY-equivalent units at SPY
  // price on the buy date. Today's equivalent value = sum(units × SPY_today).
  let spyEquivUnits = 0, costUSD = 0;
  for (const b of pos.buys || []) {
    const lotCostLocal = pos.isLump ? b.units : b.units * b.price;
    const lotCostUSD = toUSD(lotCostLocal, pos.currency, fx);
    costUSD += lotCostUSD;
    const spyAtBuy = spyOnOrBefore(spy.byDate, b.date);
    if (spyAtBuy && spy.latestPrice) {
      spyEquivUnits += lotCostUSD / spyAtBuy;
    }
  }
  const spyEquivUSD = spyEquivUnits * spy.latestPrice;
  const pl = computePL(pos, livePriceLocal, fx);
  const gapUSD = pl.valueUSD - spyEquivUSD;
  const gapPct = spyEquivUSD ? (gapUSD / spyEquivUSD) * 100 : 0;
  return { ...pl, spyEquivUSD, gapUSD, gapPct, costUSD };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const origin = new URL(req.url).origin;
    const kv = await getKV();
    const positions = await loadPositions(kv);

    if (!positions.length) {
      return new Response(JSON.stringify({ portfolio: null, positions: [] }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // Earliest buy date across all positions → lower bound for SPY history.
    const earliest = positions.flatMap(p => (p.buys || []).map(b => b.date)).sort()[0] || '2024-01-01';

    const symbols = [...new Set([
      ...positions.map(p => p.quoteSym || p.symbol),
      'SPY','^GSPC','^VIX','EURUSD=X','USDRON=X',
    ])];

    const [quotes, fx, spy] = await Promise.all([
      fetchQuotes(origin, symbols),
      fetchFX(origin),
      fetchSpyHistory(earliest, kv).catch(err => ({ byDate: {}, latestPrice: null, error: err.message })),
    ]);

    const enriched = positions.map(p => {
      const q = quotes[p.quoteSym || p.symbol];
      const livePrice = q?.price ?? null;
      const changePct = q?.changePercent ?? null;
      const gap = computePositionSpyGap(p, spy, fx, livePrice);
      const sum = summarize(p);
      return {
        ...p,
        livePrice, changePct,
        totalUnits: sum.totalUnits,
        avgCost: sum.avgCost,
        ...gap,
      };
    });

    const totalValueUSD = enriched.reduce((s, p) => s + p.valueUSD, 0);
    const totalCostUSD = enriched.reduce((s, p) => s + p.costUSD, 0);
    const totalSpyEquivUSD = enriched.reduce((s, p) => s + (p.spyEquivUSD || 0), 0);
    const totalPlUSD = totalValueUSD - totalCostUSD;
    const totalGapUSD = totalValueUSD - totalSpyEquivUSD;

    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      spyLatest: spy.latestPrice,
      spyError: spy.error || null,
      fx,
      portfolio: {
        valueUSD: totalValueUSD,
        costUSD: totalCostUSD,
        plUSD: totalPlUSD,
        plPct: totalCostUSD ? (totalPlUSD / totalCostUSD) * 100 : 0,
        spyEquivUSD: totalSpyEquivUSD,
        gapUSD: totalGapUSD,
        gapPct: totalSpyEquivUSD ? (totalGapUSD / totalSpyEquivUSD) * 100 : 0,
        earliestBuy: earliest,
      },
      positions: enriched,
      quotes,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
