export const config = { runtime: 'edge' };

const UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','ASML','TSM',
  'NFLX','V','MA','COST','BRK-B','LLY','LVMUY',
  'SPY','^VIX','^TNX',
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

    const sma20 = closes.length >= 20
      ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const sma50 = closes.length >= 50
      ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;

    // Wilder's RSI
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

    const high52 = closes.length ? closes.reduce((a, b) => Math.max(a, b)) : null;
    const low52 = closes.length ? closes.reduce((a, b) => Math.min(a, b)) : null;

    return {
      symbol, price, name: meta.shortName || symbol,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      sma20, sma50, rsi,
      aboveSma20: sma20 ? price > sma20 : null,
      fiftyTwoWeekPosition: (high52 && low52 && high52 !== low52)
        ? ((price - low52) / (high52 - low52)) * 100 : null,
    };
  } catch { return null; }
}

// ── KV storage ──────────────────────────────────────────────────────────
async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}

// ── Webhook notification ────────────────────────────────────────────────
async function sendWebhook(scan) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  const signalCount = scan.signals.oversold.length + scan.signals.overbought.length +
    scan.signals.breakouts.length + scan.signals.breakdowns.length;
  if (signalCount === 0) return; // don't notify on quiet days

  const lines = [`📊 Daily Market Scan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`];
  lines.push(`Scanned ${scan.totalScanned} stocks`);
  if (scan.vix) lines.push(`VIX: ${scan.vix} (${scan.regime})`);
  if (scan.signals.oversold.length) lines.push(`🟢 Oversold: ${scan.signals.oversold.map(s => s.symbol + ' RSI=' + s.rsi).join(', ')}`);
  if (scan.signals.overbought.length) lines.push(`🔴 Overbought: ${scan.signals.overbought.map(s => s.symbol + ' RSI=' + s.rsi).join(', ')}`);
  if (scan.signals.breakouts.length) lines.push(`⬆️ Breakouts: ${scan.signals.breakouts.map(s => s.symbol + ' ' + s.change).join(', ')}`);
  if (scan.signals.breakdowns.length) lines.push(`⬇️ Breakdowns: ${scan.signals.breakdowns.map(s => s.symbol + ' ' + s.change).join(', ')}`);

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n'), content: lines.join('\n') }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results = await Promise.allSettled(UNIVERSE.map(s => fetchQuote(s)));
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
    summary: `Scanned ${quotes.length} stocks. ${oversold.length} oversold, ${overbought.length} overbought, ${breakouts.length} breakouts, ${breakdowns.length} breakdowns. Regime: ${regime}.`,
  };

  // Store in KV for frontend to pick up
  const kv = await getKV();
  if (kv) {
    try {
      await kv.set('latest_scan', JSON.stringify(scan));
      // Keep last 30 days of scans for historical review
      const history = JSON.parse(await kv.get('scan_history') || '[]');
      history.push({ date: scan.timestamp.slice(0, 10), regime, signals: scan.signals, vix: scan.vix });
      if (history.length > 30) history.splice(0, history.length - 30);
      await kv.set('scan_history', JSON.stringify(history));
    } catch {}
  }

  // Send webhook notification
  await sendWebhook(scan);

  return new Response(JSON.stringify(scan), {
    headers: { 'Content-Type': 'application/json' },
  });
}
