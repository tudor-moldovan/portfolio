import { POSITIONS_SEED } from './_lib/positions_seed.js';
import { computePositionPL, targetSignal } from './_lib/portfolio.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getKV() {
  try { return (await import('@vercel/kv')).kv; } catch { return null; }
}
function parseJSON(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
}
const todayISO = () => new Date().toISOString().slice(0, 10);

async function loadPositions(kv) {
  if (!kv) return POSITIONS_SEED;
  try {
    const raw = await kv.get('positions:current');
    const parsed = parseJSON(raw, null);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return POSITIONS_SEED;
}

async function fetchQuotes(reqUrl, symbols) {
  try {
    const origin = new URL(reqUrl).origin;
    const r = await fetch(`${origin}/api/quote?symbols=${symbols.map(encodeURIComponent).join(',')}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

async function fetchMacro(reqUrl) {
  try {
    const origin = new URL(reqUrl).origin;
    const r = await fetch(`${origin}/api/macro`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchCatalysts(reqUrl) {
  try {
    const origin = new URL(reqUrl).origin;
    const r = await fetch(`${origin}/api/catalysts`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return [];
    const d = await r.json();
    return d.catalysts || [];
  } catch { return []; }
}

async function fetchFX(reqUrl) {
  // Use /api/quote on EURUSD=X and USDRON=X Yahoo tickers.
  try {
    const origin = new URL(reqUrl).origin;
    const r = await fetch(`${origin}/api/quote?symbols=EURUSD%3DX,USDRON%3DX`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { EURUSD: 1.18, USDRON: 4.41 };
    const d = await r.json();
    return {
      EURUSD: d['EURUSD=X']?.price || 1.18,
      USDRON: d['USDRON=X']?.price || 4.41,
    };
  } catch { return { EURUSD: 1.18, USDRON: 4.41 }; }
}

function enrichPositions(positions, quotes, fx) {
  return positions.map(p => {
    const q = quotes[p.quoteSym || p.symbol];
    const livePrice = q?.price ?? null;
    const changePct = q?.changePercent ?? null;
    const pl = computePositionPL(p, livePrice, fx);
    const signal = targetSignal(p, livePrice);
    return { ...p, livePrice, changePct, pl, signal };
  });
}

function buildPrompt(enriched, macro, catalysts, previousBrief, fx) {
  const totalValue = enriched.reduce((s, p) => s + p.pl.valueUSD, 0);
  const totalCost = enriched.reduce((s, p) => s + p.pl.costUSD, 0);
  const totalPLPct = totalCost ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  const posLines = enriched.map(p => {
    const tgt = [];
    if (p.targetBuy) tgt.push(`buy<=${p.targetBuy}`);
    if (p.targetSell) tgt.push(`sell>=${p.targetSell}`);
    if (p.stopLoss) tgt.push(`stop<${p.stopLoss}`);
    const sig = p.signal ? ` SIGNAL=${p.signal}` : '';
    return `${p.symbol} (${p.broker}, ${p.asset}): ${p.units} @ ${p.avgCost} ${p.currency}` +
      ` | live=${p.livePrice ?? 'n/a'} day=${p.changePct!=null?p.changePct.toFixed(2)+'%':'n/a'}` +
      ` | P&L=${p.pl.plUSD.toFixed(0)} USD (${p.pl.plPct.toFixed(1)}%)` +
      (tgt.length ? ` | targets: ${tgt.join(',')}` : '') + sig;
  }).join('\n');

  const macroLine = macro?.macro ? Object.entries(macro.macro)
    .map(([k, v]) => `${k}=${v.latest}${v.unit || ''}`).join(', ') : 'n/a';

  const catLines = catalysts.slice(0, 10)
    .map(c => `${c.date} ${c.label} (${c.kind}${c.symbol?`, ${c.symbol}`:''})${c.sub?` — ${c.sub}`:''}`)
    .join('\n');

  const prevContext = previousBrief ? `
Previous brief (${previousBrief.date}) said:
  macro: ${previousBrief.macroNarrative?.slice(0, 200) || ''}
  priority actions: ${(previousBrief.priorityActions || []).map(a => a.title).join(' | ')}
Stay consistent with prior calls unless facts changed. If changing a verdict, say why in the note.
` : '';

  return `You are a disciplined portfolio analyst. Produce a JSON brief for today (${todayISO()}).
Be specific, decision-focused, and terse. Reference actual numbers. No hedging language like "consider" or "may want to".
Currency: USD (portfolio total). FX used: EUR/USD=${fx.EURUSD.toFixed(3)}, USD/RON=${fx.USDRON.toFixed(2)}.

Portfolio total: $${totalValue.toFixed(0)} value, ${totalPLPct.toFixed(1)}% total return vs cost.

Positions:
${posLines}

Macro snapshot: ${macroLine}

Upcoming catalysts:
${catLines || '(none in next 30 days)'}
${prevContext}
Return ONLY this JSON (no markdown, no commentary):
{
  "macroNarrative": "<3-5 sentence synthesis: regime, key risks, what this week's tape is pricing in>",
  "perPosition": [
    {
      "symbol": "<exact symbol from list>",
      "verdict": "BUY_ZONE | ACCUMULATE | HOLD | HOLD_WATCH | WAIT | MONITOR | TRIM | AVOID",
      "note": "<2-3 sentences: specific numbers, reference P&L position and nearest catalyst, give one concrete decision>",
      "flags": ["<short uppercase tags like LAYOFF_NEWS, ACT_THIS_WEEK, TARGET_APPROACHING — 0-2 max>"]
    }
  ],
  "priorityActions": [
    {
      "title": "<imperative sentence, 60 chars max>",
      "desc": "<2-3 sentences, specific>",
      "tags": ["<BUY|HOLD|WAIT|MONITOR|ACCUMULATE>", "<DEADLINE: <date> OR CATALYST: <date> OR TARGET: <price>>"]
    }
  ]
}

Rules:
- Include ONE perPosition entry per position in the input, in the same order.
- 3-5 priority actions, sorted most urgent first.
- Reference concrete numbers (prices, %, dates).
- If a position has SIGNAL=AT_BUY, promote it in priority actions.
- If a catalyst is within 7 days, mention it in the relevant position's note.`;
}

async function callClaude(prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return { parsed: JSON.parse(match[0]), usage: data.usage };
}

async function generateBrief(reqUrl, kv) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const positions = await loadPositions(kv);
  const symbols = [...new Set(positions.map(p => p.quoteSym || p.symbol))];

  const [quotes, macro, catalysts, fx] = await Promise.all([
    fetchQuotes(reqUrl, symbols),
    fetchMacro(reqUrl),
    fetchCatalysts(reqUrl),
    fetchFX(reqUrl),
  ]);

  const enriched = enrichPositions(positions, quotes, fx);

  // Load up to one prior brief for consistency context.
  let previousBrief = null;
  if (kv) {
    try {
      const idx = parseJSON(await kv.get('briefs:index'), []);
      if (idx.length) {
        const prev = parseJSON(await kv.get(`brief:${idx[0]}`), null);
        if (prev) previousBrief = prev;
      }
    } catch {}
  }

  const prompt = buildPrompt(enriched, macro, catalysts, previousBrief, fx);
  const { parsed, usage } = await callClaude(prompt, apiKey);

  const totalValue = enriched.reduce((s, p) => s + p.pl.valueUSD, 0);
  const totalCost = enriched.reduce((s, p) => s + p.pl.costUSD, 0);

  const brief = {
    date: todayISO(),
    generatedAt: new Date().toISOString(),
    fx,
    positions: enriched,
    totals: {
      valueUSD: totalValue,
      costUSD: totalCost,
      plUSD: totalValue - totalCost,
      plPct: totalCost ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    },
    catalysts: catalysts.slice(0, 12),
    macroNarrative: parsed.macroNarrative || '',
    perPosition: parsed.perPosition || [],
    priorityActions: parsed.priorityActions || [],
    usage,
  };

  if (kv) {
    try {
      await kv.set(`brief:${brief.date}`, JSON.stringify(brief), { ex: 40 * 24 * 3600 });
      const idx = parseJSON(await kv.get('briefs:index'), []);
      const next = [brief.date, ...idx.filter(d => d !== brief.date)].slice(0, 30);
      await kv.set('briefs:index', JSON.stringify(next));
    } catch {}
  }
  return brief;
}

function checkAuth(req) {
  const want = process.env.APP_KEY;
  if (!want) return true;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const url = new URL(req.url);
  const qkey = url.searchParams.get('key');
  return bearer === want || qkey === want;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const kv = await getKV();
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  if (req.method === 'GET' && !force) {
    // Serve today's brief if present, else try yesterday with stale flag,
    // else generate on-demand (first visit of the day).
    if (kv) {
      const today = todayISO();
      try {
        const todayBrief = parseJSON(await kv.get(`brief:${today}`), null);
        if (todayBrief) {
          return new Response(JSON.stringify({ brief: todayBrief, stale: false }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
          });
        }
        // Try most recent from index
        const idx = parseJSON(await kv.get('briefs:index'), []);
        if (idx.length) {
          const prev = parseJSON(await kv.get(`brief:${idx[0]}`), null);
          if (prev) {
            // Generate fresh in the background, return stale now.
            generateBrief(req.url, kv).catch(() => {});
            return new Response(JSON.stringify({ brief: prev, stale: true, staleDate: idx[0] }), {
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
            });
          }
        }
      } catch {}
    }
    // No cache — generate synchronously (first run).
    try {
      const brief = await generateBrief(req.url, kv);
      return new Response(JSON.stringify({ brief, stale: false, fresh: true }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  // POST or force=1 regenerate
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  try {
    const brief = await generateBrief(req.url, kv);
    return new Response(JSON.stringify({ brief, regenerated: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
