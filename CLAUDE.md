# Mortgage Calculator

A vanilla HTML/CSS/JS mortgage calculator for kashvector.com/mortgage/.

## Purpose

Calculate Australian home loan repayments, total interest, and the impact of offset accounts and extra repayments. Supports P&I and Interest Only loan types, three repayment frequencies, and side-by-side frequency comparison.

## Tech Stack

- Vanilla HTML/CSS/JS (no frameworks, no build step)
- Chart.js v4 (CDN) for the balance/interest chart
- Node built-in test runner for calc unit tests

## File Structure

```
www/
  index.html       ← UI (script load order: utils.js → calc/mortgage.js → Chart.js → app.js)
  style.css        ← KashVector dark theme + mortgage-specific additions
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

From `C:\Projects\Rules\kashvector-design.md`:
- bg `#0f172a`, card `#1e293b`, card-2 `#263248`
- text `#f1f5f9`, muted `#94a3b8`, accent `#38bdf8`, border `#334155`
- pass `#22c55e`, fail `#ef4444`, warn `#f59e0b`
- Font: system-ui (vanilla tools)
- localStorage key: `kv_mortgage_inputs`

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
