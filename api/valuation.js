export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const YF = {
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

// ── Technical: RSI(14) via Wilder's smoothing ──────────────────────────
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

// ── Fetch 1y chart for 52wk position, RSI, 1y return ──────────────────
async function fetchChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
    const res = await fetch(url, { headers: YF, signal: AbortSignal.timeout(5000) });
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
    const fiftyTwoWeekPosition = (high52 && low52 && high52 !== low52)
      ? ((price - low52) / (high52 - low52)) * 100
      : null;
    return {
      name: meta.shortName || meta.longName || symbol,
      price,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      high52, low52,
      fiftyTwoWeekPosition,
      rsi: computeRSI(closes),
      yearReturn: closes.length > 1 ? ((price - closes[0]) / closes[0]) * 100 : null,
    };
  } catch { return null; }
}

// ── Fetch Yahoo quoteSummary for P/E, forward P/E, P/B ────────────────
async function fetchQuoteSummary(symbol) {
  try {
    const modules = 'price,summaryDetail,defaultKeyStatistics,financialData';
    let res = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`,
      { headers: YF, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      res = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`,
        { headers: YF, signal: AbortSignal.timeout(5000) },
      );
    }
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;
    const sd = r.summaryDetail || {};
    const ks = r.defaultKeyStatistics || {};
    const pr = r.price || {};
    const fd = r.financialData || {};
    const trailingPE = sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? pr.trailingPE?.raw ?? null;
    const forwardPE = sd.forwardPE?.raw ?? ks.forwardPE?.raw ?? null;
    const priceToBook = ks.priceToBook?.raw ?? sd.priceToBook?.raw ?? null;
    const priceToSales = sd.priceToSalesTrailing12Months?.raw ?? null;
    const marketCap = pr.marketCap?.raw ?? sd.marketCap?.raw ?? null;
    return {
      trailingPE: trailingPE && trailingPE > 0 && trailingPE < 500 ? trailingPE : null,
      forwardPE: forwardPE && forwardPE > 0 && forwardPE < 500 ? forwardPE : null,
      priceToBook,
      priceToSales,
      marketCap,
      earningsGrowth: fd.earningsGrowth?.raw ?? null,
    };
  } catch { return null; }
}

// ── Sector-relative P/E percentile (0 = cheapest, 100 = most expensive) ─
// For sectors with 2+ stocks we rank within sector. For single-stock
// sectors (NFLX in Consumer, BRK-B in Conglomerate) we rank within the
// whole universe as a fallback.
function assignPePercentiles(stocks) {
  const bySector = {};
  for (const s of stocks) {
    if (s.trailingPE == null) continue;
    if (!bySector[s.sector]) bySector[s.sector] = [];
    bySector[s.sector].push(s);
  }
  const universeWithPE = stocks.filter(s => s.trailingPE != null)
    .slice().sort((a, b) => a.trailingPE - b.trailingPE);
  const universeRank = new Map(universeWithPE.map((s, i) => [s.symbol, i]));

  for (const [, list] of Object.entries(bySector)) {
    if (list.length >= 2) {
      list.slice().sort((a, b) => a.trailingPE - b.trailingPE).forEach((s, i, arr) => {
        s.peScore = ((i + 0.5) / arr.length) * 100;
        s.peRankedAgainst = 'sector';
      });
    } else {
      for (const s of list) {
        const idx = universeRank.get(s.symbol);
        s.peScore = universeWithPE.length > 0
          ? ((idx + 0.5) / universeWithPE.length) * 100
          : 50;
        s.peRankedAgainst = 'universe';
      }
    }
  }
}

// Forward-vs-trailing score. forwardPE < trailingPE ⇒ growth expected ⇒ bullish ⇒ low score.
// Linear: 0.5 → 0, 1.0 → 50, 1.5 → 100.
function forwardScore(s) {
  if (s.trailingPE == null || s.forwardPE == null || s.trailingPE <= 0) return 50;
  const ratio = s.forwardPE / s.trailingPE;
  return Math.max(0, Math.min(100, (ratio - 0.5) * 100));
}

// Technical score, same as before (0-100, lower = oversold / near lows).
function technicalScore(s) {
  const pos = s.fiftyTwoWeekPosition ?? 50;
  const rsi = s.rsi ?? 50;
  return pos * 0.6 + rsi * 0.4;
}

// Final score (0-100, lower = most undervalued). If P/E is missing, fall
// back to technical-only and mark the stock so the UI can note the caveat.
function finalScore(s) {
  const tech = technicalScore(s);
  if (s.trailingPE == null) {
    return { score: tech, tech, val: null, hasFundamentals: false };
  }
  const fwd = forwardScore(s);
  const val = 0.7 * s.peScore + 0.3 * fwd;
  return {
    score: 0.55 * val + 0.45 * tech,
    tech,
    val,
    valForward: fwd,
    hasFundamentals: true,
  };
}

function label(score) {
  if (score == null) return '—';
  if (score < 30) return 'UNDERVALUED';
  if (score < 50) return 'CHEAP';
  if (score < 65) return 'FAIR';
  if (score < 80) return 'RICH';
  return 'OVERVALUED';
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // Fetch chart + quoteSummary for all 12 tickers in parallel (24 concurrent calls).
    const pairs = await Promise.all(
      TICKERS.map(async (symbol) => {
        const [chart, fund] = await Promise.all([fetchChart(symbol), fetchQuoteSummary(symbol)]);
        if (!chart) return null;
        return {
          symbol,
          sector: UNIVERSE[symbol],
          ...chart,
          ...(fund || {}),
        };
      }),
    );

    const valid = pairs.filter(Boolean);
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: 'No live data available.' }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    assignPePercentiles(valid);

    const scored = valid.map(s => {
      const f = finalScore(s);
      return {
        ...s,
        valuationScore: f.score,
        technicalScoreValue: f.tech,
        fundamentalScoreValue: f.val,
        forwardScoreValue: f.valForward,
        hasFundamentals: f.hasFundamentals,
        label: label(f.score),
      };
    });

    scored.sort((a, b) => a.valuationScore - b.valuationScore);

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      undervalued: scored.slice(0, 3),
      overvalued: scored.slice(-3).reverse(),
      all: scored,
      methodology: {
        formula: '0.55 × valuation + 0.45 × technical. Valuation = 70% sector-relative P/E percentile + 30% forward-P/E-vs-trailing ratio. Technical = 60% × 52wk position + 40% × RSI.',
        missingFundamentals: scored.filter(s => !s.hasFundamentals).map(s => s.symbol),
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        ...CORS,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Valuation failed: ' + (e?.message || String(e)) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
