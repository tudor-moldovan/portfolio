// Seed positions — baked into the repo as initial state.
// First GET /api/positions copies this to KV under `positions:current`.
// After that, the KV copy is canonical; edit via /edit?key=APP_KEY.
//
// Schema:
//   symbol     : display ticker (unique; suffix like 'BTC-R' to duplicate)
//   quoteSym   : what /api/quote looks up (drop the suffix)
//   broker     : display label
//   asset      : 'Stock' | 'ETF' | 'Crypto' | 'Index'
//   currency   : 'USD' | 'EUR' | 'RON'
//   buys       : [{date: 'YYYY-MM-DD', units: Number, price: Number}] — source
//                of truth for cost basis, buy timing, and SPY-equivalent math
//   isLump     : if true, treat each buy's `units` as the total local-currency
//                amount invested (not share count). `price` is ignored.
//   targetBuy  : optional — accumulate below this (local ccy)
//   targetSell : optional — trim above this
//   stopLoss   : optional — reconsider thesis below this
//
// The buy dates below are PLACEHOLDER estimates — the user should correct
// them via /edit with their real transaction history for honest SPY alpha.
export const POSITIONS_SEED = [
  {
    symbol: 'MSFT', quoteSym: 'MSFT', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-04-15', units: 19.524, price: 401.37 }],
    targetBuy: 380, targetSell: 520,
  },
  {
    symbol: 'AMZN', quoteSym: 'AMZN', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-03-10', units: 30.927, price: 204.31 }],
    targetBuy: 220, targetSell: 300,
  },
  {
    symbol: 'GOOG', quoteSym: 'GOOG', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-02-20', units: 14.811, price: 206.35 }],
    targetBuy: 280, targetSell: 380,
  },
  {
    symbol: 'META', quoteSym: 'META', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-05-05', units: 2.587, price: 627.41 }],
    targetBuy: 620, targetSell: 800,
  },
  {
    symbol: 'V', quoteSym: 'V', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-06-12', units: 9.270, price: 329.52 }],
    targetBuy: 320, targetSell: 380,
  },
  {
    symbol: 'VUSA', quoteSym: 'VUSA.AS', broker: 'IBKR', asset: 'ETF',
    currency: 'EUR',
    buys: [{ date: '2024-06-03', units: 120.7599, price: 107.86 }],
  },
  {
    symbol: 'BTC', quoteSym: 'BTC', broker: 'Binance', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2024-12-01', units: 0.04979976, price: 82781.77 }],
    targetBuy: 70000, targetSell: 110000,
  },
  {
    symbol: 'ETH', quoteSym: 'ETH', broker: 'Binance', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2024-08-15', units: 0.92230843, price: 2946.52 }],
    targetBuy: 2400, targetSell: 4200,
  },
  {
    symbol: 'BTC-R', quoteSym: 'BTC', broker: 'Revolut', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2025-01-15', units: 0.0039, price: 80544 }],
    targetBuy: 70000, targetSell: 110000,
  },
  {
    symbol: 'ROTX', quoteSym: 'ROTX', broker: 'BT Bank', asset: 'Index',
    currency: 'RON', isLump: true,
    buys: [{ date: '2024-09-01', units: 900, price: 1.0 }],
  },
];
