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

// Precompute Wilder's RSI for entire array
function precomputeRSI(arr, period = 14) {
  const result = new Array(arr.length).fill(null);
  if (arr.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
function rsi(rsiArr, i) { return rsiArr[i]; }

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
// Strategy functions receive (closes, i, ctx) where ctx = { rsi: precomputedRSIArray }
const STRATEGIES = {
  'rsi-mean-reversion': {
    name: 'RSI Mean Reversion',
    desc: 'Buy when RSI14 < 30 (oversold), sell when RSI14 > 70 (overbought)',
    entryFn: (closes, i, ctx) => ctx.rsi[i] !== null && ctx.rsi[i] < 30,
    exitFn: (closes, i, ctx) => ctx.rsi[i] !== null && ctx.rsi[i] > 70,
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
function runBacktest(bars, strategy, costModel = {}) {
  const closes = bars.map(b => b.close);
  const ctx = { rsi: precomputeRSI(closes) };
  const commission = costModel.commissionPct || 0.001; // 0.1% default
  const slippage = costModel.slippagePct || 0.0005;    // 0.05% default
  const friction = commission + slippage;
  const trades = [];
  let position = null;
  let cash = 10000, shares = 0;

  for (let i = 50; i < closes.length; i++) {
    if (!position && strategy.entryFn(closes, i, ctx)) {
      const buyPrice = closes[i] * (1 + friction); // pay more on buy
      shares = Math.floor(cash / buyPrice);
      if (shares > 0) {
        position = { entryPrice: buyPrice, entryIdx: i };
        cash -= shares * buyPrice;
        trades.push({ action: 'BUY', date: bars[i].date, price: buyPrice, shares });
      }
    } else if (position && strategy.exitFn(closes, i, ctx)) {
      const sellPrice = closes[i] * (1 - friction); // receive less on sell
      cash += shares * sellPrice;
      const ret = (sellPrice - position.entryPrice) / position.entryPrice * 100;
      trades.push({ action: 'SELL', date: bars[i].date, price: sellPrice, shares, returnPct: ret });
      position = null; shares = 0;
    }
  }

  const lastPrice = closes[closes.length - 1];
  const finalValue = cash + shares * lastPrice;
  if (position) {
    const ret = (lastPrice - position.entryPrice) / position.entryPrice * 100;
    trades.push({ action: 'CLOSE', date: bars[bars.length - 1].date, price: lastPrice, shares, returnPct: ret });
  }

  // Basic metrics
  const totalReturn = (finalValue / 10000 - 1) * 100;
  const roundTrips = trades.filter(t => t.action === 'SELL' || t.action === 'CLOSE');
  const wins = roundTrips.filter(t => t.returnPct > 0);
  const losses = roundTrips.filter(t => t.returnPct <= 0);
  const winRate = roundTrips.length > 0 ? wins.length / roundTrips.length : null;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0;

  // Equity curve + drawdown + daily returns for risk metrics
  const tradeByDate = new Map(trades.map(t => [t.date, t]));
  let peak = 10000, maxDD = 0;
  let eq = 10000, sh = 0, c = 10000;
  const dailyEquity = [];
  for (let i = 50; i < closes.length; i++) {
    const t = tradeByDate.get(bars[i].date);
    if (t?.action === 'BUY') { sh = t.shares; c -= t.shares * t.price; }
    if (t?.action === 'SELL' || t?.action === 'CLOSE') { c += sh * t.price; sh = 0; }
    eq = c + sh * closes[i];
    dailyEquity.push(eq);
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Risk-adjusted metrics from daily equity returns
  let sharpe = null, sortino = null, calmar = null;
  if (dailyEquity.length >= 10) {
    const rets = [];
    for (let i = 1; i < dailyEquity.length; i++) rets.push(Math.log(dailyEquity[i] / dailyEquity[i - 1]));
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    const downside = rets.filter(r => r < 0);
    const downStd = downside.length ? Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / downside.length) : 0;
    const rf = 0.05 / 252;
    sharpe = std > 0 ? ((avg - rf) / std) * Math.sqrt(252) : 0;
    sortino = downStd > 0 ? ((avg - rf) / downStd) * Math.sqrt(252) : 0;
    const annReturn = (Math.pow(finalValue / 10000, 252 / dailyEquity.length) - 1) * 100;
    calmar = maxDD > 0 ? annReturn / (maxDD * 100) : 0;
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
    sharpe: sharpe != null ? sharpe.toFixed(2) : 'N/A',
    sortino: sortino != null ? sortino.toFixed(2) : 'N/A',
    calmar: calmar != null ? calmar.toFixed(2) : 'N/A',
    costModel: `${(friction * 100).toFixed(2)}% per trade`,
    tradeLog: trades.slice(-20),
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

  const { symbol = 'SPY', strategy: stratKey = 'rsi-mean-reversion', commissionPct, slippagePct } = body;
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

  const result = runBacktest(bars, strategy, { commissionPct, slippagePct });

  return new Response(JSON.stringify({
    symbol,
    strategy: strategy.name,
    description: strategy.desc,
    period: `${bars[0].date} → ${bars[bars.length - 1].date}`,
    dataPoints: bars.length,
    ...result,
  }), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
