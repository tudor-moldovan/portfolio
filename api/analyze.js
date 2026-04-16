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
      // Raw closes for correlation computation
      _closes: closes,
    };
  } catch {
    return null;
  }
}

// ── Fundamentals (Yahoo quoteSummary) ───────────────────────────────────
async function fetchFundamentals(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,defaultKeyStatistics,financialData,calendarEvents`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;
    const ks = r.defaultKeyStatistics || {};
    const fd = r.financialData || {};
    const pr = r.price || {};
    const ce = r.calendarEvents || {};
    const earningsDate = ce.earnings?.earningsDate?.[0]?.raw;
    return {
      trailingPE: pr.trailingPE?.raw ?? ks.trailingPE?.raw ?? null,
      forwardPE: ks.forwardPE?.raw ?? null,
      pegRatio: ks.pegRatio?.raw ?? null,
      priceToBook: ks.priceToBook?.raw ?? null,
      marketCap: pr.marketCap?.raw ?? null,
      profitMargins: fd.profitMargins?.raw ?? null,
      revenueGrowth: fd.revenueGrowth?.raw ?? null,
      earningsGrowth: fd.earningsGrowth?.raw ?? null,
      dividendYield: ks.dividendYield?.raw ?? null,
      earningsDate: earningsDate ? new Date(earningsDate * 1000).toISOString().slice(0, 10) : null,
      targetMeanPrice: fd.targetMeanPrice?.raw ?? null,
    };
  } catch { return null; }
}

// ── Per-stock news with sentiment keywords ──────────────────────────────
async function fetchStockNews(symbols) {
  const top = symbols.slice(0, 8); // limit to avoid timeouts
  const results = {};
  const settled = await Promise.allSettled(top.map(async sym => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=3&quotesCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) return { sym, items: [] };
      const data = await res.json();
      const items = (data.news || []).slice(0, 3).map(n => n.title).filter(Boolean);
      return { sym, items };
    } catch { return { sym, items: [] }; }
  }));
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.items.length) results[r.value.sym] = r.value.items;
  }
  return results;
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
function buildContext(portfolio, quotes, news, fundamentals, stockNews) {
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
    const f = fundamentals[sym];
    const fundLine = f ? ` | P/E=${f.trailingPE?.toFixed(1) ?? '?'} FwdPE=${f.forwardPE?.toFixed(1) ?? '?'} PEG=${f.pegRatio?.toFixed(2) ?? '?'} P/B=${f.priceToBook?.toFixed(1) ?? '?'} Margins=${f.profitMargins ? (f.profitMargins * 100).toFixed(0) + '%' : '?'} RevGrowth=${f.revenueGrowth ? (f.revenueGrowth * 100).toFixed(0) + '%' : '?'}${f.earningsDate ? ' Earnings=' + f.earningsDate : ''}${f.targetMeanPrice ? ' Target=$' + f.targetMeanPrice.toFixed(0) : ''}` : '';
    const newsLine = stockNews[sym] ? `\n    Headlines: ${stockNews[sym].slice(0, 2).join(' | ')}` : '';
    bySector[sec].push(
      `  ${sym} (${q.name}): $${q.price.toFixed(2)} ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% | SMA20=$${q.sma20 ? q.sma20.toFixed(2) : '?'} SMA50=$${q.sma50 ? q.sma50.toFixed(2) : '?'} RSI=${q.rsi14 ? q.rsi14.toFixed(0) : '?'} 52wk=${q.fiftyTwoWeekPosition ? q.fiftyTwoWeekPosition.toFixed(0) + '%' : '?'}${rsiLabel}${trend} | VolRatio=${q.volumeRatio ? q.volumeRatio.toFixed(1) + 'x' : '?'}${fundLine}${newsLine}`
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

  // ── News ───
  const newsText = news.length > 0
    ? news.map(h => `  • ${h}`).join('\n')
    : '  (unavailable)';

  return { totalValue, totalReturn, holdingsText, sectorText, marketText, corrText, attributionText, tradeMemory, newsText };
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
  // Fetch fundamentals for top stocks (holdings + key names)
  const fundSymbols = [...new Set([...holdingSymbols, 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'JPM', 'UNH', 'XOM', 'LLY'])].filter(s => s && !s.includes('-'));
  const newsSymbols = [...new Set([...holdingSymbols, ...WATCHLIST.slice(0, 6)])];

  const [quotes, news, fundResults, stockNews] = await Promise.all([
    fetchAllData(allSymbols),
    fetchMarketNews(),
    Promise.allSettled(fundSymbols.map(s => fetchFundamentals(s).then(f => ({ s, f })))),
    fetchStockNews(newsSymbols),
  ]);

  const fundamentals = {};
  for (const r of fundResults) {
    if (r.status === 'fulfilled' && r.value?.f) fundamentals[r.value.s] = r.value.f;
  }

  const { totalValue, totalReturn, holdingsText, sectorText, marketText, corrText, attributionText, tradeMemory, newsText } =
    buildContext(portfolio, quotes, news, fundamentals, stockNews);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `You are Claude, an autonomous AI portfolio manager running a real $50,000 portfolio. Goal: outperform S&P 500 long-term.

You have live market data with TECHNICALS, FUNDAMENTALS, CORRELATIONS, NEWS, and TRADE HISTORY.

MULTI-PERSPECTIVE ANALYSIS — You MUST analyze from 3 viewpoints before deciding:

1. VALUE INVESTOR: Focus on P/E, PEG, P/B, margins, revenue growth. Look for quality companies trading below intrinsic value. Avoid overvalued momentum names. Prefer low PEG (<1.5), strong margins, and earnings growth.

2. MOMENTUM/TECHNICAL TRADER: Focus on SMA20/50 crossovers, RSI signals, volume spikes, 52-week position. Buy uptrends and oversold bounces. Sell overbought names and broken trends.

3. CONTRARIAN/MACRO: Look at what everyone else is ignoring. Consider sector rotation, news sentiment shifts, correlation risk. When the market is greedy on tech, look at healthcare/energy. Watch for crowded trades.

TECHNICAL SIGNALS:
- SMA20/SMA50: Price above both in rising order = uptrend. Below both = downtrend.
- RSI: <30 = oversold (buy signal). >70 = overbought (sell signal).
- 52wk position: <20% = near lows (value). >80% = near highs (extended).
- Volume ratio: >1.5x = unusual activity. <0.5x = low conviction.

FUNDAMENTAL SIGNALS:
- P/E <15 = cheap, >30 = expensive (sector-dependent)
- PEG <1 = undervalued growth, >2 = overpriced
- Revenue growth >20% = high growth
- Profit margins: compare within sector
- Analyst target vs current price = upside/downside estimate

CORRELATION & RISK:
- Pairs with correlation >0.8 are effectively the same bet — diversify away
- Monitor portfolio beta — if too high, add defensive names (KO, JNJ, PG)
- Check sector concentration limits

TRADE ATTRIBUTION — Learn from your past:
- Review which trades made/lost money and why
- If a thesis was wrong, don't repeat the same mistake
- If a thesis was right, consider doubling down on similar setups

Respond with ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "TICKER",
  "name": "Company Name",
  "shares": <positive integer>,
  "estimatedPrice": <current price>,
  "rationale": "<2-3 sentences citing specific data points from technicals AND fundamentals>",
  "risks": "<1-2 sentences>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "perspectives": {
    "value": "<1 sentence: what the value investor sees>",
    "momentum": "<1 sentence: what the technical trader sees>",
    "contrarian": "<1 sentence: what the contrarian sees>"
  },
  "consensus": "<AGREE|SPLIT|DISAGREE — do perspectives align?>",
  "portfolioNote": "<1 sentence on positioning and next priorities>"
}

Constraints:
- BUY: shares × price must not exceed available cash
- SELL: only sell shares you hold
- No single position > 30% of portfolio
- Spread across 3+ sectors. Check correlation data to avoid hidden concentration
- If recommending HOLD, explain what trigger you're waiting for`;

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
    };
  }

  recommendation.quotes = frontendQuotes;
  recommendation.portfolioValue = totalValue;
  recommendation.portfolioReturn = totalReturn;

  return new Response(JSON.stringify(recommendation), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
