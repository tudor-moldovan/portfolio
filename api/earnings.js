export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

async function fetchEarnings(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,price`;
    let res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      res = await fetch(url.replace('query2', 'query1'), { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    }
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;
    const ce = r.calendarEvents || {};
    const pr = r.price || {};
    // earningsDate is usually an array of 1-2 timestamps (window)
    const dates = (ce.earnings?.earningsDate || [])
      .map(d => (typeof d === 'object' ? d.raw : d))
      .filter(Boolean);
    if (!dates.length) return null;
    const earliest = new Date(Math.min(...dates) * 1000);
    // Latest end of window for uncertainty indicator
    const latest = new Date(Math.max(...dates) * 1000);
    return {
      symbol,
      name: pr.shortName || pr.longName || symbol,
      earningsDate: earliest.toISOString(),
      earningsWindowEnd: latest.toISOString(),
      isEstimate: dates.length > 1,
    };
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url, 'http://localhost');
  const symbolsParam = url.searchParams.get('symbols');
  if (!symbolsParam) {
    return new Response(JSON.stringify({ error: 'symbols required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
  const windowDaysRaw = parseInt(url.searchParams.get('days') || '60', 10);
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 && windowDaysRaw < 365
    ? windowDaysRaw : 60;
  const results = await Promise.all(symbols.map(s => fetchEarnings(s)));
  const now = Date.now();
  // Accept earnings from "yesterday" (reported after hours) through `days` ahead.
  const windowEnd = now + windowDays * 24 * 3600 * 1000;
  const future = results.filter(r => {
    if (!r) return false;
    const t = new Date(r.earningsDate).getTime();
    return t >= now - 24 * 3600 * 1000 && t <= windowEnd;
  });
  future.sort((a, b) => new Date(a.earningsDate) - new Date(b.earningsDate));
  return new Response(JSON.stringify({ earnings: future, windowDays }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      ...CORS,
    },
  });
}
