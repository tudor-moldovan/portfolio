// Seed positions — baked into the repo as initial state.
// First GET /api/positions copies this to KV under `positions:current`.
// After that, the KV copy is canonical; edit via /edit?key=APP_KEY.
//
// Phase 2 schema (required for every position):
//   symbol       : display ticker (unique; suffix like 'BTC-R' to duplicate)
//   quoteSym     : what /api/quote looks up (drop the suffix)
//   broker       : display label
//   asset        : 'Stock' | 'ETF' | 'Crypto' | 'Index'
//   currency     : 'USD' | 'EUR' | 'RON'
//   buys         : [{date:'YYYY-MM-DD', units, price}] — source of truth
//   thesis       : why you bought (min 20 chars)
//   invalidation : what would make you sell (min 20 chars) — specific, not mushy
//   reviewBy     : 'YYYY-MM-DD' — when you'll re-evaluate
// Optional:
//   isLump, targetBuy, targetSell, stopLoss
//   journal      : [{date, note, action}] — append-only log
//
// Buy dates and theses below are PLACEHOLDERS. Edit /edit to make them
// real. The Pick Log only becomes honest once you own the words.
export const POSITIONS_SEED = [
  {
    symbol: 'MSFT', quoteSym: 'MSFT', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-04-15', units: 19.524, price: 401.37 }],
    targetBuy: 380, targetSell: 520,
    thesis: 'Azure AI growth + Copilot monetization drive continued multiple support. Core tech compounder; expect 10-15% revenue CAGR through 2027 as AI workloads lift cloud gross profit.',
    invalidation: 'Azure growth falls below 20% YoY for two consecutive quarters, OR Copilot seat counts fail to convert to paid at attach rates >15%.',
    reviewBy: '2026-05-15',
    journal: [],
  },
  {
    symbol: 'AMZN', quoteSym: 'AMZN', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-03-10', units: 30.927, price: 204.31 }],
    targetBuy: 220, targetSell: 300,
    thesis: 'AWS reaccelerates above 20% YoY while retail op margins expand past 7% as shipping and fulfillment costs normalize post-pandemic. Kuiper optionality is unpriced.',
    invalidation: 'AWS growth drops below 12% YoY for two quarters, OR consolidated operating margin compresses below 5%.',
    reviewBy: '2026-06-01',
    journal: [],
  },
  {
    symbol: 'GOOG', quoteSym: 'GOOG', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-02-20', units: 14.811, price: 206.35 }],
    targetBuy: 280, targetSell: 380,
    thesis: 'Search moat intact despite AI disruption narrative; YouTube + Cloud add optionality at a ~18x forward P/E that underprices a cash machine with structural ad monopoly.',
    invalidation: 'US search query volume declines YoY for a full year, OR DOJ remedy forces meaningful behavioural change (Chrome divestiture, default deal termination).',
    reviewBy: '2026-05-10',
    journal: [],
  },
  {
    symbol: 'META', quoteSym: 'META', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-05-05', units: 2.587, price: 627.41 }],
    targetBuy: 620, targetSell: 800,
    thesis: 'Reality Labs losses plateau by end-2026; AI-driven ad targeting improves ROAS and ad pricing. Capex digestion phase completes; FCF inflects higher.',
    invalidation: 'Ad ARPU declines two quarters in a row, OR Reality Labs annual losses exceed $20B, OR DAU growth stalls in core app.',
    reviewBy: '2026-05-20',
    journal: [],
  },
  {
    symbol: 'V', quoteSym: 'V', broker: 'eToro', asset: 'Stock',
    currency: 'USD',
    buys: [{ date: '2024-06-12', units: 9.270, price: 329.52 }],
    targetBuy: 320, targetSell: 380,
    thesis: 'Best quality-growth compounder at a reasonable valuation. Payment rails widen into B2B and cross-border; take-rate holds. ~28x forward P/E is a discount to historical average.',
    invalidation: 'Cross-border volume growth decelerates to low single digits for two quarters, OR regulatory interchange caps are legislated in the US or EU.',
    reviewBy: '2026-05-05',
    journal: [],
  },
  {
    symbol: 'VUSA', quoteSym: 'VUSA.AS', broker: 'IBKR', asset: 'ETF',
    currency: 'EUR',
    buys: [{ date: '2024-06-03', units: 120.7599, price: 107.86 }],
    thesis: 'Passive S&P 500 core via UCITS ETF. No individual thesis — this position IS the benchmark exposure. Monthly DCA regardless of price.',
    invalidation: 'N/A for the index. Sell only for taxable-event reasons or structural portfolio rebalancing.',
    reviewBy: '2027-01-01',
    journal: [],
  },
  {
    symbol: 'BTC', quoteSym: 'BTC', broker: 'Binance', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2024-12-01', units: 0.04979976, price: 82781.77 }],
    targetBuy: 70000, targetSell: 110000,
    thesis: 'Digital-gold / reserve-asset thesis with a 4-year halving-driven cycle. Institutional adoption (ETFs, treasury holdings) lifts floor on each cycle. Play the cycle, not the tick.',
    invalidation: 'BTC breaks below $60K and remains below it for 30 consecutive days (below prior cycle low, indicating structural thesis rupture).',
    reviewBy: '2026-07-01',
    journal: [],
  },
  {
    symbol: 'ETH', quoteSym: 'ETH', broker: 'Binance', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2024-08-15', units: 0.92230843, price: 2946.52 }],
    targetBuy: 2400, targetSell: 4200,
    thesis: 'Smart-contract platform monopoly; L2 scaling sustains economic activity while base-layer fee burn keeps net issuance below zero. Ultrasound-money thesis requires L2 activity growth.',
    invalidation: 'ETH/BTC ratio drops below 0.02 for 60+ days, OR ETH net issuance becomes structurally positive (fee burn fails to offset new issuance).',
    reviewBy: '2026-07-01',
    journal: [],
  },
  {
    symbol: 'BTC-R', quoteSym: 'BTC', broker: 'Revolut', asset: 'Crypto',
    currency: 'USD',
    buys: [{ date: '2025-01-15', units: 0.0039, price: 80544 }],
    targetBuy: 70000, targetSell: 110000,
    thesis: 'Satellite add to main BTC position, acquired opportunistically via Revolut. Same cycle thesis as main BTC — not a separate bet.',
    invalidation: 'Same as main BTC: breaks $60K for 30+ days.',
    reviewBy: '2026-07-01',
    journal: [],
  },
  {
    symbol: 'ROTX', quoteSym: 'ROTX', broker: 'BT Bank', asset: 'Index',
    currency: 'RON', isLump: true,
    buys: [{ date: '2024-09-01', units: 900, price: 1.0 }],
    thesis: 'Very small Romanian equity exposure for local-currency diversification. Not an alpha bet — a hedge against Romanian-specific macro shifts with negligible portfolio weight.',
    invalidation: 'RON weakens materially vs EUR (>10% move in 12 months) while the Romanian economy deteriorates — at which point the hedge purpose fails.',
    reviewBy: '2026-12-01',
    journal: [],
  },
];
