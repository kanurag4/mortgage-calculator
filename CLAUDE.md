# Mortgage Calculator

A vanilla HTML/CSS/JS mortgage calculator for kashvector.com/mortgage/.

## Purpose

Calculate Australian home loan repayments, total interest, and the impact of offset accounts and extra repayments. Supports P&I and Interest Only loan types, three repayment frequencies, side-by-side frequency comparison, property purchase mode (LVR/LMI), and a rate stress test card.

## Tech Stack

- Vanilla HTML/CSS/JS (no frameworks, no build step)
- Chart.js v4 (CDN) for the balance/interest chart
- Node built-in test runner for calc unit tests

## File Structure

```
www/
  index.html       ← UI (script load order: utils.js → calc/mortgage.js → Chart.js → app.js)
  style.css        ← KashVector dark theme + mortgage-specific additions + light mode overrides
  utils.js         ← formatCurrency, parseMoney, formatMoneyInput (pure, Node-testable)
  calc/
    mortgage.js    ← ALL calculation logic (pure functions, Node-testable)
  app.js           ← ONLY file that touches DOM / localStorage / events
tests/
  mortgage.test.js ← node:test suite
```

## Architecture Rules

- **DOM boundary**: only `app.js` touches the DOM, localStorage, and event listeners. All other files are pure functions.
- **Calc files**: every function in `mortgage.js` must work in Node (no `window`, no `document`). Export via `if (typeof module !== 'undefined') module.exports = { ... }` at the bottom.
- **Money inputs**: always `type="text" inputmode="numeric"`. Use `formatMoneyInput(el)` on input events and `parseMoney(el)` to read values.

## Design System

From `C:\Projects\Rules\kashvector-design.md`. **Migrated to the "Ink & Amber" / "Paper & Ink" rebrand 2026-07-22** — see `Kashvector.md`'s "Ink & Amber rebrand — rollout status" section (in `C:\Projects\StockAnalysis`) for the full token table and rollout tracker across all KashVector tools.

**Dark mode "Ink & Amber" (default):**
- bg `#0b1120`, card `#111a30`, card-2 `#182342`
- text `#f5f7fc`, muted `#93a0bd`, accent `#f5a623`, border `#223052`
- pass `#22c55e`, fail `#ef4444`, warn `#f97316`

**Light mode "Paper & Ink":**
- bg `#faf8f4`, card `#ffffff`, card-2 `#f1ede4`
- text `#16202b`, muted `#4d5c6b`, border `#e7e2d8`
- accent `#1a3a5f` (dark navy — inverts with dark mode's amber), warn `#b45309`

Font: Carlito (Google Fonts), base body font-size bumped ~0.5px (15→15.5px), `font-variant-numeric: tabular-nums`, `-webkit-font-smoothing: antialiased`.
localStorage key: `kv_mortgage_inputs`

## Calculation Logic

### Core formula

```
r = annualRate / PERIODS[frequency]   // per-period rate
n = years × PERIODS[frequency]        // total periods
repayment = principal × r × (1+r)^n / ((1+r)^n − 1)
```

### Offset account semantics

The offset account reduces the **effective principal** for interest calculation each period only. It does NOT reduce the loan balance:
```
effectivePrincipal = max(balance − offsetBalance, 0)
interest = effectivePrincipal × r
```
This matches Australian bank behaviour. Balance tracks actual debt.

### Interest Only

During IO period: `payment = interest`, `principalPaid = 0`, balance unchanged.
At IO→P&I transition: required P&I repayment is recomputed on the current balance and remaining term.

### Frequency comparison

Table uses P&I, no extra repayments, but respects the offset balance. "Time saved" column compares each frequency to monthly using: `(monthlyPeriods / 12) − (rowPeriods / PERIODS[freq])` expressed as years/months.

### Property Purchase mode

When `inputMode === 'purchase'`, principal is derived from property price and deposit:
```
loan = max(propertyPrice - deposit, 0)
LVR  = loan / propertyPrice × 100
```
LMI is required when LVR > 80%. Estimated via `estimateLMI(baseLoan, propertyPrice)` in `mortgage.js`.

`renderPurchaseMode()` in `app.js` must be called **before** the `principal <= 0` early-return guard in `renderResults()` — so LVR/LMI display updates even when deposit ≥ property price.

### Rate Stress Test

`renderStressTest(inputs)` shows what the repayment would be at `annualRate + 0.03` (APRA +3% buffer), the extra per-period cost vs the current payment, and total interest at the stress rate.

When `loanType === 'io'`, the baseline comparison uses the IO repayment (interest only on effective principal), not P&I:
```js
const effectivePrincipal = Math.max(inputs.principal - inputs.offsetBalance, 0);
const baseAmt = inputs.loanType === 'io'
  ? interestOnlyRepayment(effectivePrincipal, inputs.annualRate, inputs.frequency)
  : repaymentAmount(inputs.principal, inputs.annualRate, inputs.years, inputs.frequency);
```

## Chart Theme Awareness

The balance/interest chart selects colors based on the current theme at render time:
```js
const isDark = document.documentElement.classList.contains('dark');
const balanceColor = isDark ? '#f5a623' : '#1a3a5f';
const interestColor = isDark ? '#f97316' : '#b45309';
```
This must be re-evaluated on every `renderResults()` call, not cached at startup. Colors match the Ink & Amber accent/warn tokens above — update both together if the palette changes again.

## Running Tests

```
npm test
```

## Source Repository

`github.com/kanurag4/mortgage-calculator`

## Deployment

1. `npm test` — all tests must pass
2. Copy `www/` → `C:\Projects\StockAnalysis\www\mortgage\`
3. Push `C:\Projects\StockAnalysis` → Cloudflare Pages auto-deploys to `kashvector.com/mortgage/`

Steps 3 and 4 from the original setup (hub card + icon) are already done — do not repeat.
