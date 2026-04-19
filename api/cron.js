import { runValuation, TICKERS as VAL_TICKERS } from './_lib/valuation.js';
import { getFundamentalsWithCache } from './_lib/moat.js';
import { fetchNAV, BTAM_TICKERS } from './_lib/btam.js';

export const config = { maxDuration: 60 };

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','ASML','TSM',
  'NFLX','V','MA','BRK-B',
  'SPY','^VIX','^TNX',
];

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

// ── KV (Upstash auto-parses JSON on get; normalize) ────────────────────
async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function safeParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

// ── Step 1: Daily Market Scan (existing logic, slightly cleaned up) ────
async function fetchScanQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;
    const meta = result.meta;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;
    const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    let rsi = null;
    if (closes.length >= 15) {
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i <= 14; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) avgGain += d; else avgLoss -= d;
      }
      avgGain /= 14; avgLoss /= 14;
      for (let i = 15; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * 13 + (d >= 0 ? d : 0)) / 14;
        avgLoss = (avgLoss * 13 + (d < 0 ? -d : 0)) / 14;
      }
      rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    const high52 = closes.length ? closes.reduce((a, b) => Math.max(a, b)) : null;
    const low52 = closes.length ? closes.reduce((a, b) => Math.min(a, b)) : null;
    return {
      symbol, price, name: meta.shortName || symbol,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      sma20, sma50, rsi,
      aboveSma20: sma20 ? price > sma20 : null,
      fiftyTwoWeekPosition: (high52 && low52 && high52 !== low52)
        ? ((price - low52) / (high52 - low52)) * 100 : null,
    };
  } catch { return null; }
}

async function sendWebhook(scan) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  const sigCount = scan.signals.oversold.length + scan.signals.overbought.length +
    scan.signals.breakouts.length + scan.signals.breakdowns.length;
  if (sigCount === 0) return;
  const lines = [`📊 Daily Market Scan — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`];
  lines.push(`Scanned ${scan.totalScanned} stocks`);
  if (scan.vix) lines.push(`VIX: ${scan.vix} (${scan.regime})`);
  if (scan.signals.oversold.length) lines.push(`🟢 Oversold: ${scan.signals.oversold.map(s => s.symbol + ' RSI=' + s.rsi).join(', ')}`);
  if (scan.signals.overbought.length) lines.push(`🔴 Overbought: ${scan.signals.overbought.map(s => s.symbol + ' RSI=' + s.rsi).join(', ')}`);
  if (scan.signals.breakouts.length) lines.push(`⬆️ Breakouts: ${scan.signals.breakouts.map(s => s.symbol + ' ' + s.change).join(', ')}`);
  if (scan.signals.breakdowns.length) lines.push(`⬇️ Breakdowns: ${scan.signals.breakdowns.map(s => s.symbol + ' ' + s.change).join(', ')}`);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n'), content: lines.join('\n') }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

async function stepScan(kv) {
  const results = await Promise.allSettled(SCAN_UNIVERSE.map(s => fetchScanQuote(s)));
  const quotes = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  const oversold = quotes.filter(q => q.rsi != null && q.rsi < 30);
  const overbought = quotes.filter(q => q.rsi != null && q.rsi > 70);
  const breakouts = quotes.filter(q => q.aboveSma20 && q.changePercent > 1.5);
  const breakdowns = quotes.filter(q => q.aboveSma20 === false && q.changePercent < -1.5);
  const vixQuote = quotes.find(q => q.symbol === '^VIX');
  const spyQuote = quotes.find(q => q.symbol === 'SPY');
  const regime = !vixQuote ? 'UNKNOWN' :
    vixQuote.price < 15 ? (spyQuote?.aboveSma20 ? 'RISK_ON' : 'NORMAL') :
    vixQuote.price < 25 ? 'NORMAL' :
    vixQuote.price < 35 ? 'CAUTIOUS' : 'RISK_OFF';
  const scan = {
    timestamp: new Date().toISOString(),
    totalScanned: quotes.length,
    regime,
    vix: vixQuote?.price?.toFixed(1) || null,
    tnx: quotes.find(q => q.symbol === '^TNX')?.price?.toFixed(2) || null,
    spy: { price: spyQuote?.price, change: spyQuote?.changePercent?.toFixed(2) + '%' },
    signals: {
      oversold: oversold.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price, name: q.name })),
      overbought: overbought.map(q => ({ symbol: q.symbol, rsi: q.rsi?.toFixed(0), price: q.price, name: q.name })),
      breakouts: breakouts.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price, name: q.name })),
      breakdowns: breakdowns.map(q => ({ symbol: q.symbol, change: q.changePercent.toFixed(2) + '%', price: q.price, name: q.name })),
    },
    summary: `Scanned ${quotes.length} stocks. ${oversold.length} oversold, ${overbought.length} overbought, ${breakouts.length} breakouts, ${breakdowns.length} breakdowns. Regime: ${regime}.`,
  };

  if (kv) {
    try {
      await kv.set('latest_scan', JSON.stringify(scan));
      const raw = await kv.get('scan_history');
      const history = safeParse(raw, []);
      const hist = Array.isArray(history) ? history : [];
      hist.push({ date: scan.timestamp.slice(0, 10), regime, signals: scan.signals, vix: scan.vix });
      if (hist.length > 30) hist.splice(0, hist.length - 30);
      await kv.set('scan_history', JSON.stringify(hist));
    } catch {}
  }

  await sendWebhook(scan);
  return scan;
}

// ── Step 2: Warm moats — fetch fundamentals for all 12, write moats:all ─
async function stepWarmMoats(kv) {
  if (!kv) return { warmed: 0 };
  const moatTickers = VAL_TICKERS;
  const settled = await Promise.allSettled(
    moatTickers.map(t => getFundamentalsWithCache(t, kv).catch(() => null)),
  );
  const moats = {};
  for (let i = 0; i < moatTickers.length; i++) {
    const r = settled[i];
    const sym = moatTickers[i];
    if (r.status === 'fulfilled' && r.value?.moat) {
      moats[sym] = {
        rating: r.value.moat.rating,
        score: r.value.moat.moatScore,
        ts: new Date().toISOString().slice(0, 10),
      };
    } else {
      moats[sym] = { rating: null, score: null, ts: new Date().toISOString().slice(0, 10) };
    }
  }
  try { await kv.set('moats:all', JSON.stringify(moats), { ex: 30 * 24 * 3600 }); } catch {}
  return { warmed: Object.values(moats).filter(m => m.rating).length };
}

// ── Step 3: Snapshot valuation history — append today's score per stock ─
async function stepSnapHistory(kv) {
  if (!kv) return { snapped: 0 };
  let valuation;
  try { valuation = await runValuation(); } catch (e) { return { error: e.message }; }
  const today = new Date().toISOString().slice(0, 10);
  const raw = await kv.get('history:valuation');
  const history = safeParse(raw, {}) || {};
  for (const s of (valuation.all || [])) {
    if (!history[s.symbol]) history[s.symbol] = [];
    // Replace today's entry if it exists (idempotent re-runs)
    const existingIdx = history[s.symbol].findIndex(p => p.d === today);
    const entry = {
      d: today,
      s: Math.round(s.valuationScore * 10) / 10,
      pe: s.trailingPE != null ? Math.round(s.trailingPE * 10) / 10 : null,
      pos: s.fiftyTwoWeekPosition != null ? Math.round(s.fiftyTwoWeekPosition) : null,
      rsi: s.rsi != null ? Math.round(s.rsi) : null,
    };
    if (existingIdx >= 0) history[s.symbol][existingIdx] = entry;
    else history[s.symbol].push(entry);
    // Cap at 90 days
    if (history[s.symbol].length > 90) history[s.symbol] = history[s.symbol].slice(-90);
  }
  try { await kv.set('history:valuation', JSON.stringify(history), { ex: 180 * 24 * 3600 }); } catch {}
  return { snapped: Object.keys(history).length, valuation };
}

// ── Step 4: Claude daily read — 2 sentences for the page banner ────────
async function stepDailyRead(kv, scan, valuation) {
  if (!kv) return { skipped: true };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { skipped: 'no key' };

  const top = (valuation?.undervalued || []).slice(0, 3).map(s => `${s.symbol} (${s.label})`).join(', ');
  const bottom = (valuation?.overvalued || []).slice(0, 3).map(s => `${s.symbol} (${s.label})`).join(', ');
  const sigs = scan?.signals || {};
  const sigSummary = [
    sigs.oversold?.length ? `${sigs.oversold.length} oversold` : null,
    sigs.overbought?.length ? `${sigs.overbought.length} overbought` : null,
    sigs.breakouts?.length ? `${sigs.breakouts.length} breakout` : null,
    sigs.breakdowns?.length ? `${sigs.breakdowns.length} breakdown` : null,
  ].filter(Boolean).join(', ') || 'no notable signals';

  const userMsg = `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.

Universe: 12 elite moat compounders (AAPL, MSFT, GOOGL, AMZN, META, NVDA, ASML, TSM, V, MA, NFLX, BRK-B).

Macro: VIX ${scan?.vix || '?'} (${scan?.regime || 'unknown regime'}), 10Y ${scan?.tnx || '?'}%.

Today's signals: ${sigSummary}.

Most undervalued (lowest valuation score): ${top || 'none flagged'}.
Most overvalued (highest valuation score): ${bottom || 'none flagged'}.

In 2 sentences MAX, what's the most interesting move/insight in the universe today? Be specific (cite a ticker and a number). No fluff, no disclaimers, no bullet points. Just 2 sentences.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: userMsg }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: 'Claude ' + res.status };
    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
    if (!text) return { error: 'empty response' };
    const payload = {
      date: new Date().toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      text,
    };
    try { await kv.set('claude:dailyread', JSON.stringify(payload), { ex: 7 * 24 * 3600 }); } catch {}
    return payload;
  } catch (e) {
    return { error: e.message };
  }
}

// ── Step: Pre-warm BTAM NAVs for Romanian fund positions ───────────────
// Directly calls the shared fetchNAV helper (no HTTP self-call) and
// writes to KV on every successful scrape — so when BT blocks us on a
// future day, the runtime endpoint still has a last-known-good value.
async function stepCacheBTAM(kv, positions) {
  if (!kv || !positions?.length) return { cached: 0 };
  const known = new Set(BTAM_TICKERS);
  const syms = [...new Set(positions.map(p => p.sym).filter(s => known.has(s)))];
  if (!syms.length) return { cached: 0 };
  const results = await Promise.allSettled(syms.map(async (sym) => {
    const r = await fetchNAV(sym);
    if (r && !r.error && r.price) {
      await kv.set('btam:nav:' + sym, JSON.stringify({
        symbol: sym, price: r.price, fetchedAt: new Date().toISOString(),
      }), { ex: 14 * 24 * 3600 });
      return sym;
    }
    return null;
  }));
  const cached = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  return { cached: cached.length, symbols: cached };
}

// ── Step: Pre-warm fundamentals for user positions ────────────────────
// Calls getFundamentalsWithCache which stores in KV for 24h.
async function stepWarmPortfolioFundamentals(kv, positions) {
  if (!kv || !positions?.length) return { warmed: 0 };
  // Only equities — skip crypto, indexes, Romanian funds that FMP doesn't cover
  const skip = new Set(['BTC','ETH','SOL','BNB','XRP','ADA','ROTX','BT_USA','BT_WORLD','BT_EURO','BT_MAXI','BT_CLASIC','BT_OBLIG']);
  const syms = [...new Set(positions.map(p => p.sym).filter(s => !skip.has(s)))];
  if (!syms.length) return { warmed: 0 };
  const settled = await Promise.allSettled(syms.map(s => getFundamentalsWithCache(s, kv).catch(() => null)));
  const warmed = settled.filter(r => r.status === 'fulfilled' && r.value).length;
  return { warmed, attempted: syms.length };
}

// ── Step: Generate per-position briefing (supersedes stepDailyRead) ────
// Richer than the 2-sentence daily read: one Claude call produces
//   - macroTake (2 sentences, replaces the old daily read)
//   - positions: { SYM: {verdict, color, thesis, body, risk, catalyst, bullCase, bearCase, entryZone} }
//   - actions: ranked 3-6 action items tied to specific holdings
// Written to KV briefing:today. Replaces the analysis-pending placeholders
// on the Today tab.
async function stepBriefing(kv, scan, valuation, positions) {
  if (!kv) return { skipped: 'no kv' };
  if (!positions?.length) return { skipped: 'no positions' };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { skipped: 'no anthropic key' };

  // Aggregate positions per symbol — one card per ticker, so Claude can't
  // emit duplicate JSON keys for split positions (BTC on Binance + Revolut).
  const bySym = {};
  for (const p of positions) {
    const k = p.sym;
    if (!bySym[k]) bySym[k] = { sym: k, ccy: p.ccy || 'USD', name: p.name || null, nextEarnings: p.nextEarnings || null, units: 0, cost: 0, brokers: new Set() };
    bySym[k].units += p.units;
    bySym[k].cost += p.units * p.avg;
    if (p.broker) bySym[k].brokers.add(p.broker);
    if (!bySym[k].nextEarnings && p.nextEarnings) bySym[k].nextEarnings = p.nextEarnings;
    if (!bySym[k].name && p.name) bySym[k].name = p.name;
  }
  const aggPositions = Object.values(bySym).map(s => ({
    ...s, avg: s.cost / s.units, brokers: [...s.brokers].join(', '),
  }));

  // Fetch live prices for each unique position symbol
  const syms = aggPositions.map(p => p.sym);
  const prices = {};
  try {
    const fxSyms = ['EURUSD=X','USDRON=X','GBPUSD=X','USDCHF=X'];
    const all = [...fxSyms, ...syms];
    const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
    if (origin) {
      const r = await fetch(`${origin}/api/quote?symbols=${all.map(encodeURIComponent).join(',')}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const q = await r.json();
        for (const s of syms) if (q[s]) prices[s] = q[s];
      }
    }
  } catch {}

  const macroLine = `VIX ${scan?.vix || '?'}, 10Y ${scan?.tnx || '?'}%, regime ${scan?.regime || 'unknown'}, SPY ${scan?.spy?.change || 'flat'}`;

  // Build a compact per-position context block (one per UNIQUE symbol)
  const posBlocks = aggPositions.map(p => {
    const q = prices[p.sym] || {};
    const pos = q.price && q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh !== q.fiftyTwoWeekLow
      ? Math.round(((q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100)
      : null;
    const pnl = q.price ? Math.round(((q.price - p.avg) / p.avg) * 1000) / 10 : null;
    return [
      `${p.sym} (${q.name || p.name || p.sym}) [${p.brokers || '—'}, ${p.ccy}]`,
      `  ${p.units.toFixed(4)} units @ ${p.avg.toFixed(2)} weighted-avg`,
      q.price ? `  now ${q.price.toFixed(2)} (${pnl != null ? (pnl >= 0 ? '+' : '') + pnl + '%' : '?'})` : '  no live price',
      q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh ? `  52wk ${q.fiftyTwoWeekLow.toFixed(0)}–${q.fiftyTwoWeekHigh.toFixed(0)} (${pos != null ? pos + '% of range' : '?'})` : '',
      p.nextEarnings ? `  earnings ${p.nextEarnings}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const systemPrompt = `You are a senior portfolio advisor working for a single long-term investor. Write a terse daily briefing keyed to their ACTUAL holdings.

OUTPUT — respond with ONLY valid JSON (no prose outside the JSON):

{
  "macroTake": "<2 sentences: what matters today + 1 implication for the book>",
  "regime": "RISK_ON | NORMAL | CAUTIOUS | RISK_OFF",
  "positions": {
    "MSFT": {
      "verdict": "HOLD | ACCUMULATE | TRIM | WAIT | WATCH | SELL",
      "color": "GREEN | AMBER | RED | SLATE",
      "thesis": "<1 sentence: the current take>",
      "body": "<2-3 sentences: what's happening with this name, citing specific numbers from the data>",
      "risk": "<1 sentence: the thing that could go wrong>",
      "catalyst": "<1 sentence: the near-term thing that changes the picture>",
      "bullCase": "<1 sentence>",
      "bearCase": "<1 sentence>",
      "entryZone": "$X - $Y"
    }
  },
  "actions": [
    {"priority": 1, "label": "<concrete action>", "note": "<why, citing numbers>", "tag": "ACCUMULATE|RISK MGMT|OPTIONAL|WAIT|WATCH|PASSIVE", "symbols": ["SYM"]}
  ]
}

RULES:
- Produce a "positions" entry for EVERY symbol in the input (one entry per UNIQUE symbol).
- Cite specific numbers from the data (% of 52wk, P&L %, earnings date) — no vague statements.
- "verdict" + "color" must be internally consistent (GREEN for ACCUMULATE, AMBER for HOLD with caution, RED for TRIM/SELL).
- Actions: 3–6 items, ranked by urgency. Tie to specific symbols.
- Think like Munger: long-term holders, don't overreact to noise, but don't be dogmatic about positions that turned speculative.`;

  const userMsg = `Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

Macro snapshot: ${macroLine}.
${scan?.signals ? `Today's scan signals — oversold: ${(scan.signals.oversold || []).map(s => s.symbol).join(', ') || 'none'}; overbought: ${(scan.signals.overbought || []).map(s => s.symbol).join(', ') || 'none'}.` : ''}

Portfolio (user's ACTUAL positions):

${posBlocks}

Produce the briefing JSON now.`;

  try {
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
        max_tokens: 4000,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) {
      const err = await res.text();
      return { error: `Claude ${res.status}: ${err.slice(0, 200)}` };
    }
    // Parse SSE stream (same pattern as the screener — avoids undici idle timeout)
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
              return { error: 'stream: ' + (evt.error?.message || 'unknown') };
            }
          } catch {}
        }
      }
    }
    const match = accumulated.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'no JSON in Claude response' };
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch (e) { return { error: 'parse failed: ' + e.message }; }

    const payload = {
      date: new Date().toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      ...parsed,
    };
    try { await kv.set('briefing:today', JSON.stringify(payload), { ex: 7 * 24 * 3600 }); } catch {}
    // Also mirror the macroTake to the legacy daily-read key so the old
    // banner stays populated during rollout.
    if (parsed.macroTake) {
      try {
        await kv.set('claude:dailyread', JSON.stringify({
          date: payload.date,
          generatedAt: payload.generatedAt,
          text: parsed.macroTake,
        }), { ex: 7 * 24 * 3600 });
      } catch {}
    }
    return { ok: true, positions: Object.keys(parsed.positions || {}).length, actions: (parsed.actions || []).length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// ── Handler ─────────────────────────────────────────────────────────────
// Defensive header access: nodejs functions on Vercel can present `req`
// either as a Web Request (headers.get(...)) or a Node IncomingMessage
// (headers.authorization). Handle both so the function can't 500 at the
// auth check.
function getHeader(req, name) {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name.toLowerCase()] ?? null;
}

export default async function handler(req) {
  const authHeader = getHeader(req, 'authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Accept either Bearer header (Vercel cron schedule) or ?key= query
  // param (for manual phone-browser triggers).
  const url = new URL(req.url, 'http://localhost');
  const keyParam = url.searchParams.get('key');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const kv = await getKV();
  const t0 = Date.now();
  const result = { steps: {} };

  // Load user positions once; several steps need them
  let positions = [];
  if (kv) {
    try {
      const raw = await kv.get('portfolio:positions');
      const parsed = safeParse(raw, null);
      positions = parsed?.positions || [];
    } catch {}
  }

  // ── Phase 1: all data-fetching steps run IN PARALLEL ────────────────
  // Previously sequential — occasionally tripped the 60s cap. Now ~15s
  // for the slowest step in the group instead of ~40s cumulative.
  const p1t = Date.now();
  const [scanR, moatsR, fundsR, btamR, historyR] = await Promise.allSettled([
    stepScan(kv),
    stepWarmMoats(kv),
    stepWarmPortfolioFundamentals(kv, positions),
    stepCacheBTAM(kv, positions),
    stepSnapHistory(kv),
  ]);
  if (scanR.status === 'fulfilled') {
    result.scan = scanR.value;
    result.steps.scan = { ok: true, totalScanned: scanR.value?.totalScanned, regime: scanR.value?.regime };
  } else { result.steps.scan = { ok: false, error: scanR.reason?.message }; }
  if (moatsR.status === 'fulfilled') result.steps.moats = { ok: true, ...moatsR.value };
  else result.steps.moats = { ok: false, error: moatsR.reason?.message };
  if (fundsR.status === 'fulfilled') result.steps.portfolioFundamentals = { ok: true, ...fundsR.value };
  else result.steps.portfolioFundamentals = { ok: false, error: fundsR.reason?.message };
  if (btamR.status === 'fulfilled') result.steps.btam = { ok: true, ...btamR.value };
  else result.steps.btam = { ok: false, error: btamR.reason?.message };
  let valuation = null;
  if (historyR.status === 'fulfilled') { valuation = historyR.value?.valuation; result.steps.history = { ok: true, snapped: historyR.value?.snapped }; }
  else { result.steps.history = { ok: false, error: historyR.reason?.message }; }
  result.steps._phase1ms = Date.now() - p1t;

  // ── Phase 2: briefing (needs scan + valuation) ────────────────────
  const p2t = Date.now();
  try {
    if (positions.length) {
      const r = await stepBriefing(kv, result.scan, valuation, positions);
      result.steps.briefing = { ok: !r.error, ms: Date.now() - p2t, ...r };
    } else {
      const r = await stepDailyRead(kv, result.scan, valuation);
      result.steps.dailyread = { ok: !r.error, ms: Date.now() - p2t, ...r };
    }
  } catch (e) {
    result.steps.briefing = { ok: false, ms: Date.now() - p2t, error: e.message };
  }

  result.totalMs = Date.now() - t0;
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}
