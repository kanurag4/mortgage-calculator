'use strict';

const $ = id => document.getElementById(id);

const STORAGE_KEY = 'kv_mortgage_inputs';

const DEFAULTS = {
  loanAmount:     '600,000',
  annualRate:     6.0,
  loanTermYears:  30,
  frequency:      'monthly',
  loanType:       'pi',
  ioPeriodYears:  5,
  offsetBalance:  '0',
  extraPerPeriod: '0',
};

const els = {
  loanAmount:       $('loanAmount'),
  annualRate:       $('annualRate'),
  loanTermYears:    $('loanTermYears'),
  frequencySelect:  $('frequencySelect'),
  ioPeriodField:    $('ioPeriodField'),
  ioPeriodYears:    $('ioPeriodYears'),
  offsetBalance:    $('offsetBalance'),
  extraPerPeriod:   $('extraPerPeriod'),
  repaymentDerived: $('repaymentDerived'),
  savingsDerived:   $('savingsDerived'),
  savingsBanner:    $('savingsBanner'),
  freqBody:         $('freqBody'),
  scheduleBody:     $('scheduleBody'),
  scheduleNote:     $('scheduleNote'),
  scheduleDetails:  $('scheduleDetails'),
  repaymentLabel:   $('repaymentLabel'),
  repaymentValue:   $('repaymentValue'),
  repaymentSub:     $('repaymentSub'),
  totalInterestValue: $('totalInterestValue'),
  totalInterestSub:   $('totalInterestSub'),
  totalPaidValue:   $('totalPaidValue'),
  totalPaidSub:     $('totalPaidSub'),
  paidOffValue:     $('paidOffValue'),
  paidOffSub:       $('paidOffSub'),
  interestSavedValue: $('interestSavedValue'),
  timeSavedValue:   $('timeSavedValue'),
};

let loanType = 'pi';
let mortgageChart = null;
let debounceTimer = null;

loadFromStorage();
bindEvents();
renderResults();

// ── Storage ───────────────────────────────────────────────────────────────────

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      loanAmount:    els.loanAmount.value,
      annualRate:    els.annualRate.value,
      loanTermYears: els.loanTermYears.value,
      frequency:     els.frequencySelect.value,
      loanType,
      ioPeriodYears: els.ioPeriodYears.value,
      offsetBalance: els.offsetBalance.value,
      extraPerPeriod: els.extraPerPeriod.value,
    }));
  } catch (_) {}
}

function loadFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;
    if (saved.loanAmount)    els.loanAmount.value    = saved.loanAmount;
    if (saved.annualRate)    els.annualRate.value     = saved.annualRate;
    if (saved.loanTermYears) els.loanTermYears.value  = saved.loanTermYears;
    if (saved.frequency)     els.frequencySelect.value = saved.frequency;
    if (saved.ioPeriodYears) els.ioPeriodYears.value  = saved.ioPeriodYears;
    if (saved.offsetBalance) els.offsetBalance.value  = saved.offsetBalance;
    if (saved.extraPerPeriod) els.extraPerPeriod.value = saved.extraPerPeriod;
    if (saved.loanType && (saved.loanType === 'pi' || saved.loanType === 'io')) {
      loanType = saved.loanType;
      document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === loanType);
      });
      els.ioPeriodField.classList.toggle('visible', loanType === 'io');
    }
  } catch (_) {}
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  [els.loanAmount, els.offsetBalance, els.extraPerPeriod].forEach(el => {
    el.addEventListener('input', () => {
      formatMoneyInput(el);
      saveToStorage();
      scheduleRender();
    });
  });

  [els.annualRate, els.loanTermYears, els.ioPeriodYears].forEach(el => {
    el.addEventListener('input', () => {
      saveToStorage();
      scheduleRender();
    });
  });

  els.frequencySelect.addEventListener('change', () => {
    saveToStorage();
    scheduleRender();
  });

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loanType = btn.dataset.val;
      els.ioPeriodField.classList.toggle('visible', loanType === 'io');
      saveToStorage();
      scheduleRender();
    });
  });

  els.scheduleDetails.addEventListener('toggle', () => {
    if (mortgageChart) mortgageChart.resize();
  });
}

function scheduleRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderResults, 280);
}

// ── Read inputs ───────────────────────────────────────────────────────────────

function getInputs() {
  const principal = parseMoney(els.loanAmount);
  const annualRate = parseFloat(els.annualRate.value) / 100 || 0;
  const years = parseInt(els.loanTermYears.value, 10) || 30;
  const frequency = els.frequencySelect.value;
  const ioPeriodYears = loanType === 'io' ? Math.min(parseInt(els.ioPeriodYears.value, 10) || 0, years) : 0;
  const offsetBalance = parseMoney(els.offsetBalance);
  const extraPerPeriod = parseMoney(els.extraPerPeriod);
  return { principal, annualRate, years, frequency, loanType, ioPeriodYears, offsetBalance, extraPerPeriod };
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderResults() {
  const inputs = getInputs();
  if (!inputs.principal || inputs.principal <= 0 || inputs.years <= 0) return;

  const schedule   = buildSchedule(inputs);
  const summary    = computeSummary(schedule, inputs.principal);
  const baseline   = baselineSummary(
    inputs.principal, inputs.annualRate, inputs.years,
    inputs.frequency, inputs.loanType, inputs.ioPeriodYears
  );
  const freqRows   = frequencyComparison(inputs.principal, inputs.annualRate, inputs.years, inputs.offsetBalance);
  const yearlyData = annualSummary(schedule, inputs.frequency);

  renderRepaymentDerived(inputs);
  renderSummaryCards(inputs, summary, baseline);
  renderSavingsBanner(summary, baseline, inputs);
  renderSavingsDerived(summary, baseline, inputs);
  renderFrequencyTable(freqRows, inputs.frequency);
  renderChart(yearlyData);
  renderScheduleTable(schedule, inputs.frequency);
}

// ── Derived repayment text (below inputs) ─────────────────────────────────────

function renderRepaymentDerived(inputs) {
  const { principal, annualRate, years, frequency, loanType, ioPeriodYears } = inputs;
  const freqLabel = { monthly: 'month', fortnightly: 'fortnight', weekly: 'week' }[frequency];

  if (loanType === 'io') {
    const effectivePrincipal = Math.max(principal - offsetBalance, 0);
    const ioAmt = interestOnlyRepayment(effectivePrincipal, annualRate, frequency);
    const piPeriods = (years - ioPeriodYears) * PERIODS[frequency];
    let piLine;
    if (piPeriods <= 0) {
      piLine = 'IO covers full term';
    } else {
      const r = annualRate / PERIODS[frequency];
      const piAmt = r > 0
        ? principal * r * Math.pow(1 + r, piPeriods) / (Math.pow(1 + r, piPeriods) - 1)
        : principal / piPeriods;
      piLine = `P&I after IO: ${formatCurrency(piAmt)} / ${freqLabel}`;
    }
    els.repaymentDerived.textContent = `IO: ${formatCurrency(ioAmt)} / ${freqLabel}  ·  ${piLine}`;
  } else {
    const amt = repaymentAmount(principal, annualRate, years, frequency);
    els.repaymentDerived.textContent = `Required: ${formatCurrency(amt)} / ${freqLabel}`;
  }
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function renderSummaryCards(inputs, summary, baseline) {
  const { frequency, loanType } = inputs;
  const freqLabel = { monthly: '/ month', fortnightly: '/ fortnight', weekly: '/ week' }[frequency];

  // Card 1: Repayment
  els.repaymentLabel.textContent = `${capitalize(frequency)} Repayment`;
  if (loanType === 'io') {
    const effectivePrincipal = Math.max(inputs.principal - inputs.offsetBalance, 0);
    const ioAmt = interestOnlyRepayment(effectivePrincipal, inputs.annualRate, frequency);
    els.repaymentValue.textContent = formatCurrency(ioAmt);
    els.repaymentSub.textContent   = `Interest Only ${freqLabel}`;
  } else {
    const amt = repaymentAmount(inputs.principal, inputs.annualRate, inputs.years, frequency);
    els.repaymentValue.textContent = formatCurrency(amt + inputs.extraPerPeriod);
    els.repaymentSub.textContent   = inputs.extraPerPeriod > 0
      ? `incl. ${formatCurrency(inputs.extraPerPeriod)} extra ${freqLabel}`
      : freqLabel;
  }

  // Card 2: Total interest
  els.totalInterestValue.textContent = formatCurrency(summary.totalInterest);
  const interestPct = inputs.principal > 0
    ? ((summary.totalInterest / inputs.principal) * 100).toFixed(0)
    : 0;
  els.totalInterestSub.textContent = `${interestPct}% of loan amount`;

  // Card 3: Total paid
  els.totalPaidValue.textContent = formatCurrency(summary.totalPaid);
  els.totalPaidSub.textContent = `principal + interest`;

  // Card 4: Paid off in
  if (summary.paidOff) {
    els.paidOffValue.textContent = formatDuration(summary.periodsActual, frequency);
    const baselineDuration = formatDuration(baseline.periodsActual, frequency);
    if (summary.periodsActual < baseline.periodsActual) {
      els.paidOffSub.textContent = `vs ${baselineDuration} (no offset/extra)`;
    } else {
      els.paidOffSub.textContent = `${inputs.years}-year loan term`;
    }
  } else {
    els.paidOffValue.textContent = 'Not paid off';
    els.paidOffSub.textContent = `${formatCurrency(summary.remainingBalance)} outstanding at term end`;
  }
}

// ── Savings banner ────────────────────────────────────────────────────────────

function renderSavingsBanner(summary, baseline, inputs) {
  const hasBoost = inputs.offsetBalance > 0 || inputs.extraPerPeriod > 0;
  if (!hasBoost) {
    els.savingsBanner.classList.add('hidden');
    return;
  }
  const interestSaved = baseline.totalInterest - summary.totalInterest;
  const periodsSaved = baseline.periodsActual - summary.periodsActual;

  if (interestSaved <= 0) {
    els.savingsBanner.classList.add('hidden');
    return;
  }

  els.savingsBanner.classList.remove('hidden');
  els.interestSavedValue.textContent = formatCurrency(interestSaved);
  els.timeSavedValue.textContent = formatDuration(Math.max(0, periodsSaved), inputs.frequency);
}

// ── Savings derived text (below extra repayment input) ────────────────────────

function renderSavingsDerived(summary, baseline, inputs) {
  const hasBoost = inputs.offsetBalance > 0 || inputs.extraPerPeriod > 0;
  if (!hasBoost) {
    els.savingsDerived.classList.add('hidden');
    els.savingsDerived.textContent = '';
    return;
  }
  const saved = baseline.totalInterest - summary.totalInterest;
  if (saved <= 0) {
    els.savingsDerived.classList.add('hidden');
    return;
  }
  els.savingsDerived.classList.remove('hidden');
  els.savingsDerived.textContent =
    `Saves ${formatCurrency(saved)} interest · ${formatDuration(Math.max(0, baseline.periodsActual - summary.periodsActual), inputs.frequency)} sooner`;
}

// ── Frequency table ───────────────────────────────────────────────────────────

function renderFrequencyTable(rows, selectedFreq) {
  // rows order from frequencyComparison: [monthly, fortnightly, weekly]
  const monthlyRow = rows.find(r => r.frequency === 'monthly');

  // monthlyRow.periods is a count of monthly periods, which equals months.
  const monthlyMonths = monthlyRow ? monthlyRow.periods : 0;

  els.freqBody.innerHTML = rows.map(row => {
    const isActive = row.frequency === selectedFreq;
    const interestSaved = monthlyRow && row.frequency !== 'monthly'
      ? monthlyRow.totalInterest - row.totalInterest
      : null;
    const interestSavedStr = interestSaved !== null && interestSaved > 0
      ? `${formatCurrency(interestSaved)}`
      : '—';
    // Time saved vs monthly: convert both to months then diff.
    const rowMonths = row.periods * 12 / PERIODS[row.frequency];
    const timeSavedMonths = Math.round(monthlyMonths - rowMonths);
    const timeSavedStr = row.frequency !== 'monthly' && timeSavedMonths > 0
      ? formatDuration(timeSavedMonths, 'monthly')
      : '—';
    const label = { monthly: 'Monthly', fortnightly: 'Fortnightly', weekly: 'Weekly' }[row.frequency];
    return `<tr class="${isActive ? 'freq-active' : ''}">
      <td>${label}</td>
      <td>${formatCurrency(row.repayment)}</td>
      <td>${formatCurrency(row.totalInterest)}</td>
      <td>${formatCurrency(row.totalPaid)}</td>
      <td>${interestSavedStr}</td>
      <td>${timeSavedStr}</td>
    </tr>`;
  }).join('');
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function renderChart(yearlyData) {
  const canvas = $('mortgageChart');
  if (mortgageChart) {
    mortgageChart.destroy();
    mortgageChart = null;
  }

  const labels = yearlyData.map(r => `Yr ${r.year}`);

  mortgageChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Remaining Balance',
          data: yearlyData.map(r => r.balance),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.10)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Cumulative Interest',
          data: yearlyData.map(r => r.cumulativeInterest),
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [6, 4],
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', boxWidth: 14, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 10, font: { size: 11 } },
          grid: { color: 'rgba(51,65,85,0.5)' },
        },
        y: {
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'k'),
          },
          grid: { color: 'rgba(51,65,85,0.5)' },
          afterFit: scale => { scale.width = 70; },
        },
      },
    },
  });
}

// ── Amortisation schedule ─────────────────────────────────────────────────────

function renderScheduleTable(schedule, frequency) {
  const SHOW_HEAD = 60;
  const SHOW_TAIL = 12;
  const total = schedule.length;
  const freqLabel = { monthly: 'Month', fortnightly: 'Fortnight', weekly: 'Week' }[frequency];

  let rows;
  if (total <= SHOW_HEAD + SHOW_TAIL) {
    rows = schedule;
    els.scheduleNote.textContent = '';
  } else {
    rows = [
      ...schedule.slice(0, SHOW_HEAD),
      null, // gap marker
      ...schedule.slice(total - SHOW_TAIL),
    ];
    els.scheduleNote.textContent =
      `Showing first ${SHOW_HEAD} and last ${SHOW_TAIL} of ${total} periods`;
  }

  els.scheduleBody.innerHTML = rows.map((row, i) => {
    if (row === null) {
      return `<tr class="gap-row"><td colspan="5">· · ·</td></tr>`;
    }
    return `<tr>
      <td>${freqLabel} ${row.period}</td>
      <td>${formatCurrency(row.payment)}</td>
      <td>${formatCurrency(row.interest)}</td>
      <td>${formatCurrency(row.principalPaid)}</td>
      <td>${formatCurrency(row.balance)}</td>
    </tr>`;
  }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
