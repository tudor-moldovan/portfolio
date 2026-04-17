export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

// Fetch 1-year chart data (this endpoint works reliably)
async function fetchChartData(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
  const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result?.meta?.regularMarketPrice) return null;
  const meta = result.meta;
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
  const volumes = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null);
  const price = meta.regularMarketPrice;
  const high52 = meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : null);
  const low52 = meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : null);

  // Compute indicators
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  const sma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;

  // Wilder's RSI
  let rsi = null;
  if (closes.length >= 15) {
    let ag = 0, al = 0;
    for (let i = 1; i <= 14; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) ag += d; else al -= d;
    }
    ag /= 14; al /= 14;
    for (let i = 15; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * 13 + (d >= 0 ? d : 0)) / 14;
      al = (al * 13 + (d < 0 ? -d : 0)) / 14;
    }
    rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }

  // 1-year return
  const yearReturn = closes.length > 1 ? ((price - closes[0]) / closes[0]) * 100 : null;

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    prevClose: meta.previousClose,
    changePercent: meta.previousClose ? ((price - meta.previousClose) / meta.previousClose) * 100 : 0,
    high52, low52,
    fiftyTwoWeekPosition: (high52 && low52 && high52 !== low52) ? ((price - low52) / (high52 - low52)) * 100 : null,
    sma50, sma200,
    rsi,
    yearReturn,
    marketCap: meta.marketCap,
    volume: meta.regularMarketVolume,
  };
}

// Ask Claude to generate the moat/valuation analysis
async function askClaudeForAnalysis(stockData, apiKey) {
  const { symbol, name, price, high52, low52, fiftyTwoWeekPosition, sma50, sma200, rsi, yearReturn, marketCap } = stockData;
  const prompt = `Analyze ${symbol} (${name}) for a moat-focused long-term investor.

Current data:
- Price: $${price?.toFixed(2)}
- 52-week range: $${low52?.toFixed(2)} — $${high52?.toFixed(2)} (currently ${fiftyTwoWeekPosition?.toFixed(0)}% of range)
- 1-year return: ${yearReturn?.toFixed(1)}%
- SMA50: $${sma50?.toFixed(2) || '?'}, SMA200: $${sma200?.toFixed(2) || '?'}
- RSI14: ${rsi?.toFixed(0) || '?'}
- Market cap: $${marketCap ? (marketCap / 1e9).toFixed(0) + 'B' : '?'}

Provide a crisp analysis with ONLY valid JSON (no markdown, no commentary):
{
  "moatRating": "FORTRESS | STRONG | INTACT | ERODING",
  "moatExplanation": "<2 sentences on what the moat is>",
  "valuationVerdict": "UNDERVALUED | FAIR | RICH | OVERVALUED",
  "valuationReasoning": "<1-2 sentences comparing current price to typical valuation>",
  "technicalSetup": "<1-2 sentences on what the charts say>",
  "keyRisks": "<1-2 sentences>",
  "catalyst": "<ONE specific event/metric that would change the rating>",
  "convictionScore": <1-10>,
  "verdict": "BUY_ZONE | ACCUMULATE | HOLD | WATCH | AVOID",
  "oneSentenceSummary": "<pithy takeaway>"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const sym = symbol.toUpperCase();
    const stockData = await fetchChartData(sym);
    if (!stockData) {
      return new Response(JSON.stringify({ error: `Could not fetch price data for ${sym}. Check the ticker symbol.` }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const analysis = await askClaudeForAnalysis(stockData, apiKey);

    return new Response(JSON.stringify({ ...stockData, ...analysis }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600', ...CORS },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Intel failed: ' + (e.message || String(e)) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    );
  }
}
