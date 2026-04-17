export const config = { maxDuration: 60 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

const UNIVERSE = {
  AAPL: 'Tech — Platform', MSFT: 'Tech — Platform', GOOGL: 'Tech — Platform',
  AMZN: 'Tech — Platform', META: 'Tech — Platform',
  NVDA: 'Tech — AI/Chips', ASML: 'Tech — AI/Chips', TSM: 'Tech — AI/Chips',
  V: 'Payments', MA: 'Payments',
  NFLX: 'Consumer',
  'BRK-B': 'Conglomerate',
};
const TICKERS = Object.keys(UNIVERSE);
const CACHE_KEY = 'screener_v1';

// ── KV helpers (graceful if KV isn't configured) ────────────────────────
async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
async function getCached(kv) {
  if (!kv) return null;
  try {
    const raw = await kv.get(CACHE_KEY);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}
async function setCached(kv, data) {
  if (!kv) return;
  try { await kv.set(CACHE_KEY, JSON.stringify(data), { ex: 7 * 24 * 3600 }); } catch {}
}

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

async function fetchChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
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

async function fetchFundamentals(symbol, reqUrl) {
  try {
    const origin = new URL(reqUrl).origin;
    const res = await fetch(`${origin}/api/fundamentals?symbol=${symbol}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function enrichStock(symbol, reqUrl) {
  const [chart, fund] = await Promise.all([fetchChart(symbol), fetchFundamentals(symbol, reqUrl)]);
  return { symbol, sector: UNIVERSE[symbol], chart, fund };
}

// ── Peer P/E context (within universe sector) ──────────────────────────
function computePeerContext(stocks) {
  const bySector = {};
  for (const s of stocks) {
    const pe = s.fund?.ratios?.find(r => r.peRatio)?.peRatio;
    if (!pe || pe <= 0 || pe > 200) continue;
    if (!bySector[s.sector]) bySector[s.sector] = [];
    bySector[s.sector].push({ symbol: s.symbol, pe });
  }
  const peerAvg = {};
  for (const [, list] of Object.entries(bySector)) {
    if (list.length < 2) continue;
    const avg = list.reduce((sum, p) => sum + p.pe, 0) / list.length;
    for (const p of list) peerAvg[p.symbol] = { sectorAvgPE: avg, pe: p.pe, vsPeers: p.pe < avg * 0.9 ? 'CHEAPER' : p.pe > avg * 1.1 ? 'RICHER' : 'IN-LINE' };
  }
  return peerAvg;
}

// ── 5yr P/E history context ────────────────────────────────────────────
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

const SYSTEM_PROMPT = `You are a senior equity analyst covering elite moat compounders. For each stock in the batch, produce a concise research assessment.

For EACH stock, decide:
1. MOAT HEALTH — STRENGTHENING, STABLE, or WEAKENING. Use the quant moat score as baseline. Name the moat type (scale economies / network effect / switching costs / regulatory / brand).
2. FUNDAMENTALS — IMPROVING / STABLE / DETERIORATING. Cite specific numbers.
3. VALUATION — use vs-history and vs-peers signals. UNDERVALUED / FAIR / RICH / OVERVALUED.
4. VERDICT — combine: BUY_ZONE / ACCUMULATE / HOLD / WATCH / AVOID.
5. ENTRY ZONE — $X - $Y price range where this is a clear buy.

RULES:
- Never invent numbers. Cite only what's in the data.
- Be specific: "gross margin expanded from 38% to 44%" not "strong margins".
- BUY_ZONE requires: moat STRENGTHENING or STABLE + valuation cheap vs history or peers.

Respond with ONLY valid JSON matching this schema exactly:
{"stocks":[{"symbol":"TICKER","moatRating":"FORTRESS|STRONG|INTACT|ERODING","moatType":"<1-3 words>","moatHealth":"STRENGTHENING|STABLE|WEAKENING","moatThesis":"<1 sentence with numbers>","fundamentalsVerdict":"IMPROVING|STABLE|DETERIORATING","fundamentalsNote":"<1 sentence with numbers>","valuationVerdict":"UNDERVALUED|FAIR|RICH|OVERVALUED","valuationNote":"<1-2 sentences>","verdict":"BUY_ZONE|ACCUMULATE|HOLD|WATCH|AVOID","convictionScore":<1-10>,"thesis":"<2 sentences>","bullCase":"<1 sentence>","bearCase":"<1 sentence>","entryZone":"$X - $Y","keyRisk":"<1 sentence>","catalyst":"<1 sentence>"}]}`;

async function analyzeBatch(stockBlocks, macroContext, apiKey) {
  const userMsg = `Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

MACRO:
${macroContext}

STOCKS:
${stockBlocks.join('\n\n')}

Return JSON for all stocks in this batch.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  // Parse SSE stream — each delta resets the idle timer so we don't hit
  // undici's stream-idle-timeout on non-streaming endpoints.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            accumulated += evt.delta.text || '';
          } else if (evt.type === 'error') {
            throw new Error(`Anthropic stream error: ${evt.error?.message || JSON.stringify(evt.error).slice(0, 200)}`);
          }
        } catch (e) {
          // Re-throw Anthropic errors; ignore malformed JSON fragments
          if (e.message?.startsWith('Anthropic stream error')) throw e;
        }
      }
    }
  }

  const match = accumulated.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]);
}

async function analyzeBatchWithRetry(stockBlocks, macroContext, apiKey) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await analyzeBatch(stockBlocks, macroContext, apiKey);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}

function deriveRegime(macroContext) {
  const vixMatch = macroContext.match(/VIX:\s*([\d.]+)/);
  const spyAbove = /above 50-day/.test(macroContext);
  if (!vixMatch) return { regime: 'UNKNOWN', note: 'Macro data unavailable.' };
  const vix = parseFloat(vixMatch[1]);
  let regime, note;
  if (vix < 15) { regime = spyAbove ? 'RISK_ON' : 'NORMAL'; note = `VIX calm at ${vix.toFixed(1)}; SPY ${spyAbove ? 'above' : 'below'} 50-day SMA.`; }
  else if (vix < 25) { regime = 'NORMAL'; note = `VIX at ${vix.toFixed(1)} — normal volatility regime.`; }
  else if (vix < 35) { regime = 'CAUTIOUS'; note = `VIX elevated at ${vix.toFixed(1)} — reduce position sizes.`; }
  else { regime = 'RISK_OFF'; note = `VIX at ${vix.toFixed(1)} — defensive posture, raise cash.`; }
  return { regime, note };
}

// ── Rank universe: 3 parallel batches of ~4 stocks each ────────────────
async function rankUniverse(stocks, macroContext, apiKey) {
  const peerAvg = computePeerContext(stocks);
  const blocks = stocks.map(s => buildStockBlock(s, peerAvg));

  const BATCH_SIZE = 4;
  const batches = [];
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) batches.push(blocks.slice(i, i + BATCH_SIZE));

  // Each batch Promise catches its own failure so one slow batch doesn't kill the whole run
  const results = await Promise.all(
    batches.map(batch =>
      analyzeBatchWithRetry(batch, macroContext, apiKey)
        .catch(e => ({ stocks: [], error: e.message })),
    ),
  );

  const { regime, note } = deriveRegime(macroContext);
  const stocksOut = [];
  const errors = [];
  for (const r of results) {
    if (r.stocks) stocksOut.push(...r.stocks);
    if (r.error) errors.push(r.error);
  }
  return { regime, regimeNote: note, stocks: stocksOut, errors };
}

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

async function runScreener(reqUrl) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const [stocks, macroContext] = await Promise.all([
    Promise.all(TICKERS.map(t => enrichStock(t, reqUrl))),
    fetchMacro(),
  ]);

  const valid = stocks.filter(s => s.chart?.price);
  if (valid.length === 0) throw new Error('Could not fetch market data for any ticker.');

  const ranked = await rankUniverse(valid, macroContext, apiKey);

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

  // Sort by conviction descending
  output.sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0));

  return {
    timestamp: new Date().toISOString(),
    regime: ranked.regime || 'UNKNOWN',
    regimeNote: ranked.regimeNote || '',
    batchErrors: ranked.errors?.length ? ranked.errors : undefined,
    stocks: output,
  };
}

// ── Handler: GET returns cached, POST runs fresh ────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const kv = await getKV();

  // GET — return cached
  if (req.method === 'GET') {
    const cached = await getCached(kv);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: 'No cached screen yet. POST /api/screen to run.' }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // POST — run fresh pipeline, cache result
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const output = await runScreener(req.url);
    await setCached(kv, output);
    return new Response(JSON.stringify(output), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (e) {
    // On failure, fall back to cached if we have it
    const cached = await getCached(kv);
    if (cached) {
      return new Response(
        JSON.stringify({ ...cached, cached: true, warning: 'Live run failed, showing cached: ' + (e.message || String(e)) }),
        { headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'Screen failed: ' + (e.message || String(e)) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }
}
