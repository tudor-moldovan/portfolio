export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const YF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

const UNIVERSE = {
  AAPL: 'Tech — Platform', MSFT: 'Tech — Platform', GOOGL: 'Tech — Platform',
  AMZN: 'Tech — Platform', META: 'Tech — Platform',
  NVDA: 'Tech — AI/Chips', ASML: 'Tech — AI/Chips', TSM: 'Tech — AI/Chips',
  V: 'Payments', MA: 'Payments',
  NFLX: 'Consumer',
  'BRK-B': 'Conglomerate',
};
const TICKERS = Object.keys(UNIVERSE);

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d >= 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

async function fetchSnapshot(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
    const res = await fetch(url, { headers: YF, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.chart?.result?.[0];
    if (!r?.meta?.regularMarketPrice) return null;
    const meta = r.meta;
    const closes = (r.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;
    const high52 = meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : null);
    const low52 = meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : null);
    const fiftyTwoWeekPosition = (high52 && low52 && high52 !== low52)
      ? ((price - low52) / (high52 - low52)) * 100
      : null;
    return {
      symbol,
      sector: UNIVERSE[symbol],
      name: meta.shortName || meta.longName || symbol,
      price,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      high52, low52,
      fiftyTwoWeekPosition,
      rsi: computeRSI(closes),
      yearReturn: closes.length > 1 ? ((price - closes[0]) / closes[0]) * 100 : null,
    };
  } catch { return null; }
}

// Valuation score, 0-100. Lower = more undervalued.
// Combines 52wk position (60%) + RSI normalized (40%).
function valuationScore(s) {
  const pos = s.fiftyTwoWeekPosition;
  const rsi = s.rsi;
  if (pos == null && rsi == null) return null;
  const posComponent = pos == null ? 50 : pos;        // 0=at low (cheap), 100=at high (expensive)
  const rsiComponent = rsi == null ? 50 : rsi;        // 0=oversold, 100=overbought
  return posComponent * 0.6 + rsiComponent * 0.4;
}

function valuationLabel(score) {
  if (score == null) return '—';
  if (score < 30) return 'UNDERVALUED';
  if (score < 50) return 'CHEAP';
  if (score < 65) return 'FAIR';
  if (score < 80) return 'RICH';
  return 'OVERVALUED';
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const snapshots = await Promise.all(TICKERS.map(t => fetchSnapshot(t)));
    const valid = snapshots.filter(Boolean).map(s => {
      const score = valuationScore(s);
      return { ...s, valuationScore: score, valuationLabel: valuationLabel(score) };
    }).filter(s => s.valuationScore != null);

    valid.sort((a, b) => a.valuationScore - b.valuationScore);

    const undervalued = valid.slice(0, 3);
    const overvalued = valid.slice(-3).reverse();

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      undervalued,
      overvalued,
      all: valid,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        ...CORS,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Valuation failed: ' + (e?.message || String(e)) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
