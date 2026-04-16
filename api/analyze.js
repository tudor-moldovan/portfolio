export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Expanded universe across all major sectors ──────────────────────────
const UNIVERSE = {
  // Technology
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology',
  GOOGL: 'Technology', AMZN: 'Technology', META: 'Technology',
  CRM: 'Technology', AMD: 'Technology', AVGO: 'Technology', ORCL: 'Technology',
  // Financials
  JPM: 'Financials', V: 'Financials', 'BRK-B': 'Financials',
  GS: 'Financials', MA: 'Financials',
  // Healthcare
  UNH: 'Healthcare', JNJ: 'Healthcare', LLY: 'Healthcare',
  PFE: 'Healthcare', ABBV: 'Healthcare',
  // Energy
  XOM: 'Energy', CVX: 'Energy',
  // Consumer Defensive
  WMT: 'Consumer', KO: 'Consumer', PG: 'Consumer', COST: 'Consumer',
  // Industrials
  CAT: 'Industrials', GE: 'Industrials', HON: 'Industrials',
  // ETFs / Benchmarks
  SPY: 'ETF', QQQ: 'ETF', DIA: 'ETF', IWM: 'ETF',
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
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
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

  // ── Full market data with technicals ───
  const bySector = {};
  for (const sym of WATCHLIST) {
    const q = quotes[sym];
    if (!q) continue;
    const sec = q.sector || 'Other';
    if (!bySector[sec]) bySector[sec] = [];
    const rsiLabel = q.rsi14
      ? (q.rsi14 > 70 ? ' OVERBOUGHT' : q.rsi14 < 30 ? ' OVERSOLD' : '')
      : '';
    const trend = q.sma20 && q.sma50
      ? (q.price > q.sma20 && q.sma20 > q.sma50 ? ' ↑UPTREND' : q.price < q.sma20 && q.sma20 < q.sma50 ? ' ↓DOWNTREND' : '')
      : '';
    bySector[sec].push(
      `  ${sym} (${q.name}): $${q.price.toFixed(2)} ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% today | SMA20=$${q.sma20 ? q.sma20.toFixed(2) : '?'} SMA50=$${q.sma50 ? q.sma50.toFixed(2) : '?'} RSI=${q.rsi14 ? q.rsi14.toFixed(0) : '?'} 52wk=${q.fiftyTwoWeekPosition ? q.fiftyTwoWeekPosition.toFixed(0) + '%' : '?'}${rsiLabel}${trend} | Vol ratio=${q.volumeRatio ? q.volumeRatio.toFixed(1) + 'x' : '?'}`
    );
  }
  const marketText = Object.entries(bySector)
    .map(([sec, lines]) => `[${sec}]\n${lines.join('\n')}`)
    .join('\n\n');

  // ── Trade history with rationales (full memory) ───
  const trades = portfolio.trades || [];
  const tradeMemory = trades.length > 0
    ? trades.map(t => {
        const d = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const rationale = t.rationale ? ` — "${t.rationale}"` : '';
        return `  ${d}: ${t.action} ${t.shares} ${t.symbol} @ $${t.price?.toFixed(2)}${rationale}`;
      }).join('\n')
    : '  None yet';

  // ── News ───
  const newsText = news.length > 0
    ? news.map(h => `  • ${h}`).join('\n')
    : '  (unavailable)';

  return { totalValue, totalReturn, holdingsText, sectorText, marketText, tradeMemory, newsText };
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

  // Fetch market data + news in parallel
  const holdingSymbols = (portfolio.holdings || []).map(h => h.symbol);
  const allSymbols = [...new Set([...holdingSymbols, ...WATCHLIST])];
  const [quotes, news] = await Promise.all([fetchAllData(allSymbols), fetchMarketNews()]);

  const { totalValue, totalReturn, holdingsText, sectorText, marketText, tradeMemory, newsText } =
    buildContext(portfolio, quotes, news);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `You are Claude, an autonomous AI stock portfolio manager running a real $50,000 portfolio. Your goal is to outperform the S&P 500 over the long term through intelligent, data-driven decisions.

You have access to live market data with technical indicators. Use them:
- **SMA20/SMA50 crossovers**: Price above both SMAs in rising order = uptrend. Price below both = downtrend. Crossovers signal momentum shifts.
- **RSI (14-day)**: Below 30 = oversold (potential buy). Above 70 = overbought (potential sell/avoid). 40-60 = neutral.
- **52-week position**: Below 20% = near lows (potential value). Above 80% = near highs (momentum or overextended).
- **Volume ratio**: Above 1.5x = unusual activity (something is happening). Below 0.5x = low conviction move.

Strategy guidelines:
- Look for stocks with strong fundamentals trading at reasonable valuations (growth at a reasonable price)
- Use technical signals to TIME entries — buy uptrends, buy oversold bounces, avoid overbought names
- Consider sector rotation and macro trends visible in the news headlines
- Maintain diversification: no single position > 30% of portfolio, spread across 3+ sectors
- You can recommend ANY publicly traded US stock — not limited to the watchlist
- Review your past trade rationales to maintain a coherent investment thesis over time

You MUST respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "TICKER",
  "name": "Company Name",
  "shares": <positive integer>,
  "estimatedPrice": <current price number>,
  "rationale": "<2-3 sentences: specific data-driven thesis referencing technicals/fundamentals>",
  "risks": "<1-2 sentences on key risks>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "portfolioNote": "<1 sentence on overall portfolio positioning and next priorities>"
}

Constraints:
- BUY: shares × price must not exceed available cash
- SELL: can only sell shares you actually hold
- If recommending HOLD, still provide a portfolioNote explaining what you're watching for`;

  const userMsg = `Date: ${today}

═══ PORTFOLIO STATUS ═══
Total Value: $${totalValue.toFixed(2)} (started $50,000)
Total Return: ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%
Cash Available: $${(portfolio.cash || 0).toFixed(2)}

═══ CURRENT HOLDINGS ═══
${holdingsText}

═══ SECTOR ALLOCATION ═══
${sectorText}

═══ FULL TRADE HISTORY & RATIONALES ═══
${tradeMemory}

═══ LIVE MARKET DATA (with technicals) ═══
${marketText || '(unavailable)'}

═══ TODAY'S MARKET NEWS ═══
${newsText}

${question ? `QUESTION: ${question}` : 'Analyze the data above. What is your next recommended move?'}`;

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
        max_tokens: 2048,
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
    };
  }

  recommendation.quotes = frontendQuotes;
  recommendation.portfolioValue = totalValue;
  recommendation.portfolioReturn = totalReturn;

  return new Response(JSON.stringify(recommendation), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
