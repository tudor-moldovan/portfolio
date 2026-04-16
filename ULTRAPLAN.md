# Ultra Plan: Portfolio App Upgrade

## 7 Phases, 32 Items — From Prototype to Credible Trading System

---

## PHASE 1: Critical Bug Fixes (Ship First)

### 1A. Stop-loss stale price fix
- **File**: `index.html` — `checkStopLosses()` (line ~466)
- Make function `async`, re-fetch fresh quotes for candidates via `/api/quote` before executing
- Re-evaluate stop condition with fresh price; remove false triggers

### 1B. Auto-sync to Vercel KV after every trade
- **File**: `index.html` — `executeTrade()`, `checkStopLosses()`, `confirmReset()`
- Fire-and-forget `cloudSync()` after every `save()` call
- Prevents data loss on tab close or browser cache clear

### 1C. Rate limiting on Ask Claude button
- **File**: `index.html` — `askClaude()`
- Add 30-second cooldown after each call with visible countdown on button
- Prevents Yahoo Finance IP bans from rapid clicking

### 1D. Correlation minimum threshold
- **File**: `api/analyze.js` — `pearson()` (line ~62)
- Change `if (n < 5)` to `if (n < 30)` for statistical significance

---

## PHASE 2: Calculation Correctness

### 2A. RSI: Wilder's smoothing (replaces Cutler's)
- **Files**: `api/analyze.js`, `api/backtest.js`, `api/cron.js`
- Implement exponential smoothing: `avgGain = (prevAvgGain * 13 + currentGain) / 14`
- Process full history, not just a trailing slice

### 2B. Backtest equity curve O(n²) → O(n)
- **File**: `api/backtest.js` (line ~133)
- Build `Map<date, trade>` before the loop, replace `trades.find()` with `Map.get()`

### 2C. Sharpe ratio: log returns
- **File**: `index.html` — `calcMetrics()` (line ~353)
- Change `(snaps[i].v - snaps[i-1].v) / snaps[i-1].v` to `Math.log(snaps[i].v / snaps[i-1].v)`

### 2D. Alpha annualization
- **File**: `index.html` — `calcMetrics()` (line ~370)
- Annualize returns before computing alpha: `(1 + totalReturn)^(252/tradingDays) - 1`

---

## PHASE 3: Risk Management

### 3A. Frontend constraint enforcement
- **File**: `index.html` — `executeTrade()`
- Block BUY if post-trade position > 30% of portfolio
- Warn if sector concentration > 40%
- Show confirmation dialog with violation details

### 3B. Portfolio drawdown circuit breaker
- **File**: `index.html` — `fetchPrices()` / `renderStats()`
- Track `portfolio.peakValue`, show warning banner if drawdown > 15%
- Disable BUY execution when circuit breaker is active

### 3C. Volatility-adjusted position sizing
- **Files**: `api/analyze.js` (new helper + prompt update), `index.html` (display)
- Compute 20-day annualized volatility per stock from daily log returns
- Add to Claude prompt: "Position size = (portfolio × 1%) / (price × dailyVol × √252)"

### 3D. Earnings date warning
- **Files**: `api/analyze.js` (prompt + response), `index.html` (executeTrade)
- Flag stocks with earnings within 5 trading days as "⚠ EARNINGS SOON"
- Block or warn on buy execution near earnings

### 3E. Sector concentration hard limits
- **File**: `index.html` — `executeTrade()`
- Combine with 3A: reject trades that push any sector above 40%

---

## PHASE 4: Data Quality & Resilience

### 4A. Yahoo Finance cache with Vercel KV fallback
- **Files**: `api/quote.js`, `api/analyze.js`
- On success: cache to KV with 1-hour TTL
- On failure: serve from KV with `{stale: true}` flag
- Frontend shows yellow indicator for stale data

### 4B. Retry with exponential backoff
- **Files**: All `api/*.js` files
- Create `api/_lib/fetch.js` shared utility: 2 retries, 1s/2s backoff
- Replace all bare `fetch()` calls to Yahoo Finance

### 4C. VIX + 10Y yield for market regime
- **Files**: `api/analyze.js`, `api/cron.js`, `index.html`
- Add `^VIX` and `^TNX` to UNIVERSE
- Add "Macro Environment" section to Claude prompt
- VIX < 15 = aggressive, 15-25 = normal, 25-35 = cautious, > 35 = defensive

### 4D. UTC timezone fix
- **Files**: `index.html`, `api/analyze.js`
- Replace `new Date().toISOString().slice(0,10)` with ET-aware helper
- Use `toLocaleDateString('en-CA', {timeZone: 'America/New_York'})`

---

## PHASE 5: Backtester Improvements

### 5A. Commission/slippage model
- **Files**: `api/backtest.js`, `index.html`
- Add `{commissionPct: 0.001, slippagePct: 0.0005}` cost model
- Buy at `close × (1 + slippage + commission)`, sell at `close × (1 - slippage - commission)`
- Add cost model inputs to frontend UI

### 5B. Risk-adjusted metrics (Sharpe, Sortino, Calmar)
- **File**: `api/backtest.js`
- Compute from daily equity curve returns
- Add to response and frontend display

### 5C. Walk-forward validation
- **Files**: `api/backtest.js`, `index.html`
- Split data: first 6mo in-sample, last 6mo out-of-sample
- Run strategy on both, report side by side
- Add checkbox to frontend

### 5D. Gap handling
- **File**: `api/backtest.js`
- Fetch OHLC data (not just closes)
- If open gaps through stop level, execute at open price

### 5E. Multi-stock portfolio backtesting
- **File**: New `api/backtest-portfolio.js`
- Accept array of symbols, shared cash pool, position sizing
- Track portfolio-level metrics (correlation effects, sector exposure)

---

## PHASE 6: Intelligence Upgrades

### 6A. Keyword-based news sentiment scoring
- **File**: `api/analyze.js`
- Score headlines: positive words (+1), negative words (-1), normalize
- Include `Sentiment: +0.4` per stock in Claude context

### 6B. Audit trail
- **Files**: `index.html`, `api/portfolio.js`
- On trade execution, save: full recommendation JSON, portfolio snapshot, market quotes
- Store in localStorage + KV as `auditLog` (trim to last 100 entries)

### 6C. Dividend tracking
- **Files**: `api/analyze.js`, `index.html`
- Display dividend yield in holdings table
- Include estimated annual dividend income

---

## PHASE 7: Market Regime Detection

### 7A. Full regime classification
- **File**: `api/analyze.js`, `index.html`
- `detectRegime(vix, spySMA50)` → RISK_ON / NORMAL / CAUTIOUS / RISK_OFF
- Pass to Claude with per-regime position sizing guidance
- Display current regime badge in header

---

## Dependency Graph

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
                           │            │
                           ▼            ▼
                        Phase 5      Phase 7
                           │
                           ▼
                        Phase 6 (parallel with 5)
```

## Constraints

- Vercel Hobby: 10s edge function timeout (Pro: 30s)
- Vercel KV: 1MB value limit (trim audit logs)
- No shared modules across edge functions without `api/_lib/` pattern
- Stop-loss monitoring is client-side only (runs when page is open)
- Yahoo Finance rate limits: parallelize aggressively, add retries
