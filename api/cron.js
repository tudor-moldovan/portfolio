export const config = { runtime: 'edge' };

// Vercel Cron calls this endpoint on schedule.
// Currently runs a market scan; full automated trading requires Vercel KV
// for server-side portfolio persistence (see README).

const UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','CRM','AMD','AVGO','ORCL',
  'JPM','V','BRK-B','GS','MA',
  'UNH','JNJ','LLY','PFE','ABBV',
  'XOM','CVX',
  'WMT','KO','PG','COST',
  'CAT','GE','HON',
  'SPY','QQQ','DIA','IWM',
];

async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;
    const meta = result.meta;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;

    // SMA20
    const sma20 = closes.length >= 20
      ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;
    // RSI14 (Wilder's smoothing)
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
      symbol,
      price,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      name: meta.shortName || symbol,
      sma20,
      rsi,
      aboveSma20: sma20 ? price > sma20 : null,
    };
  } catch { return null; }
}

export default async function handler(req) {
  // Verify this is called by Vercel Cron (or allow manual trigger)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results = await Promise.allSettled(UNIVERSE.map(s => fetchQuote(s)));
  const quotes = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  // Identify interesting setups
  const oversold = quotes.filter(q => q.rsi != null && q.rsi < 30);
  const overbought = quotes.filter(q => q.rsi != null && q.rsi > 70);
  const breakouts = quotes.filter(q => q.aboveSma20 && q.changePercent > 1.5);
  const breakdowns = quotes.filter(q => q.aboveSma20 === false && q.changePercent < -1.5);

  const scan = {
    timestamp: new Date().toISOString(),
    totalScanned: quotes.length,
    signals: {
      oversold: oversold.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price })),
      overbought: overbought.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price })),
      breakouts: breakouts.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price })),
      breakdowns: breakdowns.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price })),
    },
    summary: `Scanned ${quotes.length} stocks. ${oversold.length} oversold, ${overbought.length} overbought, ${breakouts.length} breakouts, ${breakdowns.length} breakdowns.`,
  };

  // TODO: With Vercel KV, store scan results and auto-trigger analysis
  // await kv.set('latest_scan', JSON.stringify(scan));

  return new Response(JSON.stringify(scan), {
    headers: { 'Content-Type': 'application/json' },
  });
}
