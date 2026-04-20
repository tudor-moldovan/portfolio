export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Hardcoded catalyst calendar. Edit this file weekly — easier than scraping.
// Dates are ISO (YYYY-MM-DD). kind: 'earnings' | 'macro' | 'event'.
// symbol is optional; when present the UI can link it to a held position.
const CATALYSTS = [
  { date: '2026-04-28', symbol: 'V',    kind: 'earnings', label: 'Visa',       sub: 'FQ2 2026' },
  { date: '2026-04-28', symbol: 'MSFT', kind: 'earnings', label: 'Microsoft',  sub: 'FQ3 2026' },
  { date: '2026-04-29', symbol: 'AMZN', kind: 'earnings', label: 'Amazon',     sub: 'Q1 2026' },
  { date: '2026-04-29', symbol: 'GOOG', kind: 'earnings', label: 'Alphabet',   sub: 'Q1 2026' },
  { date: '2026-04-29', symbol: 'META', kind: 'earnings', label: 'Meta',       sub: 'Q1 2026' },
  { date: '2026-05-01', symbol: 'AAPL', kind: 'earnings', label: 'Apple',      sub: 'FQ2 2026' },
  { date: '2026-05-07',               kind: 'macro',    label: 'FOMC',        sub: 'Rate decision' },
  { date: '2026-05-13',               kind: 'macro',    label: 'US CPI',      sub: 'April print' },
  { date: '2026-05-20', symbol: 'NVDA', kind: 'earnings', label: 'Nvidia',     sub: 'FQ1 2027' },
  { date: '2026-05-20', symbol: 'META', kind: 'event',    label: 'META layoffs', sub: 'First wave begins' },
];

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const today = new Date().toISOString().slice(0, 10);
  // Only return catalysts from today forward; the past can't be traded.
  const upcoming = CATALYSTS.filter(c => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20);
  return new Response(JSON.stringify({ catalysts: upcoming }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
  });
}
