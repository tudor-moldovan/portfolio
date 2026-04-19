export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/javascript,*/*;q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

// Primary: /v7/finance/quote — batch endpoint, returns earningsTimestamp +
// earningsTimestampStart/End for most US equities. Works without crumb
// in most regions. Much more reliable than /v10/finance/quoteSummary for
// this specific field.
async function fetchV7Batch(symbols) {
  if (!symbols.length) return {};
  // v7 supports up to ~40 symbols per request comfortably
  const results = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 25) chunks.push(symbols.slice(i, i + 25));
  for (const chunk of chunks) {
    const tryOne = async (host) => {
      try {
        const url = `https://${host}/v7/finance/quote?symbols=${chunk.map(encodeURIComponent).join(',')}`;
        const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.quoteResponse?.result || null;
      } catch { return null; }
    };
    const list = (await tryOne('query1.finance.yahoo.com')) ?? (await tryOne('query2.finance.yahoo.com'));
    if (!list) continue;
    for (const q of list) {
      if (!q?.symbol) continue;
      // earningsTimestamp is a single epoch-second number pointing at the
      // next confirmed/estimated report. Start/End bracket an uncertain
      // window when only a TBD date is known.
      const raw = q.earningsTimestamp ?? q.earningsTimestampStart ?? null;
      if (!raw) continue;
      const start = q.earningsTimestampStart ?? raw;
      const end = q.earningsTimestampEnd ?? raw;
      results[q.symbol.toUpperCase()] = {
        symbol: q.symbol.toUpperCase(),
        name: q.shortName || q.longName || q.symbol,
        earningsDate: new Date(start * 1000).toISOString(),
        earningsWindowEnd: new Date(end * 1000).toISOString(),
        isEstimate: start !== end,
        source: 'v7',
      };
    }
  }
  return results;
}

// Fallback per-symbol via /v10/finance/quoteSummary?modules=calendarEvents.
// Sometimes has data when v7 doesn't (rare).
async function fetchQuoteSummaryEarnings(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,price`;
    let res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      res = await fetch(url.replace('query2', 'query1'), { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    }
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const ce = r.calendarEvents || {};
    const pr = r.price || {};
    // earningsDate can be an array of {raw} or just nothing
    let dates = ce.earnings?.earningsDate;
    if (!Array.isArray(dates)) dates = dates ? [dates] : [];
    const raws = dates.map(d => (typeof d === 'object' ? d?.raw : d)).filter(v => typeof v === 'number');
    if (!raws.length) return null;
    const earliest = new Date(Math.min(...raws) * 1000);
    const latest = new Date(Math.max(...raws) * 1000);
    return {
      symbol: symbol.toUpperCase(),
      name: pr.shortName || pr.longName || symbol,
      earningsDate: earliest.toISOString(),
      earningsWindowEnd: latest.toISOString(),
      isEstimate: raws.length > 1,
      source: 'quoteSummary',
    };
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url, 'http://localhost');
  const symbolsParam = url.searchParams.get('symbols');
  const debug = url.searchParams.get('debug') === '1';
  if (!symbolsParam) {
    return new Response(JSON.stringify({ error: 'symbols required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  const windowDaysRaw = parseInt(url.searchParams.get('days') || '60', 10);
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 && windowDaysRaw < 365
    ? windowDaysRaw : 60;

  // 1) batch v7 for everyone
  const byV7 = await fetchV7Batch(symbols);

  // 2) fallback to quoteSummary for any symbol v7 missed
  const missing = symbols.filter(s => !byV7[s]);
  const fallbackResults = await Promise.all(missing.map(s => fetchQuoteSummaryEarnings(s)));
  const bySummary = {};
  for (const r of fallbackResults) if (r) bySummary[r.symbol] = r;

  const all = { ...byV7, ...bySummary };

  // 3) filter to window
  const now = Date.now();
  const windowEnd = now + windowDays * 24 * 3600 * 1000;
  const list = Object.values(all).filter(r => {
    const t = new Date(r.earningsDate).getTime();
    return t >= now - 24 * 3600 * 1000 && t <= windowEnd;
  });
  list.sort((a, b) => new Date(a.earningsDate) - new Date(b.earningsDate));

  const body = { earnings: list, windowDays };
  if (debug) {
    body.debug = {
      requested: symbols,
      v7Hits: Object.keys(byV7),
      fallbackHits: Object.keys(bySummary),
      missing: symbols.filter(s => !all[s]),
      totalWithData: Object.keys(all).length,
      inWindowCount: list.length,
      now: new Date(now).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
    };
  }
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      ...CORS,
    },
  });
}
