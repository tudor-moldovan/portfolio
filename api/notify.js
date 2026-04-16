export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    return new Response(
      JSON.stringify({ error: 'WEBHOOK_URL not configured. Set it in Vercel environment variables.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const { event, message, data } = body;
  if (!event || !message) {
    return new Response(JSON.stringify({ error: 'event and message required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const icons = {
    'stop-loss': '🛑',
    'trade-executed': '💰',
    'drawdown-alert': '⚠️',
    'milestone': '🎯',
    'daily-scan': '📊',
  };

  const text = `${icons[event] || '📌'} ${event.toUpperCase()}\n${message}`;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, ...data }),
      signal: AbortSignal.timeout(5000),
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Webhook failed: ' + e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
