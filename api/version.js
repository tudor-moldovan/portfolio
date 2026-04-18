export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default function handler() {
  // Vercel injects VERCEL_GIT_COMMIT_SHA and friends at build time.
  return new Response(JSON.stringify({
    sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    shaShort: (process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7),
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null,
    region: process.env.VERCEL_REGION || 'unknown',
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}
