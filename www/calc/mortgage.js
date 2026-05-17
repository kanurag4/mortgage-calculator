'use strict';

const PERIODS = { weekly: 52, fortnightly: 26, monthly: 12 };

// Standard P&I repayment per period using the amortisation formula.
function repaymentAmount(principal, annualRate, years, frequency) {
  if (!PERIODS[frequency]) throw new Error(`Unknown frequency: "${frequency}"`);
  const n = years * PERIODS[frequency];
  if (n <= 0) return 0;
  const r = annualRate / PERIODS[frequency];
  if (r === 0) return principal / n;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// Interest-only repayment per period.
function interestOnlyRepayment(principal, annualRate, frequency) {
  return (principal * annualRate) / PERIODS[frequency];
}

// Full amortisation schedule (the core engine).
// Handles offset, extra repayments, and an optional interest-only period.
function buildSchedule({
  principal,
  annualRate,
  years,
  frequency,
  offsetBalance = 0,
  extraPerPeriod = 0,
  loanType = 'pi',
  ioPeriodYears = 0,
}) {
  const r = annualRate / PERIODS[frequency];
  const totalPeriods = years * PERIODS[frequency];
  // Clamp IO period so it cannot exceed the loan term.
  const ioPeriods = Math.min(Math.round(ioPeriodYears * PERIODS[frequency]), totalPeriods);

  // Compute P&I required repayment for the phase after IO ends.
  // If IO period covers the full term, there's no P&I phase.
  const piPeriods = totalPeriods - ioPeriods;
  const piRepayment = piPeriods > 0 && r > 0
    ? principal * r * Math.pow(1 + r, piPeriods) / (Math.pow(1 + r, piPeriods) - 1)
    : piPeriods > 0 ? principal / piPeriods : 0;

  // Negative extra repayments don't make sense — clamp to zero.
  extraPerPeriod = Math.max(0, extraPerPeriod);

  let balance = principal;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const schedule = [];

  for (let period = 1; period <= totalPeriods; period++) {
    const effectivePrincipal = Math.max(balance - offsetBalance, 0);
    const interest = effectivePrincipal * r;

    let payment, principalPaid;
    const inIOPhase = loanType === 'io' && period <= ioPeriods;

    if (inIOPhase) {
      payment = interest;
      principalPaid = 0;
    } else {
      // P&I phase — recompute required repayment if we just crossed the IO boundary
      let required;
      if (loanType === 'io' && period === ioPeriods + 1) {
        // Recalculate on current balance and remaining periods
        const remaining = totalPeriods - period + 1;
        required = remaining > 0 && r > 0
          ? balance * r * Math.pow(1 + r, remaining) / (Math.pow(1 + r, remaining) - 1)
          : remaining > 0 ? balance / remaining : 0;
      } else if (period === 1) {
        required = piRepayment;
      } else {
        // Use the same required repayment (stored externally as closure is over piRepayment)
        // This is only correct for the non-IO case. For IO, we recalc on transition.
        required = piRepayment;
      }
      payment = required + extraPerPeriod;
      principalPaid = Math.min(payment - interest, balance);
      payment = principalPaid + interest;
    }

    cumulativeInterest += interest;
    cumulativePrincipal += principalPaid;
    balance = Math.max(balance - principalPaid, 0);

    schedule.push({
      period,
      payment,
      interest,
      principalPaid,
      balance,
      cumulativeInterest,
      cumulativePrincipal,
    });

    if (balance <= 0) break;
  }

  return schedule;
}

// Aggregate headline figures from a schedule.
function computeSummary(schedule, principal) {
  if (!schedule.length) return { totalInterest: 0, totalPaid: 0, periodsActual: 0, paidOff: false, remainingBalance: principal };
  const last = schedule[schedule.length - 1];
  const totalInterest = last.cumulativeInterest;
  // Use tracked principal repaid — avoids over-counting when loan is never fully paid.
  const totalPaid = last.cumulativePrincipal + totalInterest;
  const paidOff = last.balance <= 0;
  return { totalInterest, totalPaid, periodsActual: last.period, paidOff, remainingBalance: last.balance };
}

// Baseline for savings comparison (no offset, no extra repayments).
function baselineSummary(principal, annualRate, years, frequency, loanType = 'pi', ioPeriodYears = 0) {
  const schedule = buildSchedule({ principal, annualRate, years, frequency, loanType, ioPeriodYears });
  return computeSummary(schedule, principal);
}

// Single row for the frequency comparison table.
function frequencyRow(principal, annualRate, years, frequency, offsetBalance = 0) {
  const schedule = buildSchedule({ principal, annualRate, years, frequency, offsetBalance });
  const summary = computeSummary(schedule, principal);
  const repayment = repaymentAmount(principal, annualRate, years, frequency);
  return { frequency, repayment, totalInterest: summary.totalInterest, totalPaid: summary.totalPaid, periods: summary.periodsActual };
}

// 3-row comparison table: weekly, fortnightly, monthly.
function frequencyComparison(principal, annualRate, years, offsetBalance = 0) {
  const monthly = frequencyRow(principal, annualRate, years, 'monthly', offsetBalance);
  const fortnightly = frequencyRow(principal, annualRate, years, 'fortnightly', offsetBalance);
  const weekly = frequencyRow(principal, annualRate, years, 'weekly', offsetBalance);
  return [monthly, fortnightly, weekly];
}

// Roll up period schedule into yearly snapshots for the chart.
function annualSummary(schedule, frequency) {
  const perYear = PERIODS[frequency];
  const result = [];
  let year = 1;
  let periodEnd = perYear;

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    if (row.period >= periodEnd || i === schedule.length - 1) {
      result.push({
        year,
        balance: row.balance,
        cumulativeInterest: row.cumulativeInterest,
        cumulativePrincipal: row.cumulativePrincipal,
      });
      year++;
      periodEnd += perYear;
      if (row.balance <= 0) break;
    }
  }
  return result;
}

// Format a period count as "X yrs Y mo" using monthly equivalents.
function formatDuration(periods, frequency) {
  const totalMonths = Math.round(periods * 12 / PERIODS[frequency]);
  const yrs = Math.floor(totalMonths / 12);
  const mo = totalMonths % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mo} mo`;
}

if (typeof module !== 'undefined') module.exports = {
  PERIODS,
  repaymentAmount,
  interestOnlyRepayment,
  buildSchedule,
  computeSummary,
  baselineSummary,
  frequencyComparison,
  annualSummary,
  formatDuration,
};
