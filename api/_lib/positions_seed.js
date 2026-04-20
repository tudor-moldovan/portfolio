// Seed positions — baked into the repo as initial state.
// First GET /api/positions copies this to KV under `positions:current`.
// After that, the KV copy is canonical; edit via /edit?key=APP_KEY.
//
// Fields:
//   symbol     : display ticker (unique; use suffix like 'BTC-R' to duplicate)
//   quoteSym   : what /api/quote should look up (drop the suffix)
//   broker     : display label
//   asset      : 'Stock' | 'ETF' | 'Crypto' | 'Index'
//   currency   : 'USD' | 'EUR' | 'RON'
//   units      : shares / coins (ignored when isLump=true)
//   avgCost    : price per unit in local currency (or total when isLump=true)
//   isLump     : if true, treat avgCost as total-invested in local ccy and
//                treat the current quote as the current total value. Used for
//                index-tracker accounts where only the RON amount is known.
//   targetBuy  : optional — accumulate zone lower bound
//   targetSell : optional — trim zone upper bound
//   stopLoss   : optional — reconsider thesis below this
export const POSITIONS_SEED = [
  {
    symbol: 'MSFT', quoteSym: 'MSFT', broker: 'eToro', asset: 'Stock',
    currency: 'USD', units: 19.524, avgCost: 401.37,
    targetBuy: 380, targetSell: 520,
  },
  {
    symbol: 'AMZN', quoteSym: 'AMZN', broker: 'eToro', asset: 'Stock',
    currency: 'USD', units: 30.927, avgCost: 204.31,
    targetBuy: 220, targetSell: 300,
  },
  {
    symbol: 'GOOG', quoteSym: 'GOOG', broker: 'eToro', asset: 'Stock',
    currency: 'USD', units: 14.811, avgCost: 206.35,
    targetBuy: 280, targetSell: 380,
  },
  {
    symbol: 'META', quoteSym: 'META', broker: 'eToro', asset: 'Stock',
    currency: 'USD', units: 2.587, avgCost: 627.41,
    targetBuy: 620, targetSell: 800,
  },
  {
    symbol: 'V', quoteSym: 'V', broker: 'eToro', asset: 'Stock',
    currency: 'USD', units: 9.270, avgCost: 329.52,
    targetBuy: 320, targetSell: 380,
  },
  {
    symbol: 'VUSA', quoteSym: 'VUSA.AS', broker: 'IBKR', asset: 'ETF',
    currency: 'EUR', units: 120.7599, avgCost: 107.86,
  },
  {
    symbol: 'BTC', quoteSym: 'BTC', broker: 'Binance', asset: 'Crypto',
    currency: 'USD', units: 0.04979976, avgCost: 82781.77,
    targetBuy: 70000, targetSell: 110000,
  },
  {
    symbol: 'ETH', quoteSym: 'ETH', broker: 'Binance', asset: 'Crypto',
    currency: 'USD', units: 0.92230843, avgCost: 2946.52,
    targetBuy: 2400, targetSell: 4200,
  },
  {
    symbol: 'BTC-R', quoteSym: 'BTC', broker: 'Revolut', asset: 'Crypto',
    currency: 'USD', units: 0.0039, avgCost: 80544,
    targetBuy: 70000, targetSell: 110000,
  },
  {
    symbol: 'ROTX', quoteSym: 'ROTX', broker: 'BT Bank', asset: 'Index',
    currency: 'RON', units: 1, avgCost: 900, isLump: true,
  },
];
