import { runValuation } from './_lib/valuation.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const out = await runValuation();
    return new Response(JSON.stringify(out), {
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
