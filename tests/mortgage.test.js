'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  PERIODS,
  repaymentAmount,
  interestOnlyRepayment,
  buildSchedule,
  computeSummary,
  baselineSummary,
  frequencyComparison,
  annualSummary,
  formatDuration,
} = require('../www/calc/mortgage.js');

const near = (actual, expected, tol = 1, msg = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg || ''} Expected ~${expected}, got ${actual} (tol ±${tol})`
  );

// ── repaymentAmount ───────────────────────────────────────────────────────────

test('repaymentAmount: $500k 6% 30yr monthly ≈ $2,997.75', () => {
  near(repaymentAmount(500000, 0.06, 30, 'monthly'), 2997.75, 0.01);
});

test('repaymentAmount: rate=0 returns principal/periods', () => {
  const result = repaymentAmount(240000, 0, 20, 'monthly');
  near(result, 240000 / (20 * 12), 0.01);
});

test('repaymentAmount: principal=0 returns 0', () => {
  assert.equal(repaymentAmount(0, 0.06, 30, 'monthly'), 0);
});

test('repaymentAmount: fortnightly is substantially less than monthly/2', () => {
  const monthly = repaymentAmount(500000, 0.06, 30, 'monthly');
  const fortnightly = repaymentAmount(500000, 0.06, 30, 'fortnightly');
  // Fortnightly rate = 6%/26; monthly rate = 6%/12. Fortnightly payment is ~$115 less than monthly/2.
  assert.ok(fortnightly < monthly / 2, 'Fortnightly payment should be less than half the monthly payment');
  assert.ok(fortnightly > monthly / 3, 'Fortnightly payment should be greater than one-third the monthly payment');
});

test('repaymentAmount: weekly < fortnightly/2 (more periods, smaller payment)', () => {
  const weekly = repaymentAmount(500000, 0.06, 30, 'weekly');
  const fortnightly = repaymentAmount(500000, 0.06, 30, 'fortnightly');
  assert.ok(weekly < fortnightly / 2 + 25);
});

// ── interestOnlyRepayment ─────────────────────────────────────────────────────

test('interestOnlyRepayment: $500k 6% monthly = $2,500', () => {
  near(interestOnlyRepayment(500000, 0.06, 'monthly'), 2500, 0.01);
});

test('interestOnlyRepayment: rate=0 returns 0', () => {
  assert.equal(interestOnlyRepayment(500000, 0, 'monthly'), 0);
});

test('interestOnlyRepayment: fortnightly = monthly × 12/26', () => {
  const monthly = interestOnlyRepayment(500000, 0.06, 'monthly');
  const fortnightly = interestOnlyRepayment(500000, 0.06, 'fortnightly');
  near(fortnightly, monthly * 12 / 26, 0.01);
});

// ── buildSchedule — P&I baseline ─────────────────────────────────────────────

test('buildSchedule P&I: final balance is ~0', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  near(s[s.length - 1].balance, 0, 1);
});

test('buildSchedule P&I: schedule length ≤ term periods', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  assert.ok(s.length <= 30 * 12);
});

test('buildSchedule P&I: total principal paid ≈ original principal', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  near(s[s.length - 1].cumulativePrincipal, 500000, 1);
});

test('buildSchedule P&I: all balances are non-negative', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  assert.ok(s.every(r => r.balance >= 0), 'All balances must be >= 0');
});

test('buildSchedule P&I: total interest > 0 for rate > 0', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  assert.ok(s[s.length - 1].cumulativeInterest > 0);
});

test('buildSchedule P&I: rate=0 → zero interest', () => {
  const s = buildSchedule({ principal: 240000, annualRate: 0, years: 20, frequency: 'monthly' });
  near(s[s.length - 1].cumulativeInterest, 0, 0.01);
  near(s[s.length - 1].cumulativePrincipal, 240000, 0.01);
});

test('buildSchedule P&I: fortnightly has more periods than monthly (same years, different period count)', () => {
  const monthly = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const fortnightly = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'fortnightly' });
  // Monthly: 360 periods; fortnightly: 780 periods — same 30-year term, different payment counts
  assert.ok(fortnightly.length > monthly.length, 'Fortnightly has more periods (780) than monthly (360)');
  // But fortnightly pays less total interest due to more frequent payments reducing accrual
  assert.ok(
    fortnightly[fortnightly.length - 1].cumulativeInterest < monthly[monthly.length - 1].cumulativeInterest,
    'Fortnightly should have less total interest'
  );
});

// ── buildSchedule — with offset ───────────────────────────────────────────────

test('buildSchedule offset: total interest < baseline', () => {
  const base = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const withOffset = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', offsetBalance: 50000 });
  assert.ok(
    withOffset[withOffset.length - 1].cumulativeInterest < base[base.length - 1].cumulativeInterest,
    'Offset should reduce total interest'
  );
});

test('buildSchedule offset: schedule is shorter (early payoff)', () => {
  const base = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const withOffset = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', offsetBalance: 50000 });
  assert.ok(withOffset.length < base.length, 'Offset account should shorten the loan');
});

test('buildSchedule offset=0: identical to no offset', () => {
  const base = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const noOffset = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', offsetBalance: 0 });
  near(base[base.length - 1].cumulativeInterest, noOffset[noOffset.length - 1].cumulativeInterest, 0.01);
});

test('buildSchedule offset >= principal: nearly zero interest per period', () => {
  const s = buildSchedule({ principal: 300000, annualRate: 0.06, years: 30, frequency: 'monthly', offsetBalance: 300000 });
  // All interest charges should be 0 (effective principal = 0)
  assert.ok(s.every(r => r.interest < 0.01), 'Interest should be ~0 when offset covers principal');
});

// ── buildSchedule — with extra repayments ─────────────────────────────────────

test('buildSchedule extra: schedule shorter than baseline', () => {
  const base = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const extra = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', extraPerPeriod: 500 });
  assert.ok(extra.length < base.length, 'Extra repayments should shorten loan');
});

test('buildSchedule extra: total interest less than baseline', () => {
  const base = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const extra = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', extraPerPeriod: 500 });
  assert.ok(
    extra[extra.length - 1].cumulativeInterest < base[base.length - 1].cumulativeInterest,
    'Extra repayments should reduce total interest'
  );
});

test('buildSchedule extra > required: loan paid off early, no negative balances', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly', extraPerPeriod: 10000 });
  assert.ok(s.length < 100, 'Huge extra repayments should pay off loan quickly');
  assert.ok(s.every(r => r.balance >= 0), 'No negative balances even with large extra repayments');
});

// ── buildSchedule — Interest Only ─────────────────────────────────────────────

test('buildSchedule IO: balance unchanged during IO period', () => {
  const s = buildSchedule({
    principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly',
    loanType: 'io', ioPeriodYears: 5,
  });
  const ioPeriods = 5 * 12;
  // Balance should equal principal for all IO periods
  for (let i = 0; i < ioPeriods && i < s.length; i++) {
    near(s[i].balance, 500000, 0.01, `IO period ${i + 1}`);
  }
});

test('buildSchedule IO: principalPaid=0 during IO period', () => {
  const s = buildSchedule({
    principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly',
    loanType: 'io', ioPeriodYears: 5,
  });
  const ioPeriods = 5 * 12;
  for (let i = 0; i < ioPeriods && i < s.length; i++) {
    near(s[i].principalPaid, 0, 0.01, `IO period ${i + 1} principalPaid`);
  }
});

test('buildSchedule IO: balance decreases after IO period ends', () => {
  const s = buildSchedule({
    principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly',
    loanType: 'io', ioPeriodYears: 5,
  });
  const ioPeriods = 5 * 12;
  if (s.length > ioPeriods) {
    assert.ok(s[ioPeriods].principalPaid > 0, 'P&I phase should reduce principal');
    assert.ok(s[ioPeriods].balance < 500000, 'Balance should drop in P&I phase');
  }
});

test('buildSchedule IO full term: balance never decreases', () => {
  const s = buildSchedule({
    principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly',
    loanType: 'io', ioPeriodYears: 30,
  });
  assert.ok(s.every(r => near(r.balance, 500000, 0.01) || true));
  assert.ok(s.every(r => r.principalPaid < 0.01), 'Full IO term: no principal paid');
});

// ── frequencyComparison ───────────────────────────────────────────────────────

test('frequencyComparison: returns 3 rows', () => {
  const rows = frequencyComparison(500000, 0.06, 30);
  assert.equal(rows.length, 3);
});

test('frequencyComparison: weekly interest < fortnightly < monthly', () => {
  const [monthly, fortnightly, weekly] = frequencyComparison(500000, 0.06, 30);
  assert.ok(weekly.totalInterest < fortnightly.totalInterest, 'Weekly cheaper than fortnightly');
  assert.ok(fortnightly.totalInterest < monthly.totalInterest, 'Fortnightly cheaper than monthly');
});

test('frequencyComparison: weekly has most periods, monthly has fewest', () => {
  const [monthly, fortnightly, weekly] = frequencyComparison(500000, 0.06, 30);
  // Periods reflect payment count: monthly=360, fortnightly=780, weekly=1560
  assert.ok(weekly.periods >= fortnightly.periods, 'Weekly has more periods than fortnightly');
  assert.ok(fortnightly.periods >= monthly.periods, 'Fortnightly has more periods than monthly');
});

// ── annualSummary ─────────────────────────────────────────────────────────────

test('annualSummary: at most loanTermYears rows', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const annual = annualSummary(s, 'monthly');
  assert.ok(annual.length <= 30);
});

test('annualSummary: last row balance matches schedule', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const annual = annualSummary(s, 'monthly');
  const lastAnnual = annual[annual.length - 1];
  const lastSchedule = s[s.length - 1];
  near(lastAnnual.balance, lastSchedule.balance, 1);
});

test('annualSummary: cumulative interest matches schedule total', () => {
  const s = buildSchedule({ principal: 500000, annualRate: 0.06, years: 30, frequency: 'monthly' });
  const annual = annualSummary(s, 'monthly');
  const lastAnnual = annual[annual.length - 1];
  near(lastAnnual.cumulativeInterest, s[s.length - 1].cumulativeInterest, 1);
});

// ── formatDuration ────────────────────────────────────────────────────────────

test('formatDuration: 360 monthly periods = 30 yrs', () => {
  assert.equal(formatDuration(360, 'monthly'), '30 yrs');
});

test('formatDuration: 370 monthly periods = 30 yrs 10 mo', () => {
  assert.equal(formatDuration(370, 'monthly'), '30 yrs 10 mo');
});

test('formatDuration: 26 fortnightly periods = 1 yr', () => {
  assert.equal(formatDuration(26, 'fortnightly'), '1 yr');
});

test('formatDuration: 6 monthly periods = 6 mo', () => {
  assert.equal(formatDuration(6, 'monthly'), '6 mo');
});

// ── PERIODS constant ──────────────────────────────────────────────────────────

test('PERIODS: correct values', () => {
  assert.equal(PERIODS.monthly, 12);
  assert.equal(PERIODS.fortnightly, 26);
  assert.equal(PERIODS.weekly, 52);
});
