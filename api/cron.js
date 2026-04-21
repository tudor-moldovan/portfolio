// Minimal cron stub. No schedule is set in vercel.json during Phase 1.
// Phase 3 will wire this to the weekly reckoning report.
export const config = { maxDuration: 30 };

function getHeader(req, name) {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name);
  return req?.headers?.[name.toLowerCase()] ?? null;
}

export default async function handler(req) {
  const authHeader = getHeader(req, 'authorization');
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://localhost');
  const keyParam = url.searchParams.get('key');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true, note: 'cron placeholder — Phase 3 will wire weekly report' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
