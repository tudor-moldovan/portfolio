import { getFundamentalsWithCache } from '../lib/moat.js';

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
const STATUS_KEY = CACHE_KEY + ':status';
const DATA_KEY = 'screener:data';
const BATCH_KEY = (n) => `screener:batch:${n}`;

// ── KV helpers ─────────────────────────────────────────────────────────
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
async function setStatus(kv, status) {
  if (!kv) return;
  try { await kv.set(STATUS_KEY, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }), { ex: 3600 }); } catch {}
}
async function getStatus(kv) {
  if (!kv) return null;
  try {
    const raw = await kv.get(STATUS_KEY);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
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

// In-process fundamentals fetch with KV cache (24h TTL).
// No HTTP self-call — that was causing the screener 504s on cold starts.
async function enrichStock(symbol, kv) {
  const [chart, fund] = await Promise.all([
    fetchChart(symbol),
    getFundamentalsWithCache(symbol, kv).catch(() => null),
  ]);
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

// ── Step 1: Fetch raw market data for all 12 stocks + macro context ───
async function stepFetchData(kv) {
  const [stocks, macroContext] = await Promise.all([
    Promise.all(TICKERS.map(t => enrichStock(t, kv))),
    fetchMacro(),
  ]);
  const valid = stocks.filter(s => s.chart?.price);
  if (valid.length === 0) throw new Error('No live prices fetched.');

  // Pre-compute per-stock context blocks so the analyze step is pure Claude
  const peerAvg = computePeerContext(valid);
  const blocks = valid.map(s => ({ symbol: s.symbol, block: buildStockBlock(s, peerAvg) }));

  const dataPayload = {
    timestamp: new Date().toISOString(),
    macroContext,
    regime: deriveRegime(macroContext),
    blocks, // [{symbol, block: '...formatted text...'}, ...]
    stocks: valid.map(s => ({
      symbol: s.symbol,
      sector: s.sector,
      name: s.chart?.name || s.fund?.name || s.symbol,
      price: s.chart?.price,
      changePercent: s.chart?.changePercent,
      high52: s.chart?.high52,
      low52: s.chart?.low52,
      fiftyTwoWeekPosition: s.chart?.fiftyTwoWeekPosition,
      rsi: s.chart?.rsi,
      sma50: s.chart?.sma50,
      sma200: s.chart?.sma200,
      yearReturn: s.chart?.yearReturn,
      marketCap: s.chart?.marketCap,
      moatScore: s.fund?.moat?.moatScore || null,
      moatComponents: s.fund?.moat?.components || null,
      hasFundamentals: !!s.fund?.incomeStatement?.length,
    })),
  };
  if (kv) try { await kv.set(DATA_KEY, JSON.stringify(dataPayload), { ex: 7 * 24 * 3600 }); } catch {}
  return dataPayload;
}

// ── Step 2: Analyze a single batch with Claude ─────────────────────────
async function stepAnalyzeBatch(batchIndex, kv) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured.');
  if (!kv) throw new Error('KV not configured.');

  const raw = await kv.get(DATA_KEY);
  if (!raw) throw new Error('No data in cache. Run step=data first.');
  const dataPayload = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const BATCH_SIZE = 4;
  const start = batchIndex * BATCH_SIZE;
  const end = start + BATCH_SIZE;
  const batchBlocks = dataPayload.blocks.slice(start, end);
  if (!batchBlocks.length) return { batchIndex, stocks: [] };

  const result = await analyzeBatchWithRetry(batchBlocks.map(b => b.block), dataPayload.macroContext, apiKey);

  const batchResult = {
    batchIndex,
    timestamp: new Date().toISOString(),
    dataTimestamp: dataPayload.timestamp,
    stocks: result.stocks || [],
  };
  try { await kv.set(BATCH_KEY(batchIndex), JSON.stringify(batchResult), { ex: 7 * 24 * 3600 }); } catch {}
  return batchResult;
}

// ── Combine fresh data + batch results into the canonical screener output ─
async function combineCached(kv) {
  if (!kv) return null;
  const [rawData, b0, b1, b2] = await Promise.all([
    kv.get(DATA_KEY),
    kv.get(BATCH_KEY(0)),
    kv.get(BATCH_KEY(1)),
    kv.get(BATCH_KEY(2)),
  ]);
  if (!rawData) return null;
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  const parseB = (v) => v == null ? null : (typeof v === 'string' ? JSON.parse(v) : v);
  const batches = [parseB(b0), parseB(b1), parseB(b2)].filter(Boolean);

  // Only batches that match the current data timestamp are considered fresh
  const fresh = batches.filter(b => b.dataTimestamp === data.timestamp);
  const stale = batches.filter(b => b.dataTimestamp !== data.timestamp);

  const claudeBySymbol = {};
  for (const b of fresh) for (const s of (b.stocks || [])) claudeBySymbol[s.symbol] = s;

  const merged = data.stocks.map(s => ({ ...s, ...(claudeBySymbol[s.symbol] || {}) }));
  merged.sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0));

  return {
    timestamp: data.timestamp,
    regime: data.regime?.regime || 'UNKNOWN',
    regimeNote: data.regime?.note || '',
    stocks: merged,
    batchesReady: fresh.length,
    batchesTotal: Math.ceil(data.stocks.length / 4),
    staleBatches: stale.length,
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  if (req.method === 'GET') {
    const kv = await getKV();
    const [legacyCached, combined, status] = await Promise.all([
      getCached(kv),
      combineCached(kv),
      getStatus(kv),
    ]);
    const body = combined || legacyCached || null;
    if (!body) {
      return new Response(JSON.stringify({
        error: 'No cached screen yet. Run the screener.',
        refreshStatus: status || { state: 'idle' },
      }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    return new Response(JSON.stringify({
      ...body,
      cached: true,
      refreshStatus: status || { state: 'idle' },
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...CORS },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // POST requires an explicit step — no more legacy background path.
  if (!step) {
    return new Response(JSON.stringify({
      error: 'POST requires ?step=data or ?step=batch&n=0|1|2. The frontend should orchestrate the steps.',
    }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const kv = await getKV();
  try {
    if (step === 'data') {
      await setStatus(kv, { state: 'fetching-data' });
      const data = await stepFetchData(kv);
      if (kv) await Promise.all([0, 1, 2].map(n => kv.del(BATCH_KEY(n)).catch(() => {})));
      await setStatus(kv, { state: 'data-ready', dataTimestamp: data.timestamp });
      return new Response(JSON.stringify({
        ok: true, step: 'data', timestamp: data.timestamp, stocks: data.stocks.length,
      }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (step === 'batch') {
      const n = parseInt(url.searchParams.get('n') || '0', 10);
      if (![0, 1, 2].includes(n)) {
        return new Response(JSON.stringify({ error: 'n must be 0, 1, or 2' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const batch = await stepAnalyzeBatch(n, kv);
      const combined = await combineCached(kv);
      const ready = combined?.batchesReady || 0;
      const total = combined?.batchesTotal || 3;
      await setStatus(kv, ready >= total
        ? { state: 'idle', lastSuccessAt: combined?.timestamp }
        : { state: 'analyzing', batchesReady: ready, batchesTotal: total });
      return new Response(JSON.stringify({
        ok: true, step: 'batch', n, stocks: batch.stocks.length, batchesReady: ready, batchesTotal: total,
      }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    return new Response(JSON.stringify({ error: 'Unknown step: ' + step }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (e) {
    await setStatus(kv, { state: 'error', error: e.message || String(e) });
    return new Response(JSON.stringify({ error: (e.message || String(e)) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
