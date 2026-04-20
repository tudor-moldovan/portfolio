import { getFundamentalsWithCache } from './_lib/moat.js';

export const config = { maxDuration: 60 };

async function stepRegenBrief(reqUrl) {
  try {
    const origin = new URL(reqUrl, 'http://localhost').origin;
    const key = process.env.APP_KEY || '';
    const r = await fetch(`${origin}/api/brief?force=1${key ? `&key=${encodeURIComponent(key)}` : ''}`, {
      method: 'POST',
      signal: AbortSignal.timeout(50000),
    });
    if (!r.ok) return { ok: false, error: `brief HTTP ${r.status}` };
    const d = await r.json();
    return { ok: true, date: d.brief?.date, actions: (d.brief?.priorityActions || []).length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','ASML','TSM',
  'NFLX','V','MA','BRK-B',
  'SPY','^VIX','^TNX',
];
const MOAT_UNIVERSE = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','ASML','TSM','NFLX','V','MA','BRK-B'];

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function safeParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

// ── Step 1: Daily Market Scan ──────────────────────────────────────────
async function fetchScanQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;
    const meta = result.meta;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;
    const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    let rsi = null;
    if (closes.length >= 15) {
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i <= 14; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) avgGain += d; else avgLoss -= d;
      }
      avgGain /= 14; avgLoss /= 14;
      for (let i = 15; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * 13 + (d >= 0 ? d : 0)) / 14;
        avgLoss = (avgLoss * 13 + (d < 0 ? -d : 0)) / 14;
      }
      rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return {
      symbol, price, name: meta.shortName || symbol,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      sma20, rsi, aboveSma20: sma20 ? price > sma20 : null,
    };
  } catch { return null; }
}

async function stepScan(kv) {
  const results = await Promise.allSettled(SCAN_UNIVERSE.map(s => fetchScanQuote(s)));
  const quotes = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  const oversold = quotes.filter(q => q.rsi != null && q.rsi < 30);
  const overbought = quotes.filter(q => q.rsi != null && q.rsi > 70);
  const breakouts = quotes.filter(q => q.aboveSma20 && q.changePercent > 1.5);
  const breakdowns = quotes.filter(q => q.aboveSma20 === false && q.changePercent < -1.5);
  const vixQuote = quotes.find(q => q.symbol === '^VIX');
  const spyQuote = quotes.find(q => q.symbol === 'SPY');
  const regime = !vixQuote ? 'UNKNOWN' :
    vixQuote.price < 15 ? (spyQuote?.aboveSma20 ? 'RISK_ON' : 'NORMAL') :
    vixQuote.price < 25 ? 'NORMAL' :
    vixQuote.price < 35 ? 'CAUTIOUS' : 'RISK_OFF';
  const scan = {
    timestamp: new Date().toISOString(),
    totalScanned: quotes.length,
    regime,
    vix: vixQuote?.price?.toFixed(1) || null,
    tnx: quotes.find(q => q.symbol === '^TNX')?.price?.toFixed(2) || null,
    spy: { price: spyQuote?.price, change: spyQuote?.changePercent?.toFixed(2) + '%' },
    signals: {
      oversold: oversold.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price, name: q.name })),
      overbought: overbought.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price, name: q.name })),
      breakouts: breakouts.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price, name: q.name })),
      breakdowns: breakdowns.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price, name: q.name })),
    },
  };
  if (kv) {
    try { await kv.set('latest_scan', JSON.stringify(scan)); } catch {}
  }
  return scan;
}

// ── Step 2: Warm Moats for the 12-stock universe ──────────────────────
async function stepWarmMoats(kv) {
  if (!kv) return { warmed: 0 };
  const settled = await Promise.allSettled(
    MOAT_UNIVERSE.map(t => getFundamentalsWithCache(t, kv).catch(() => null)),
  );
  const moats = {};
  for (let i = 0; i < MOAT_UNIVERSE.length; i++) {
    const r = settled[i];
    const sym = MOAT_UNIVERSE[i];
    if (r.status === 'fulfilled' && r.value?.moat) {
      moats[sym] = { rating: r.value.moat.rating, score: r.value.moat.moatScore, ts: new Date().toISOString().slice(0, 10) };
    } else {
      moats[sym] = { rating: null, score: null, ts: new Date().toISOString().slice(0, 10) };
    }
  }
  try { await kv.set('moats:all', JSON.stringify(moats), { ex: 30 * 24 * 3600 }); } catch {}
  return { warmed: Object.values(moats).filter(m => m.rating).length };
}

// ── Handler ────────────────────────────────────────────────────────────
function getHeader(req, name) {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name.toLowerCase()] ?? null;
}

export default async function handler(req) {
  const authHeader = getHeader(req, 'authorization');
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://localhost');
  const keyParam = url.searchParams.get('key');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const kv = await getKV();
  const t0 = Date.now();
  // Scan + warm moats run in parallel; they feed the brief, so brief runs after.
  const [scanR, moatsR] = await Promise.allSettled([stepScan(kv), stepWarmMoats(kv)]);
  const briefR = await stepRegenBrief(req.url);
  const result = {
    steps: {
      scan: scanR.status === 'fulfilled'
        ? { ok: true, totalScanned: scanR.value?.totalScanned, regime: scanR.value?.regime }
        : { ok: false, error: scanR.reason?.message },
      moats: moatsR.status === 'fulfilled'
        ? { ok: true, ...moatsR.value }
        : { ok: false, error: moatsR.reason?.message },
      brief: briefR,
    },
    totalMs: Date.now() - t0,
  };
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}
