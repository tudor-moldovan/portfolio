export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

// ── Universe (12 moat compounders + SPY benchmark) ──────────────────────
const UNIVERSE = {
  AAPL: 'Tech — Platform', MSFT: 'Tech — Platform', GOOGL: 'Tech — Platform',
  AMZN: 'Tech — Platform', META: 'Tech — Platform',
  NVDA: 'Tech — AI/Chips', ASML: 'Tech — AI/Chips', TSM: 'Tech — AI/Chips',
  V: 'Payments', MA: 'Payments',
  NFLX: 'Consumer',
  'BRK-B': 'Conglomerate',
};
const TICKERS = Object.keys(UNIVERSE);

// ── Technical indicators ────────────────────────────────────────────────
function sma(arr, period) {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d >= 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

// ── Fetch 1-year chart data ─────────────────────────────────────────────
async function fetchChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.chart?.result?.[0];
    if (!r?.meta?.regularMarketPrice) return null;
    const meta = r.meta;
    const closes = (r.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;
    const high52 = meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : null);
    const low52 = meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : null);
    return {
      price,
      name: meta.shortName || meta.longName || symbol,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      high52, low52,
      fiftyTwoWeekPosition: (high52 && low52 && high52 !== low52) ? ((price - low52) / (high52 - low52)) * 100 : null,
      sma50: sma(closes, 50),
      sma200: sma(closes, 200),
      rsi: computeRSI(closes),
      yearReturn: closes.length > 1 ? ((price - closes[0]) / closes[0]) * 100 : null,
      marketCap: meta.marketCap,
    };
  } catch { return null; }
}

// ── Fetch fundamentals (reuses /api/fundamentals endpoint for caching) ─
async function fetchFundamentals(symbol, reqUrl) {
  try {
    const origin = new URL(reqUrl).origin;
    const res = await fetch(`${origin}/api/fundamentals?symbol=${symbol}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Enrich a single ticker with all data ────────────────────────────────
async function enrichStock(symbol, reqUrl) {
  const [chart, fund] = await Promise.all([fetchChart(symbol), fetchFundamentals(symbol, reqUrl)]);
  return { symbol, sector: UNIVERSE[symbol], chart, fund };
}

// ── Compute peer valuation (average P/E within sector from our data) ───
function computePeerContext(stocks) {
  const bySector = {};
  for (const s of stocks) {
    const pe = s.fund?.ratios?.find(r => r.peRatio)?.peRatio;
    if (!pe || pe <= 0 || pe > 200) continue;
    if (!bySector[s.sector]) bySector[s.sector] = [];
    bySector[s.sector].push({ symbol: s.symbol, pe });
  }
  const peerAvg = {};
  for (const [sector, list] of Object.entries(bySector)) {
    if (list.length < 2) continue;
    const avg = list.reduce((sum, p) => sum + p.pe, 0) / list.length;
    for (const p of list) peerAvg[p.symbol] = { sectorAvgPE: avg, pe: p.pe, vsPeers: p.pe < avg * 0.9 ? 'CHEAPER' : p.pe > avg * 1.1 ? 'RICHER' : 'IN-LINE' };
  }
  return peerAvg;
}

// ── Compute vs-history valuation proxy (using 5yr P/E trend) ───────────
function computeHistoryContext(fund) {
  const ratios = fund?.ratios || [];
  const pes = ratios.map(r => r.peRatio).filter(p => p != null && p > 0 && p < 200);
  if (pes.length < 3) return null;
  const current = pes[pes.length - 1];
  const historical = pes.slice(0, -1);
  const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
  const min = Math.min(...historical);
  const max = Math.max(...historical);
  const vsHistory = current < avg * 0.9 ? 'CHEAP_VS_HISTORY' : current > avg * 1.1 ? 'EXPENSIVE_VS_HISTORY' : 'IN-LINE_WITH_HISTORY';
  return { currentPE: current, historicalAvgPE: avg, minPE: min, maxPE: max, vsHistory, yearsOfData: pes.length };
}

// ── Build the per-stock context block for Claude ────────────────────────
function buildStockBlock(s, peerAvg) {
  const c = s.chart || {};
  const f = s.fund || {};
  const moat = f.moat || {};
  const inc = f.incomeStatement?.slice(-5) || [];
  const cf = f.cashFlow?.slice(-5) || [];
  const latestRatios = f.ratios?.[f.ratios.length - 1] || {};
  const hist = computeHistoryContext(f);
  const peer = peerAvg[s.symbol];

  const lines = [];
  lines.push(`═══ ${s.symbol} (${c.name || f.name || s.symbol}) — ${s.sector} ═══`);
  lines.push(`Price: $${c.price?.toFixed(2) || '?'} | 52wk: $${c.low52?.toFixed(0)}—$${c.high52?.toFixed(0)} (${c.fiftyTwoWeekPosition?.toFixed(0) || '?'}% of range)`);
  lines.push(`1Y return: ${c.yearReturn?.toFixed(1) || '?'}% | SMA50: $${c.sma50?.toFixed(2) || '?'} | SMA200: $${c.sma200?.toFixed(2) || '?'} | RSI: ${c.rsi?.toFixed(0) || '?'}`);
  lines.push(`Market cap: $${c.marketCap ? (c.marketCap / 1e9).toFixed(0) + 'B' : '?'}`);

  if (inc.length) {
    lines.push('\nFUNDAMENTALS (5yr):');
    for (const y of inc) {
      lines.push(`  ${y.year}: Rev $${y.revenue ? (y.revenue / 1e9).toFixed(1) + 'B' : '?'} | Gross ${y.grossMargin ? (y.grossMargin * 100).toFixed(0) + '%' : '?'} | Net ${y.netMargin ? (y.netMargin * 100).toFixed(0) + '%' : '?'} | EPS $${y.eps?.toFixed(2) || '?'}`);
    }
  }
  if (cf.length) {
    const lastCF = cf[cf.length - 1];
    lines.push(`Latest FCF: $${lastCF.freeCashFlow ? (lastCF.freeCashFlow / 1e9).toFixed(1) + 'B' : '?'}`);
  }

  if (moat.moatScore != null) {
    lines.push(`\nQUANT MOAT: ${moat.moatScore}/100 (${moat.rating})`);
    const mc = moat.components || {};
    if (mc.grossMargin) lines.push(`  Gross margin: avg ${mc.grossMargin.avg?.toFixed(0)}%, vol ${mc.grossMargin.volatility?.toFixed(1)}pp`);
    if (mc.revenueGrowth) lines.push(`  Revenue CAGR: ${mc.revenueGrowth.cagr?.toFixed(1)}% | ${mc.revenueGrowth.positiveYears?.toFixed(0)}% positive years`);
    if (mc.roic) lines.push(`  ${mc.roic.metric || 'ROIC'}: avg ${mc.roic.avg?.toFixed(0)}%`);
    if (mc.fcf) lines.push(`  FCF margin: avg ${mc.fcf.avgMargin?.toFixed(0)}%`);
    if (mc.health) lines.push(`  Debt/Equity: ${mc.health.debtToEquity?.toFixed(2)}`);
  }

  lines.push('\nVALUATION CONTEXT:');
  if (latestRatios.peRatio) lines.push(`  Current P/E: ${latestRatios.peRatio.toFixed(1)}`);
  if (hist) lines.push(`  5yr P/E range: ${hist.minPE.toFixed(1)}—${hist.maxPE.toFixed(1)} (avg ${hist.historicalAvgPE.toFixed(1)}) → ${hist.vsHistory}`);
  if (peer) lines.push(`  Peer P/E avg: ${peer.sectorAvgPE.toFixed(1)} → ${peer.vsPeers}`);

  return lines.join('\n');
}

// ── Claude call: rank all 12 stocks ─────────────────────────────────────
async function rankUniverse(stocks, macroContext, apiKey) {
  const peerAvg = computePeerContext(stocks);
  const blocks = stocks.map(s => buildStockBlock(s, peerAvg)).join('\n\n');

  const systemPrompt = `You are a senior equity analyst covering a universe of 12 elite moat compounders. Your job: screen the universe and produce a ranked research report.

For EACH stock, assess:
1. MOAT HEALTH — is the competitive advantage STRENGTHENING, STABLE, or WEAKENING? Use the quant moat score as baseline (don't override it) but explain WHY the data supports it. Name the specific moat type (scale economies / network effect / switching costs / regulatory / brand).
2. FUNDAMENTALS — are revenue/margins/FCF growing, stable, or deteriorating? Cite specific numbers.
3. VALUATION — use both the vs-history and vs-peers signals provided. Is it CHEAP, FAIR, or EXPENSIVE relative to its OWN past and to its peers?
4. VERDICT — combine all three: BUY_ZONE (strong moat + cheap) / ACCUMULATE (strong moat, fair price) / HOLD (neutral) / WATCH (weakening or expensive) / AVOID (broken).
5. ENTRY ZONE — the $price range where this stock is a clear buy given your analysis.

RULES:
- Never invent numbers. Only cite what's in the data.
- Be specific: "AAPL gross margin expanded from 38% to 44% over 5 years" not "strong margins".
- BUY_ZONE requires: moat STRENGTHENING or STABLE + valuation CHEAP_VS_HISTORY or CHEAPER than peers.
- Rank by convictionScore (1-10) descending.

Respond with ONLY valid JSON:
{
  "regime": "RISK_ON | NORMAL | CAUTIOUS | RISK_OFF",
  "regimeNote": "<1 sentence on macro context>",
  "stocks": [
    {
      "symbol": "TICKER",
      "moatRating": "FORTRESS | STRONG | INTACT | ERODING",
      "moatType": "<1-3 word moat type, e.g. 'Network effect'>",
      "moatHealth": "STRENGTHENING | STABLE | WEAKENING",
      "moatThesis": "<1 sentence citing specific margins/ROIC/growth>",
      "fundamentalsVerdict": "IMPROVING | STABLE | DETERIORATING",
      "fundamentalsNote": "<1 sentence citing revenue/margin/FCF trend>",
      "valuationVerdict": "UNDERVALUED | FAIR | RICH | OVERVALUED",
      "valuationNote": "<1-2 sentences: P/E vs history, P/E vs peers, FCF yield>",
      "verdict": "BUY_ZONE | ACCUMULATE | HOLD | WATCH | AVOID",
      "convictionScore": <1-10 integer>,
      "thesis": "<2 sentences — the big-picture take>",
      "bullCase": "<1 sentence>",
      "bearCase": "<1 sentence>",
      "entryZone": "$X - $Y",
      "keyRisk": "<1 sentence>",
      "catalyst": "<the ONE thing that would change your rating>"
    }
  ]
}`;

  const userMsg = `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

═══ MACRO CONTEXT ═══
${macroContext}

═══ UNIVERSE DATA ═══
${blocks}

Produce the ranked screening report now.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]);
}

// ── Macro snapshot (VIX, 10Y, SPY trend) ────────────────────────────────
async function fetchMacro() {
  const lines = [];
  try {
    const [vixRes, tnxRes, spyRes] = await Promise.all([
      fetchChart('^VIX'), fetchChart('^TNX'), fetchChart('SPY'),
    ]);
    if (vixRes) lines.push(`VIX: ${vixRes.price.toFixed(1)} (${vixRes.price < 15 ? 'calm' : vixRes.price < 25 ? 'normal' : vixRes.price < 35 ? 'stressed' : 'panic'})`);
    if (tnxRes) lines.push(`10Y Treasury: ${tnxRes.price.toFixed(2)}%`);
    if (spyRes) {
      const above = spyRes.sma50 ? spyRes.price > spyRes.sma50 : null;
      lines.push(`SPY: $${spyRes.price.toFixed(2)} (${above === null ? '?' : above ? 'above' : 'below'} 50-day SMA, 1Y ${spyRes.yearReturn?.toFixed(1) || '?'}%)`);
    }
  } catch {}
  return lines.length ? lines.map(l => '  ' + l).join('\n') : '  (unavailable)';
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on this deployment.' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // Fetch all stocks + macro in parallel
    const [stocks, macroContext] = await Promise.all([
      Promise.all(TICKERS.map(t => enrichStock(t, req.url))),
      fetchMacro(),
    ]);

    // Filter out stocks where we couldn't get a price
    const valid = stocks.filter(s => s.chart?.price);
    if (valid.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Could not fetch market data for any ticker.' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // One big Claude call to rank the universe
    const ranked = await rankUniverse(valid, macroContext, apiKey);

    // Merge Claude's per-stock assessments with our live data
    const byClaudeSymbol = {};
    for (const s of (ranked.stocks || [])) byClaudeSymbol[s.symbol] = s;

    const output = valid.map(s => {
      const c = s.chart || {};
      const f = s.fund || {};
      const claude = byClaudeSymbol[s.symbol] || {};
      return {
        symbol: s.symbol,
        sector: s.sector,
        name: c.name || f.name || s.symbol,
        price: c.price,
        changePercent: c.changePercent,
        high52: c.high52,
        low52: c.low52,
        fiftyTwoWeekPosition: c.fiftyTwoWeekPosition,
        rsi: c.rsi,
        sma50: c.sma50,
        sma200: c.sma200,
        yearReturn: c.yearReturn,
        marketCap: c.marketCap,
        moatScore: f.moat?.moatScore || null,
        moatComponents: f.moat?.components || null,
        ...claude,
      };
    });

    // Sort by conviction descending (Claude should do this, but enforce)
    output.sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0));

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        regime: ranked.regime || 'UNKNOWN',
        regimeNote: ranked.regimeNote || '',
        stocks: output,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=600, s-maxage=600',
          ...CORS,
        },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Screen failed: ' + (e.message || String(e)) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }
}
