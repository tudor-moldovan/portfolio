// Shared valuation logic. Used by /api/valuation (HTTP-facing) and
// /api/cron (which snapshots history daily). In-process — no
// HTTP self-call, no cold-start penalty per ticker.

const YF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

export const UNIVERSE = {
  AAPL: 'Tech — Platform', MSFT: 'Tech — Platform', GOOGL: 'Tech — Platform',
  AMZN: 'Tech — Platform', META: 'Tech — Platform',
  NVDA: 'Tech — AI/Chips', ASML: 'Tech — AI/Chips', TSM: 'Tech — AI/Chips',
  V: 'Payments', MA: 'Payments',
  NFLX: 'Consumer',
  'BRK-B': 'Conglomerate',
};
export const TICKERS = Object.keys(UNIVERSE);

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
    return {
      trailingPE: trailingPE && trailingPE > 0 && trailingPE < 500 ? trailingPE : null,
      forwardPE: forwardPE && forwardPE > 0 && forwardPE < 500 ? forwardPE : null,
      priceToBook: ks.priceToBook?.raw ?? sd.priceToBook?.raw ?? null,
      priceToSales: sd.priceToSalesTrailing12Months?.raw ?? null,
      marketCap: pr.marketCap?.raw ?? sd.marketCap?.raw ?? null,
      earningsGrowth: fd.earningsGrowth?.raw ?? null,
    };
  } catch { return null; }
}

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

function forwardScore(s) {
  if (s.trailingPE == null || s.forwardPE == null || s.trailingPE <= 0) return 50;
  const ratio = s.forwardPE / s.trailingPE;
  return Math.max(0, Math.min(100, (ratio - 0.5) * 100));
}

function technicalScore(s) {
  const pos = s.fiftyTwoWeekPosition ?? 50;
  const rsi = s.rsi ?? 50;
  return pos * 0.6 + rsi * 0.4;
}

function finalScore(s) {
  const tech = technicalScore(s);
  if (s.trailingPE == null) {
    return { score: tech, tech, val: null, hasFundamentals: false };
  }
  const fwd = forwardScore(s);
  const val = 0.7 * s.peScore + 0.3 * fwd;
  return { score: 0.55 * val + 0.45 * tech, tech, val, valForward: fwd, hasFundamentals: true };
}

function label(score) {
  if (score == null) return '—';
  if (score < 30) return 'UNDERVALUED';
  if (score < 50) return 'CHEAP';
  if (score < 65) return 'FAIR';
  if (score < 80) return 'RICH';
  return 'OVERVALUED';
}

// Run the full valuation pipeline. Returns the same shape as
// /api/valuation does (with undervalued/overvalued/all/methodology).
export async function runValuation() {
  const pairs = await Promise.all(
    TICKERS.map(async (symbol) => {
      const [chart, fund] = await Promise.all([fetchChart(symbol), fetchQuoteSummary(symbol)]);
      if (!chart) return null;
      return { symbol, sector: UNIVERSE[symbol], ...chart, ...(fund || {}) };
    }),
  );
  const valid = pairs.filter(Boolean);
  if (valid.length === 0) throw new Error('No live data available.');

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

  return {
    timestamp: new Date().toISOString(),
    undervalued: scored.slice(0, 3),
    overvalued: scored.slice(-3).reverse(),
    all: scored,
    methodology: {
      formula: '0.55 × valuation + 0.45 × technical. Valuation = 70% sector-relative P/E percentile + 30% forward-P/E-vs-trailing ratio. Technical = 60% × 52wk position + 40% × RSI.',
      missingFundamentals: scored.filter(s => !s.hasFundamentals).map(s => s.symbol),
    },
  };
}
