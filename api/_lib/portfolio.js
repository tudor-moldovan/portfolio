// Deterministic P&L math. No Claude here.
// Everything is normalized to USD using the live FX rates passed in.
// Call sites: api/positions (GET), api/brief (builds Claude prompt).

export function computePositionPL(pos, livePriceLocal, fx) {
  // fx = { EURUSD, USDRON } — both should be > 0
  const localCost = pos.isLump ? pos.avgCost : pos.units * pos.avgCost;
  const localValue = pos.isLump ? (livePriceLocal ?? pos.avgCost) : pos.units * (livePriceLocal ?? pos.avgCost);

  let costUSD, valueUSD;
  if (pos.currency === 'EUR') {
    costUSD = localCost * (fx.EURUSD || 1);
    valueUSD = localValue * (fx.EURUSD || 1);
  } else if (pos.currency === 'RON') {
    costUSD = localCost / (fx.USDRON || 1);
    valueUSD = localValue / (fx.USDRON || 1);
  } else {
    costUSD = localCost;
    valueUSD = localValue;
  }
  const plUSD = valueUSD - costUSD;
  const plPct = costUSD ? (plUSD / costUSD) * 100 : 0;
  return {
    localCost, localValue, costUSD, valueUSD, plUSD, plPct,
    livePriceLocal: livePriceLocal ?? null,
  };
}

// Simple target proximity check. Returns one of:
//  'AT_BUY'    — live price ≤ targetBuy  (green zone, can accumulate)
//  'NEAR_BUY'  — within 3% above targetBuy
//  'AT_SELL'   — live price ≥ targetSell (trim zone)
//  'NEAR_SELL' — within 3% below targetSell
//  'STOP_HIT'  — live price ≤ stopLoss
//  null        — no signal
export function targetSignal(pos, livePriceLocal) {
  if (livePriceLocal == null) return null;
  if (pos.stopLoss && livePriceLocal <= pos.stopLoss) return 'STOP_HIT';
  if (pos.targetBuy) {
    if (livePriceLocal <= pos.targetBuy) return 'AT_BUY';
    if (livePriceLocal <= pos.targetBuy * 1.03) return 'NEAR_BUY';
  }
  if (pos.targetSell) {
    if (livePriceLocal >= pos.targetSell) return 'AT_SELL';
    if (livePriceLocal >= pos.targetSell * 0.97) return 'NEAR_SELL';
  }
  return null;
}
