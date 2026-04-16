export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

async function fetchDCFInputs(symbol) {
  try {
    const modules = 'price,defaultKeyStatistics,financialData,incomeStatementHistory,cashflowStatementHistory';
    // Try query2 first, fall back to query1
    let res = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      res = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`,
        { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) },
      );
    }
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.quoteSummary?.result?.[0];
    if (!r) return null;

    const price = r.price?.regularMarketPrice?.raw;
    const sharesOut = r.defaultKeyStatistics?.sharesOutstanding?.raw || r.price?.sharesOutstanding?.raw;
    const fd = r.financialData || {};

    // Get latest free cash flow from cash flow statement
    const cfStatements = r.cashflowStatementHistory?.cashflowStatements || [];
    const latestCF = cfStatements[0];
    const fcf = latestCF?.totalCashFromOperatingActivities?.raw
      ? (latestCF.totalCashFromOperatingActivities.raw + (latestCF.capitalExpenditures?.raw || 0))
      : null;

    // Get revenue growth for growth estimate
    const incStatements = r.incomeStatementHistory?.incomeStatementHistory || [];
    let revenueGrowth = null;
    if (incStatements.length >= 2) {
      const rev0 = incStatements[0]?.totalRevenue?.raw;
      const rev1 = incStatements[1]?.totalRevenue?.raw;
      if (rev0 && rev1) revenueGrowth = (rev0 - rev1) / rev1;
    }

    return {
      symbol: symbol.toUpperCase(),
      name: r.price?.shortName || symbol,
      currentPrice: price,
      sharesOutstanding: sharesOut,
      marketCap: r.price?.marketCap?.raw,
      freeCashFlow: fcf,
      fcfPerShare: fcf && sharesOut ? fcf / sharesOut : null,
      revenueGrowth,
      earningsGrowth: fd.earningsGrowth?.raw,
      profitMargins: fd.profitMargins?.raw,
      debtToEquity: fd.debtToEquity?.raw,
    };
  } catch { return null; }
}

function runDCF(fcf, growthRate, terminalGrowth, discountRate, years) {
  if (!fcf || fcf <= 0) return null;
  const projections = [];
  let totalPV = 0;
  let currentFCF = fcf;

  for (let y = 1; y <= years; y++) {
    currentFCF *= (1 + growthRate);
    const pv = currentFCF / Math.pow(1 + discountRate, y);
    totalPV += pv;
    projections.push({ year: y, fcf: currentFCF, pv });
  }

  // Terminal value (Gordon Growth Model)
  const terminalFCF = currentFCF * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (discountRate - terminalGrowth);
  const terminalPV = terminalValue / Math.pow(1 + discountRate, years);
  const enterpriseValue = totalPV + terminalPV;

  return { projections, terminalValue, terminalPV, totalPV, enterpriseValue };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const { symbol } = body;
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const inputs = await fetchDCFInputs(symbol);
  if (!inputs) {
    return new Response(JSON.stringify({ error: 'Could not fetch data for ' + symbol }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Default assumptions (user can override via body params)
  const growthRate = body.growthRate ?? (inputs.revenueGrowth ? Math.min(inputs.revenueGrowth, 0.25) : 0.10);
  const terminalGrowth = body.terminalGrowth ?? 0.03;
  const discountRate = body.discountRate ?? 0.10;
  const years = body.years ?? 10;

  const dcf = inputs.freeCashFlow ? runDCF(inputs.freeCashFlow, growthRate, terminalGrowth, discountRate, years) : null;

  let fairValue = null, upside = null, verdict = null;
  if (dcf && inputs.sharesOutstanding) {
    fairValue = dcf.enterpriseValue / inputs.sharesOutstanding;
    if (inputs.currentPrice) {
      upside = (fairValue - inputs.currentPrice) / inputs.currentPrice * 100;
      verdict = upside > 20 ? 'UNDERVALUED' : upside > -10 ? 'FAIR_VALUE' : 'OVERVALUED';
    }
  }

  return new Response(JSON.stringify({
    ...inputs,
    assumptions: { growthRate, terminalGrowth, discountRate, years },
    dcf,
    fairValue,
    upside: upside != null ? upside.toFixed(1) + '%' : null,
    verdict,
  }), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
