export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// FRED economic data series
const SERIES = {
  'FEDFUNDS': { name: 'Fed Funds Rate', unit: '%' },
  'CPIAUCSL': { name: 'CPI (Inflation)', unit: 'index' },
  'UNRATE': { name: 'Unemployment Rate', unit: '%' },
  'GDP': { name: 'Real GDP', unit: 'B$' },
  'T10Y2Y': { name: '10Y-2Y Spread', unit: '%' },
  'VIXCLS': { name: 'VIX (Daily)', unit: '' },
};

async function fetchFREDSeries(seriesId, apiKey) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=24`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data.observations || []).filter(o => o.value !== '.').slice(0, 12);
    return obs.map(o => ({ date: o.date, value: parseFloat(o.value) }));
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'FRED_API_KEY not configured. Get a free key at fred.stlouisfed.org/docs/api/api_key.html' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  const results = await Promise.allSettled(
    Object.keys(SERIES).map(async id => {
      const data = await fetchFREDSeries(id, apiKey);
      return { id, ...SERIES[id], data };
    })
  );

  const macro = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.data) {
      const v = r.value;
      macro[v.id] = {
        name: v.name,
        unit: v.unit,
        latest: v.data[0]?.value,
        latestDate: v.data[0]?.date,
        previous: v.data[1]?.value,
        trend: v.data.length >= 2 ? (v.data[0].value > v.data[1].value ? 'RISING' : v.data[0].value < v.data[1].value ? 'FALLING' : 'FLAT') : null,
        history: v.data.slice(0, 6),
      };
    }
  }

  // Yield curve inversion warning
  const spread = macro['T10Y2Y'];
  let yieldCurveWarning = null;
  if (spread?.latest != null && spread.latest < 0) {
    yieldCurveWarning = 'INVERTED — historically predicts recession within 12-18 months';
  }

  return new Response(JSON.stringify({ macro, yieldCurveWarning, fetchedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
  });
}
