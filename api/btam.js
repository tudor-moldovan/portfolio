export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// BT Asset Management fund pages. We scrape the public page for the
// NAV per unit (VUAN). If BT changes their HTML structure, the regex
// falls back to null and the frontend falls back to lastPrice in JSON.
const FUND_URLS = {
  ROTX:    'https://www.btam.ro/fonduri/bt-index-romania-rotx',
  BT_USA:  'https://www.btam.ro/fonduri/bt-index-usa',
  BT_WORLD:'https://www.btam.ro/fonduri/bt-index-world',
  BT_EURO: 'https://www.btam.ro/fonduri/bt-index-euro',
  BT_MAXI: 'https://www.btam.ro/fonduri/bt-maxim',
  BT_CLASIC:'https://www.btam.ro/fonduri/bt-clasic',
  BT_OBLIG:'https://www.btam.ro/fonduri/bt-obligatiuni',
};

// Try several patterns; the BT page shows the NAV as "57,295 RON/Unitate"
// or "VUAN: 57,295 RON" depending on layout. Accept either comma or dot
// as decimal separator (Romanian uses comma; HTML sometimes has dot).
const NAV_PATTERNS = [
  /RON\s*\/\s*Unitate[^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /(\d{1,4}[.,]\d{2,6})\s*RON\s*\/\s*Unitate/i,
  /VUAN[^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /Valoare(?:a)?\s+Unitar[aăe][^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /(?:activ(?:ului)?\s+net|NAV)[^0-9\-]{0,60}(\d{1,4}[.,]\d{2,6})\s*RON/i,
];

function parseRONNumber(raw) {
  if (!raw) return null;
  // If there are both '.' and ',', assume '.' is thousands and ',' decimal (RO convention)
  let s = raw.trim();
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

async function fetchNAV(fundKey) {
  const url = FUND_URLS[fundKey];
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    const html = await res.text();
    for (const p of NAV_PATTERNS) {
      const m = html.match(p);
      if (m) {
        const price = parseRONNumber(m[1]);
        if (price) return { price, matchedPattern: p.source.slice(0, 60) };
      }
    }
    return { error: 'No NAV pattern matched; BT layout may have changed' };
  } catch (e) {
    return { error: e.message };
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url, 'http://localhost');
  const sym = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z_]/g, '');
  if (!sym) {
    return new Response(JSON.stringify({ error: 'symbol required', known: Object.keys(FUND_URLS) }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const result = await fetchNAV(sym);
  if (!result || result.error || !result.price) {
    return new Response(JSON.stringify({
      error: result?.error || 'Not found',
      symbol: sym,
      known: Object.keys(FUND_URLS),
    }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
  return new Response(JSON.stringify({
    symbol: sym,
    price: result.price,
    currency: 'RON',
    source: 'btam.ro',
    fetchedAt: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      // Cache 3h — fund NAV updates once per business day
      'Cache-Control': 'public, max-age=10800, s-maxage=10800',
      ...CORS,
    },
  });
}
