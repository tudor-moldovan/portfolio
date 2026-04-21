export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

const CRYPTO = new Set(['BTC','ETH','SOL','DOGE','BNB','XRP','ADA','LTC','AVAX','DOT']);
function toYahoo(sym) {
  const s = sym.toUpperCase();
  return CRYPTO.has(s) ? s + '-USD' : s;
}

async function getKV() { try { return (await import('@vercel/kv')).kv; } catch { return null; } }
function parseJSON(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
}

async function fetchPriceHistory(symbol) {
  const y = toYahoo(symbol);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 10 * 365 * 24 * 3600;  // ~10 years
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;
  const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null && isFinite(closes[i])) {
      series.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: closes[i] });
    }
  }
  return series;
}

// Walk the series. Every time price makes a new all-time-high, remember it.
// When price falls ≥ threshold% below the high, that's a drawdown episode.
// Episode ends either when price reclaims the high (recovered) or series ends
// (still underwater). Thresholds at 15% — classic correction territory.
function walkDrawdowns(series, thresholdPct = 15) {
  const episodes = [];
  if (!series.length) return episodes;
  let peak = series[0];
  let activeTrough = null;
  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    if (p.close > peak.close) {
      // New high: close any active episode that had cleared threshold.
      if (activeTrough) {
        const dd = ((activeTrough.close - peak.close) / peak.close) * 100;
        if (dd <= -thresholdPct) {
          episodes.push({
            peakDate: peak.date, peakPrice: peak.close,
            troughDate: activeTrough.date, troughPrice: activeTrough.close,
            drawdownPct: dd,
            recoveryDate: p.date,
            daysToTrough: Math.round((new Date(activeTrough.date) - new Date(peak.date)) / 86400000),
            daysPeakToRecovery: Math.round((new Date(p.date) - new Date(peak.date)) / 86400000),
            stillUnderwater: false,
          });
        }
        activeTrough = null;
      }
      peak = p;
    } else {
      // Track lowest point since the peak.
      if (!activeTrough || p.close < activeTrough.close) activeTrough = p;
    }
  }
  // Trailing episode if still underwater.
  if (activeTrough) {
    const dd = ((activeTrough.close - peak.close) / peak.close) * 100;
    if (dd <= -thresholdPct) {
      const last = series[series.length - 1];
      episodes.push({
        peakDate: peak.date, peakPrice: peak.close,
        troughDate: activeTrough.date, troughPrice: activeTrough.close,
        drawdownPct: dd,
        recoveryDate: null,
        currentPrice: last.close,
        currentDrawdownPct: ((last.close - peak.close) / peak.close) * 100,
        daysToTrough: Math.round((new Date(activeTrough.date) - new Date(peak.date)) / 86400000),
        daysPeakToNow: Math.round((new Date(last.date) - new Date(peak.date)) / 86400000),
        stillUnderwater: true,
      });
    }
  }
  return episodes;
}

async function analyseSymbol(symbol, kv) {
  const cacheKey = `dd:${symbol}`;
  if (kv) {
    const raw = await kv.get(cacheKey).catch(() => null);
    const cached = parseJSON(raw, null);
    if (cached) return cached;
  }
  const series = await fetchPriceHistory(symbol);
  if (!series.length) throw new Error('no price data');
  const episodes = walkDrawdowns(series, 15);
  // Basic stats users might care about.
  const recovered = episodes.filter(e => !e.stillUnderwater);
  const worstPast = recovered.reduce((w, e) => (w == null || e.drawdownPct < w.drawdownPct) ? e : w, null);
  const medianRecoveryDays = (() => {
    const arr = recovered.map(e => e.daysPeakToRecovery).sort((a, b) => a - b);
    if (!arr.length) return null;
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
  })();
  const current = series[series.length - 1];
  const active = episodes.find(e => e.stillUnderwater);
  const result = {
    symbol,
    latestDate: current?.date,
    latestPrice: current?.close,
    episodes,
    summary: {
      total: episodes.length,
      recovered: recovered.length,
      worstPastDDPct: worstPast?.drawdownPct ?? null,
      medianRecoveryDays,
      currentlyInDrawdown: !!active,
      currentDDPct: active?.currentDrawdownPct ?? null,
    },
  };
  if (kv) { try { await kv.set(cacheKey, JSON.stringify(result), { ex: 12 * 3600 }); } catch {} }
  return result;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const kv = await getKV();
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols') || '';
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return new Response(JSON.stringify({ error: 'symbols param required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });

    const settled = await Promise.allSettled(symbols.map(s => analyseSymbol(s, kv)));
    const results = {};
    for (let i = 0; i < symbols.length; i++) {
      const r = settled[i];
      results[symbols[i]] = r.status === 'fulfilled' ? r.value : { symbol: symbols[i], error: r.reason?.message || String(r.reason) };
    }
    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), results }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
