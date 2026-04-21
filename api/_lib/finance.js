// Pure math helpers. No IO, no side effects.

// Percentile of `value` within `series` (0..100, 50 = median).
// Returns null if series has <5 points — too thin to be meaningful.
export function percentile(series, value) {
  const cleaned = series.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (cleaned.length < 5 || value == null || !isFinite(value)) return null;
  let below = 0;
  for (const x of cleaned) if (x <= value) below++;
  return (below / cleaned.length) * 100;
}
export function median(series) {
  const s = series.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Sum 4 rolling quarters starting at index `i` (going backward). Returns null
// if fewer than 4 valid quarters are available.
export function ttmSum(arr, i, getter) {
  if (i < 0 || i + 3 >= arr.length) return null;
  let total = 0;
  for (let j = 0; j < 4; j++) {
    const v = getter(arr[i + j]);
    if (v == null || !isFinite(v)) return null;
    total += v;
  }
  return total;
}

// Find the price on or before `dateISO` in a sorted-ascending price series
// ({date, close} items). Binary search since the array can be ~2600 entries.
export function priceOnOrBefore(priceSeries, dateISO) {
  if (!priceSeries?.length) return null;
  let lo = 0, hi = priceSeries.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (priceSeries[mid].date <= dateISO) { result = priceSeries[mid]; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return result;
}

// CAGR between first and last value over n years. Null if not computable.
export function cagr(first, last, years) {
  if (first == null || last == null || !years || first <= 0) return null;
  const r = last / first;
  if (r <= 0) return null;
  return (Math.pow(r, 1 / years) - 1) * 100;
}

// Label a percentile value for the UI.
export function zoneLabel(pct) {
  if (pct == null) return 'n/a';
  if (pct <= 25) return 'cheap';
  if (pct >= 75) return 'expensive';
  return 'fair';
}
