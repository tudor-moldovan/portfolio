export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Elite moat compounders ───────────────────────────────────────────────
const UNIVERSE = {
  AAPL: 'Tech — Ecosystem', MSFT: 'Tech — Enterprise', NVDA: 'Tech — AI Chips',
  GOOGL: 'Tech — Search/Ads', AMZN: 'Tech — Cloud/Logistics', META: 'Tech — Social',
  ASML: 'Tech — Semiconductor Equipment', TSM: 'Tech — Chip Fabrication',
  NFLX: 'Media — Streaming', V: 'Payments', MA: 'Payments',
  COST: 'Consumer — Membership', 'BRK-B': 'Diversified Conglomerate',
  LLY: 'Healthcare — GLP-1', LVMUY: 'Luxury',
  // Benchmarks
  SPY: 'Benchmark',
  // Macro
  '^VIX': 'Macro', '^TNX': 'Macro',
};
const WATCHLIST = Object.keys(UNIVERSE);

// ── Technical analysis helpers ──────────────────────────────────────────
function sma(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  // Wilder's smoothed RSI: SMA for first period, then exponential smoothing
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function computeVolatility(closes, period = 20) {
  if (closes.length < period + 1) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(252); // annualized
}

// ── Correlation helpers ─────────────────────────────────────────────────
function computeReturns(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  return r;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 30) return null;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

// ── Data fetching ───────────────────────────────────────────────────────
async function fetchChartData(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;

    const meta = result.meta;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const volumes = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || meta.chartPreviousClose || price;

    const high52 = meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : null);
    const low52 = meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : null);
    const avgVol = volumes.length > 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;

    return {
      price,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      name: meta.shortName || meta.longName || symbol,
      prevClose: prev,
      sector: UNIVERSE[symbol] || 'Unknown',
      // Technical indicators
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      rsi14: computeRSI(closes),
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52,
      fiftyTwoWeekPosition: (high52 && low52 && high52 !== low52)
        ? ((price - low52) / (high52 - low52)) * 100
        : null,
      volume: meta.regularMarketVolume,
      avgVolume: avgVol,
      volumeRatio: (meta.regularMarketVolume && avgVol) ? meta.regularMarketVolume / avgVol : null,
      volatility: computeVolatility(closes),
      _closes: closes,
    };
  } catch {
    return null;
  }
}

async function fetchMarketNews() {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v1/finance/search?q=stock+market+today&newsCount=8&quotesCount=0',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.news || []).slice(0, 8).map(n => n.title).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchAllData(symbols) {
  const unique = [...new Set(symbols)];
  const results = await Promise.allSettled(unique.map(s => fetchChartData(s)));
  const quotes = {};
  for (let i = 0; i < unique.length; i++) {
    if (results[i].status === 'fulfilled' && results[i].value) {
      quotes[unique[i]] = results[i].value;
    }
  }
  return quotes;
}

// ── Build prompt context ────────────────────────────────────────────────
function buildContext(portfolio, quotes, news) {
  const holdings = portfolio.holdings || [];
  const holdingsValue = holdings.reduce(
    (s, h) => s + h.shares * (quotes[h.symbol]?.price || h.avgCost), 0,
  );
  const totalValue = holdingsValue + (portfolio.cash || 0);
  const totalReturn = ((totalValue - 50000) / 50000) * 100;

  // ── Holdings with full data ───
  const holdingsText = holdings.length > 0
    ? holdings.map(h => {
        const q = quotes[h.symbol] || {};
        const price = q.price || h.avgCost;
        const value = h.shares * price;
        const cost = h.shares * h.avgCost;
        const pnl = ((value - cost) / cost) * 100;
        const techLine = q.sma20
          ? `  Technicals: SMA20=$${q.sma20.toFixed(2)} SMA50=${q.sma50 ? '$' + q.sma50.toFixed(2) : 'N/A'} RSI=${q.rsi14 ? q.rsi14.toFixed(0) : 'N/A'} 52wk=${q.fiftyTwoWeekPosition ? q.fiftyTwoWeekPosition.toFixed(0) + '%' : 'N/A'}`
          : '';
        return `  ${h.symbol} [${q.sector || 'Unknown'}]: ${h.shares} shares @ $${h.avgCost.toFixed(2)} avg → now $${price.toFixed(2)}, value $${value.toFixed(0)}, P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%\n${techLine}`;
      }).join('\n')
    : '  (none — 100% in cash)';

  // ── Sector allocation ───
  const sectorMap = {};
  for (const h of holdings) {
    const sec = quotes[h.symbol]?.sector || 'Unknown';
    const val = h.shares * (quotes[h.symbol]?.price || h.avgCost);
    sectorMap[sec] = (sectorMap[sec] || 0) + val;
  }
  const sectorText = Object.keys(sectorMap).length > 0
    ? Object.entries(sectorMap)
        .sort((a, b) => b[1] - a[1])
        .map(([sec, val]) => `  ${sec}: $${val.toFixed(0)} (${(val / totalValue * 100).toFixed(1)}%)`)
        .join('\n')
    : '  No sector exposure yet';

  // ── Full market data with technicals + fundamentals ───
  const bySector = {};
  for (const sym of WATCHLIST) {
    const q = quotes[sym];
    if (!q) continue;
    const sec = q.sector || 'Other';
    if (!bySector[sec]) bySector[sec] = [];
    const rsiLabel = q.rsi14 ? (q.rsi14 > 70 ? ' OVERBOUGHT' : q.rsi14 < 30 ? ' OVERSOLD' : '') : '';
    const trend = q.sma20 && q.sma50
      ? (q.price > q.sma20 && q.sma20 > q.sma50 ? ' ↑UPTREND' : q.price < q.sma20 && q.sma20 < q.sma50 ? ' ↓DOWNTREND' : '')
      : '';
    bySector[sec].push(
      `  ${sym} (${q.name}): $${q.price.toFixed(2)} ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% | SMA20=$${q.sma20 ? q.sma20.toFixed(2) : '?'} SMA50=$${q.sma50 ? q.sma50.toFixed(2) : '?'} RSI=${q.rsi14 ? q.rsi14.toFixed(0) : '?'} 52wk=${q.fiftyTwoWeekPosition ? q.fiftyTwoWeekPosition.toFixed(0) + '%' : '?'}${rsiLabel}${trend} | Vol=${q.volatility ? (q.volatility * 100).toFixed(0) + '%' : '?'}`
    );
  }
  const marketText = Object.entries(bySector)
    .map(([sec, lines]) => `[${sec}]\n${lines.join('\n')}`)
    .join('\n\n');

  // ── Correlation matrix (holdings only) ───
  const holdingSyms = holdings.map(h => h.symbol).filter(s => quotes[s]?._closes);
  let corrText = '  No holdings to correlate';
  if (holdingSyms.length >= 2) {
    const retMap = {};
    for (const s of holdingSyms) retMap[s] = computeReturns(quotes[s]._closes);
    const pairs = [];
    for (let i = 0; i < holdingSyms.length; i++) {
      for (let j = i + 1; j < holdingSyms.length; j++) {
        const c = pearson(retMap[holdingSyms[i]], retMap[holdingSyms[j]]);
        if (c != null) pairs.push({ a: holdingSyms[i], b: holdingSyms[j], r: c });
      }
    }
    // Also correlate each holding with SPY
    if (quotes['SPY']?._closes) {
      const spyRet = computeReturns(quotes['SPY']._closes);
      for (const s of holdingSyms) {
        if (s === 'SPY') continue;
        const c = pearson(retMap[s], spyRet);
        if (c != null) pairs.push({ a: s, b: 'SPY', r: c });
      }
    }
    pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    corrText = pairs.map(p => `  ${p.a} ↔ ${p.b}: ${p.r.toFixed(2)}${Math.abs(p.r) > 0.8 ? ' ⚠ HIGH' : Math.abs(p.r) > 0.6 ? ' MODERATE' : ' low'}`).join('\n');
  }

  // ── Trade attribution (how did past trades perform?) ───
  const trades = portfolio.trades || [];
  const tradeAttribution = [];
  const sells = trades.filter(t => t.action === 'SELL' && t.avgCostAtSell != null);
  for (const t of sells) {
    const gain = ((t.price - t.avgCostAtSell) / t.avgCostAtSell * 100);
    tradeAttribution.push(`  SELL ${t.symbol}: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% return${t.rationale ? ' — "' + t.rationale.slice(0, 80) + '"' : ''}`);
  }
  // Open position attribution
  for (const h of holdings) {
    const price = quotes[h.symbol]?.price || h.avgCost;
    const gain = ((price - h.avgCost) / h.avgCost * 100);
    tradeAttribution.push(`  OPEN ${h.symbol}: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% unrealized (bought @ $${h.avgCost.toFixed(2)})`);
  }
  const attributionText = tradeAttribution.length > 0 ? tradeAttribution.join('\n') : '  No trades to evaluate';

  // ── Trade history with rationales (full memory) ───
  const tradeMemory = trades.length > 0
    ? trades.map(t => {
        const d = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const rationale = t.rationale ? ` — "${t.rationale}"` : '';
        return `  ${d}: ${t.action} ${t.shares} ${t.symbol} @ $${t.price?.toFixed(2)}${rationale}`;
      }).join('\n')
    : '  None yet';

  // ── Macro environment + regime detection ───
  const vix = quotes['^VIX'];
  const tnx = quotes['^TNX'];
  const spyAboveSma50 = quotes['SPY']?.sma50 ? quotes['SPY'].price > quotes['SPY'].sma50 : null;
  let marketRegime = 'UNKNOWN';
  let macroText = '';
  if (vix) {
    if (vix.price < 15) marketRegime = spyAboveSma50 ? 'RISK_ON' : 'NORMAL';
    else if (vix.price < 25) marketRegime = 'NORMAL';
    else if (vix.price < 35) marketRegime = 'CAUTIOUS';
    else marketRegime = 'RISK_OFF';
    const regimeGuide = { RISK_ON: 'aggressive — full position sizes', NORMAL: 'standard — normal sizing', CAUTIOUS: 'reduce positions 50%, favor defensive', RISK_OFF: 'defensive only — raise cash, no new buys' };
    macroText += `  VIX: ${vix.price.toFixed(1)} | SPY trend: ${spyAboveSma50 ? 'above' : 'below'} SMA50\n`;
    macroText += `  MARKET REGIME: ${marketRegime} — ${regimeGuide[marketRegime] || ''}\n`;
  }
  if (tnx) macroText += `  10Y Treasury Yield: ${tnx.price.toFixed(2)}%\n`;
  if (!macroText) macroText = '  (unavailable)';

  // ── News ───
  const newsText = news.length > 0
    ? news.map(h => `  • ${h}`).join('\n')
    : '  (unavailable)';

  return { totalValue, totalReturn, holdingsText, sectorText, marketText, corrText, attributionText, tradeMemory, macroText, newsText };
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on this deployment.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const { portfolio, question } = body;
  if (!portfolio) {
    return new Response(JSON.stringify({ error: 'portfolio is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Fetch all data in parallel: charts, news, fundamentals, per-stock news
  const holdingSymbols = (portfolio.holdings || []).map(h => h.symbol);
  const allSymbols = [...new Set([...holdingSymbols, ...WATCHLIST])];

  const [quotes, news] = await Promise.all([fetchAllData(allSymbols), fetchMarketNews()]);

  const { totalValue, totalReturn, holdingsText, sectorText, marketText, corrText, attributionText, tradeMemory, macroText, newsText } =
    buildContext(portfolio, quotes, news);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `You are Claude, a moat-focused portfolio advisor managing a $50,000 portfolio of elite compounders. Your universe is 15 wide-moat businesses — you think like Munger, not a day trader.

YOUR FRAMEWORK — for every recommendation, assess three things:

1. MOAT DURABILITY: Is the competitive advantage strengthening or eroding?
   - FORTRESS: Monopoly/duopoly, no substitute exists (ASML, TSM, V/MA)
   - STRONG: High switching costs, network effects, brand power (AAPL, MSFT, GOOGL)
   - INTACT: Moat exists but faces emerging threats (META vs TikTok, NFLX vs streaming wars)
   - ERODING: Competitive position weakening (flag this clearly)

2. VALUATION ATTRACTIVENESS: Is the price right?
   - Use 52-week position as a proxy for valuation timing
   - Near lows (<20%) = potential value. Near highs (>80%) = patience required
   - RSI <30 on a moat stock = high-conviction entry. RSI >70 = wait for pullback
   - Compare current setup to the stock's own history, not to other stocks

3. CATALYST / TRIGGER: What specific event would change your view?
   - Name ONE metric or event that would make you upgrade or downgrade
   - e.g., "If NVDA data center revenue growth drops below 40%, downgrade"
   - e.g., "If ASML order book accelerates, upgrade to BUY ZONE"

TECHNICAL SIGNALS (for timing entries, not for thesis):
- SMA20/SMA50 trend: confirms momentum direction
- RSI: oversold bounces on moat stocks are high-conviction entries
- Volatility: size positions inversely to vol (high vol = fewer shares)

Respond with ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "TICKER",
  "name": "Company Name",
  "shares": <positive integer>,
  "estimatedPrice": <current price>,
  "moatRating": "FORTRESS | STRONG | INTACT | ERODING",
  "moatRationale": "<1-2 sentences on why the moat is this rating>",
  "valuationVerdict": "UNDERVALUED | FAIR | RICH | OVERVALUED",
  "convictionScore": <1-10 number>,
  "rationale": "<2-3 sentences: the investment thesis citing specific data>",
  "risks": "<1-2 sentences>",
  "catalyst": "<the ONE thing that would change your recommendation>",
  "confidence": "HIGH | MEDIUM | LOW",
  "portfolioNote": "<1 sentence on overall positioning>"
}

Constraints:
- BUY only within the moat universe or current holdings
- shares × price must not exceed available cash
- No single position > 30% of portfolio
- Think in years, not days — recommend 1-2 high-conviction moves, not frequent trades
- If HOLD, explain exactly what price or event would trigger a BUY`;

  const userMsg = `Date: ${today}

═══ PORTFOLIO STATUS ═══
Total Value: $${totalValue.toFixed(2)} (started $50,000)
Total Return: ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%
Cash Available: $${(portfolio.cash || 0).toFixed(2)}

═══ CURRENT HOLDINGS ═══
${holdingsText}

═══ SECTOR ALLOCATION ═══
${sectorText}

═══ CORRELATION MATRIX (holdings) ═══
${corrText}

═══ TRADE ATTRIBUTION (how did past trades perform?) ═══
${attributionText}

═══ FULL TRADE HISTORY & RATIONALES ═══
${tradeMemory}

═══ LIVE MARKET DATA (technicals + fundamentals + news) ═══
${marketText || '(unavailable)'}

═══ MACRO ENVIRONMENT ═══
${macroText}

═══ TODAY'S MARKET NEWS ═══
${newsText}

${question ? `QUESTION: ${question}` : 'Analyze from all 3 perspectives (value, momentum, contrarian). What is your next recommended move?'}`;

  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Could not reach Claude API: ' + e.message }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return new Response(
      JSON.stringify({ error: `Claude API error (${claudeRes.status})`, detail: errText }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  const claudeData = await claudeRes.json();
  const textBlock = claudeData.content?.find(b => b.type === 'text');
  const rawText = textBlock?.text?.trim() || '';

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return new Response(
      JSON.stringify({ error: 'Unexpected response format from Claude', raw: rawText.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  let recommendation;
  try { recommendation = JSON.parse(jsonMatch[0]); } catch {
    return new Response(
      JSON.stringify({ error: 'Could not parse Claude recommendation', raw: rawText.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  // Override with live price for accuracy
  if (recommendation.symbol && quotes[recommendation.symbol]) {
    recommendation.estimatedPrice = quotes[recommendation.symbol].price;
  }

  // Attach quote data for the frontend
  const frontendQuotes = {};
  for (const [sym, q] of Object.entries(quotes)) {
    frontendQuotes[sym] = {
      price: q.price,
      changePercent: q.changePercent,
      name: q.name,
      prevClose: q.prevClose,
      sector: q.sector,
      earningsDate: fundamentals[sym]?.earningsDate || null,
    };
  }

  recommendation.quotes = frontendQuotes;
  recommendation.portfolioValue = totalValue;
  recommendation.portfolioReturn = totalReturn;
  recommendation.marketRegime = marketRegime;

  return new Response(JSON.stringify(recommendation), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
