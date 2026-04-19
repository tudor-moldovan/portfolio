// Shared BT Asset Management fund-NAV scraper. Used by:
//   - /api/btam (live serving endpoint, with KV fallback)
//   - /api/cron stepCacheBTAM (writes last-known NAV to KV so the endpoint
//     has a cached fallback when the live scrape fails later)

export const FUND_URLS = {
  ROTX:     'https://www.btam.ro/fonduri/bt-index-romania-rotx',
  BT_USA:   'https://www.btam.ro/fonduri/bt-index-usa',
  BT_WORLD: 'https://www.btam.ro/fonduri/bt-index-world',
  BT_EURO:  'https://www.btam.ro/fonduri/bt-index-euro',
  BT_MAXI:  'https://www.btam.ro/fonduri/bt-maxim',
  BT_CLASIC:'https://www.btam.ro/fonduri/bt-clasic',
  BT_OBLIG: 'https://www.btam.ro/fonduri/bt-obligatiuni',
};

const NAV_PATTERNS = [
  /RON\s*\/\s*Unitate[^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /(\d{1,4}[.,]\d{2,6})\s*RON\s*\/\s*Unitate/i,
  /VUAN[^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /Valoare(?:a)?\s+Unitar[aăe][^0-9\-]{0,40}(\d{1,4}[.,]\d{2,6})/i,
  /(?:activ(?:ului)?\s+net|NAV)[^0-9\-]{0,60}(\d{1,4}[.,]\d{2,6})\s*RON/i,
];

function parseRONNumber(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

export async function fetchNAV(fundKey) {
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
        if (price) return { price };
      }
    }
    return { error: 'No NAV pattern matched; BT layout may have changed' };
  } catch (e) {
    return { error: e.message };
  }
}

export const BTAM_TICKERS = Object.keys(FUND_URLS);
