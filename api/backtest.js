export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Technical helpers ───────────────────────────────────────────────────
function sma(arr, i, period) {
  if (i < period - 1) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += arr[j];
  return sum / period;
}

function rsi(arr, i, period = 14) {
  if (i < period) return null;
  let gains = 0, losses = 0;
  for (let j = i - period + 1; j <= i; j++) {
    const d = arr[j] - arr[j - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + (gains / period) / (losses / period));
}

// ── Fetch 1-year daily data ─────────────────────────────────────────────
async function fetchHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) return null;
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const volumes = result.indicators?.quote?.[0]?.volume || [];
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      bars.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: closes[i], volume: volumes[i] || 0 });
    }
  }
  return bars;
}

// ── Built-in strategies ─────────────────────────────────────────────────
const STRATEGIES = {
  'rsi-mean-reversion': {
    name: 'RSI Mean Reversion',
    desc: 'Buy when RSI14 < 30 (oversold), sell when RSI14 > 70 (overbought)',
    entryFn: (closes, i) => rsi(closes, i) !== null && rsi(closes, i) < 30,
    exitFn: (closes, i) => rsi(closes, i) !== null && rsi(closes, i) > 70,
  },
  'sma-crossover': {
    name: 'SMA 20/50 Crossover',
    desc: 'Buy when SMA20 crosses above SMA50, sell when it crosses below',
    entryFn: (closes, i) => {
      if (i < 1) return false;
      const s20 = sma(closes, i, 20), s50 = sma(closes, i, 50);
      const ps20 = sma(closes, i - 1, 20), ps50 = sma(closes, i - 1, 50);
      return s20 && s50 && ps20 && ps50 && ps20 <= ps50 && s20 > s50;
    },
    exitFn: (closes, i) => {
      if (i < 1) return false;
      const s20 = sma(closes, i, 20), s50 = sma(closes, i, 50);
      const ps20 = sma(closes, i - 1, 20), ps50 = sma(closes, i - 1, 50);
      return s20 && s50 && ps20 && ps50 && ps20 >= ps50 && s20 < s50;
    },
  },
  'buy-and-hold': {
    name: 'Buy & Hold',
    desc: 'Buy on day 1, hold until end. Baseline comparison.',
    entryFn: (closes, i) => i === 50, // after warmup
    exitFn: () => false, // never sell
  },
};

// ── Backtest engine ─────────────────────────────────────────────────────
function runBacktest(bars, strategy) {
  const closes = bars.map(b => b.close);
  const trades = [];
  let position = null; // { entryPrice, entryIdx }
  let cash = 10000, shares = 0;

  for (let i = 50; i < closes.length; i++) { // start at 50 for SMA warmup
    if (!position && strategy.entryFn(closes, i)) {
      // Buy
      shares = Math.floor(cash / closes[i]);
      if (shares > 0) {
        position = { entryPrice: closes[i], entryIdx: i };
        cash -= shares * closes[i];
        trades.push({ action: 'BUY', date: bars[i].date, price: closes[i], shares });
      }
    } else if (position && strategy.exitFn(closes, i)) {
      // Sell
      cash += shares * closes[i];
      const ret = (closes[i] - position.entryPrice) / position.entryPrice * 100;
      trades.push({ action: 'SELL', date: bars[i].date, price: closes[i], shares, returnPct: ret });
      position = null;
      shares = 0;
    }
  }

  // Close any open position at end
  const lastPrice = closes[closes.length - 1];
  const finalValue = cash + shares * lastPrice;
  if (position) {
    const ret = (lastPrice - position.entryPrice) / position.entryPrice * 100;
    trades.push({ action: 'CLOSE', date: bars[bars.length - 1].date, price: lastPrice, shares, returnPct: ret });
  }

  // Metrics
  const totalReturn = (finalValue / 10000 - 1) * 100;
  const roundTrips = trades.filter(t => t.action === 'SELL' || t.action === 'CLOSE');
  const wins = roundTrips.filter(t => t.returnPct > 0).length;
  const winRate = roundTrips.length > 0 ? wins / roundTrips.length : null;
  const avgWin = roundTrips.filter(t => t.returnPct > 0).length
    ? roundTrips.filter(t => t.returnPct > 0).reduce((s, t) => s + t.returnPct, 0) / roundTrips.filter(t => t.returnPct > 0).length
    : 0;
  const avgLoss = roundTrips.filter(t => t.returnPct <= 0).length
    ? roundTrips.filter(t => t.returnPct <= 0).reduce((s, t) => s + t.returnPct, 0) / roundTrips.filter(t => t.returnPct <= 0).length
    : 0;

  // Max drawdown from equity curve
  let peak = 10000, maxDD = 0;
  let eq = 10000, sh = 0, c = 10000;
  for (let i = 50; i < closes.length; i++) {
    const t = trades.find(tr => tr.date === bars[i].date);
    if (t?.action === 'BUY') { sh = t.shares; c -= t.shares * t.price; }
    if (t?.action === 'SELL' || t?.action === 'CLOSE') { c += sh * t.price; sh = 0; }
    eq = c + sh * closes[i];
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalReturn: totalReturn.toFixed(2) + '%',
    finalValue: finalValue.toFixed(2),
    trades: trades.length,
    roundTrips: roundTrips.length,
    winRate: winRate != null ? (winRate * 100).toFixed(0) + '%' : 'N/A',
    avgWin: avgWin.toFixed(2) + '%',
    avgLoss: avgLoss.toFixed(2) + '%',
    maxDrawdown: (maxDD * 100).toFixed(1) + '%',
    tradeLog: trades.slice(-20), // last 20 trades
  };
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const { symbol = 'SPY', strategy: stratKey = 'rsi-mean-reversion' } = body;
  const strategy = STRATEGIES[stratKey];
  if (!strategy) {
    return new Response(JSON.stringify({ error: 'Unknown strategy', available: Object.keys(STRATEGIES) }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const bars = await fetchHistory(symbol);
  if (!bars || bars.length < 60) {
    return new Response(JSON.stringify({ error: 'Insufficient historical data for ' + symbol }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const result = runBacktest(bars, strategy);

  return new Response(JSON.stringify({
    symbol,
    strategy: strategy.name,
    description: strategy.desc,
    period: `${bars[0].date} → ${bars[bars.length - 1].date}`,
    dataPoints: bars.length,
    ...result,
  }), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
