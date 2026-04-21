// Minimal positions schema for the new Pick Log.
// The three tools (Valuation Percentile, Reverse DCF, Drawdown History)
// drive entirely off `symbol` + `quoteSym`. Units + avgCost are kept only
// for a tiny portfolio summary — the app no longer pretends to track P&L.
//
// Fields:
//   symbol   : display ticker (unique)
//   quoteSym : what /api/quote and FMP look up (drop any -R suffix)
//   broker   : display label
//   asset    : 'Stock' | 'ETF' | 'Crypto' | 'Index'
//   currency : 'USD' | 'EUR' | 'RON'
//   units    : share / coin count
//   avgCost  : average cost per unit in local currency
//
// Asset handling for each tool:
//   Stock         → valuation ✓  dcf ✓  drawdowns ✓
//   ETF / Index   → drawdowns ✓  (no fundamentals)
//   Crypto        → drawdowns ✓  (no fundamentals)
export const POSITIONS_SEED = [
  { symbol: 'MSFT',  quoteSym: 'MSFT',    broker: 'eToro',   asset: 'Stock',  currency: 'USD', units: 19.524,     avgCost: 401.37  },
  { symbol: 'AMZN',  quoteSym: 'AMZN',    broker: 'eToro',   asset: 'Stock',  currency: 'USD', units: 30.927,     avgCost: 204.31  },
  { symbol: 'GOOG',  quoteSym: 'GOOG',    broker: 'eToro',   asset: 'Stock',  currency: 'USD', units: 14.811,     avgCost: 206.35  },
  { symbol: 'META',  quoteSym: 'META',    broker: 'eToro',   asset: 'Stock',  currency: 'USD', units: 2.587,      avgCost: 627.41  },
  { symbol: 'V',     quoteSym: 'V',       broker: 'eToro',   asset: 'Stock',  currency: 'USD', units: 9.270,      avgCost: 329.52  },
  { symbol: 'VUSA',  quoteSym: 'VUSA.AS', broker: 'IBKR',    asset: 'ETF',    currency: 'EUR', units: 120.7599,   avgCost: 107.86  },
  { symbol: 'BTC',   quoteSym: 'BTC',     broker: 'Binance', asset: 'Crypto', currency: 'USD', units: 0.04979976, avgCost: 82781.77 },
  { symbol: 'ETH',   quoteSym: 'ETH',     broker: 'Binance', asset: 'Crypto', currency: 'USD', units: 0.92230843, avgCost: 2946.52 },
  { symbol: 'BTC-R', quoteSym: 'BTC',     broker: 'Revolut', asset: 'Crypto', currency: 'USD', units: 0.0039,     avgCost: 80544   },
  { symbol: 'ROTX',  quoteSym: 'ROTX',    broker: 'BT Bank', asset: 'Index',  currency: 'RON', units: 900,        avgCost: 1.0     },
];
