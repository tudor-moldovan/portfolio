// Position math. `buys[]` is the source of truth.
// For display convenience we also expose summary totalUnits + avgCost.

export function summarize(pos) {
  const buys = Array.isArray(pos.buys) ? pos.buys : [];
  let totalUnits = 0, totalCostLocal = 0;
  for (const b of buys) {
    if (pos.isLump) { totalCostLocal += b.units; totalUnits += b.units; }
    else { totalUnits += b.units; totalCostLocal += b.units * b.price; }
  }
  const avgCost = totalUnits > 0 ? (pos.isLump ? 1 : totalCostLocal / totalUnits) : 0;
  return { totalUnits, totalCostLocal, avgCost };
}

export function toUSD(amountLocal, currency, fx) {
  if (currency === 'EUR') return amountLocal * (fx.EURUSD || 1);
  if (currency === 'RON') return amountLocal / (fx.USDRON || 1);
  return amountLocal;
}

// Deterministic live P&L for one position.
// livePriceLocal = current quote in position's currency; null => treat as cost.
export function computePL(pos, livePriceLocal, fx) {
  const { totalUnits, totalCostLocal } = summarize(pos);
  const price = livePriceLocal ?? null;
  // isLump positions (e.g. ROTX index tracker) have no per-share price — we
  // don't yet have a source. Value = invested cost until we add one.
  const localValue = pos.isLump
    ? totalCostLocal
    : (price != null ? totalUnits * price : totalCostLocal);
  const costUSD = toUSD(totalCostLocal, pos.currency, fx);
  const valueUSD = toUSD(localValue, pos.currency, fx);
  const plUSD = valueUSD - costUSD;
  const plPct = costUSD ? (plUSD / costUSD) * 100 : 0;
  return { totalUnits, totalCostLocal, localValue, costUSD, valueUSD, plUSD, plPct, livePriceLocal: price };
}

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
