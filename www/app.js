'use strict';

const $ = id => document.getElementById(id);

const STORAGE_KEY = 'kv_mortgage_inputs';

const STAMP_DUTY_RATES = {
  NSW: 0.039, VIC: 0.052, QLD: 0.035, SA: 0.040,
  WA:  0.035, TAS: 0.035, ACT: 0.035, NT: 0.045,
};

const DEFAULTS = {
  inputMode:     'loan',
  loanAmount:    '600,000',
  propertyPrice: '800,000',
  depositAmount: '160,000',
  propertyState: 'NSW',
  includeLMI:    true,
  annualRate:    6.0,
  loanTermYears: 30,
  frequency:     'monthly',
  loanType:      'pi',
  ioPeriodYears: 5,
  offsetBalance: '0',
  extraPerPeriod:'0',
};

const els = {
  // Mode toggle
  inputModeToggle:     $('inputModeToggle'),
  purchaseFields:      $('purchaseFields'),
  loanAmountField:     $('loanAmountField'),
  // Purchase inputs
  propertyPrice:       $('propertyPrice'),
  depositAmount:       $('depositAmount'),
  propertyState:       $('propertyState'),
  stampDuty:           $('stampDuty'),
  stampAutoTag:        $('stampAutoTag'),
  stampResetBtn:       $('stampResetBtn'),
  netDepositDerived:   $('netDepositDerived'),
  lvrDerived:          $('lvrDerived'),
  lmiRow:              $('lmiRow'),
  includeLMI:          $('includeLMI'),
  lmiAmountDerived:    $('lmiAmountDerived'),
  purchaseLoanDerived: $('purchaseLoanDerived'),
  // Loan inputs
  loanAmount:          $('loanAmount'),
  annualRate:          $('annualRate'),
  loanTermYears:       $('loanTermYears'),
  frequencySelect:     $('frequencySelect'),
  ioPeriodField:       $('ioPeriodField'),
  ioPeriodYears:       $('ioPeriodYears'),
  offsetBalance:       $('offsetBalance'),
  extraPerPeriod:      $('extraPerPeriod'),
  // Derived
  repaymentDerived:    $('repaymentDerived'),
  savingsDerived:      $('savingsDerived'),
  // Results
  savingsBanner:       $('savingsBanner'),
  freqBody:            $('freqBody'),
  scheduleBody:        $('scheduleBody'),
  scheduleNote:        $('scheduleNote'),
  scheduleDetails:     $('scheduleDetails'),
  repaymentLabel:      $('repaymentLabel'),
  repaymentValue:      $('repaymentValue'),
  repaymentSub:        $('repaymentSub'),
  totalInterestValue:  $('totalInterestValue'),
  totalInterestSub:    $('totalInterestSub'),
  totalPaidValue:      $('totalPaidValue'),
  totalPaidSub:        $('totalPaidSub'),
  paidOffValue:        $('paidOffValue'),
  paidOffSub:          $('paidOffSub'),
  interestSavedValue:  $('interestSavedValue'),
  timeSavedValue:      $('timeSavedValue'),
  // Stress test
  stressRateLabel:     $('stressRateLabel'),
  stressRepaymentValue:$('stressRepaymentValue'),
  stressExtraValue:    $('stressExtraValue'),
  stressTotalInterest: $('stressTotalInterest'),
  stressFreqLabel:     $('stressFreqLabel'),
};

let loanType    = 'pi';
let inputMode   = 'loan';
let stampManual = false;
let mortgageChart = null;
let debounceTimer = null;

loadFromStorage();
bindEvents();
renderResults();

// ── Storage ───────────────────────────────────────────────────────────────────

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      inputMode,
      loanAmount:     els.loanAmount.value,
      propertyPrice:  els.propertyPrice.value,
      depositAmount:  els.depositAmount.value,
      propertyState:  els.propertyState.value,
      stampDuty:      els.stampDuty.value,
      stampManual,
      includeLMI:     els.includeLMI.checked,
      annualRate:     els.annualRate.value,
      loanTermYears:  els.loanTermYears.value,
      frequency:      els.frequencySelect.value,
      loanType,
      ioPeriodYears:  els.ioPeriodYears.value,
      offsetBalance:  els.offsetBalance.value,
      extraPerPeriod: els.extraPerPeriod.value,
    }));
  } catch (_) {}
}

function loadFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;
    if (saved.loanAmount)    els.loanAmount.value    = saved.loanAmount;
    if (saved.propertyPrice) els.propertyPrice.value = saved.propertyPrice;
    if (saved.depositAmount) els.depositAmount.value = saved.depositAmount;
    if (saved.propertyState) els.propertyState.value = saved.propertyState;
    if (saved.inputMode === 'purchase' || saved.inputMode === 'loan') {
      inputMode = saved.inputMode;
      applyInputMode();
    }
    if (saved.stampManual && saved.stampDuty) {
      stampManual = true;
      els.stampDuty.value = saved.stampDuty;
      els.stampAutoTag.style.display  = 'none';
      els.stampResetBtn.style.display = '';
    } else {
      stampManual = false;
    }
    if (typeof saved.includeLMI === 'boolean') els.includeLMI.checked = saved.includeLMI;
    if (saved.annualRate)    els.annualRate.value     = saved.annualRate;
    if (saved.loanTermYears) els.loanTermYears.value  = saved.loanTermYears;
    if (saved.frequency)     els.frequencySelect.value = saved.frequency;
    if (saved.ioPeriodYears) els.ioPeriodYears.value  = saved.ioPeriodYears;
    if (saved.offsetBalance) els.offsetBalance.value  = saved.offsetBalance;
    if (saved.extraPerPeriod) els.extraPerPeriod.value = saved.extraPerPeriod;
    if (saved.loanType && (saved.loanType === 'pi' || saved.loanType === 'io')) {
      loanType = saved.loanType;
      document.querySelectorAll('#loanTypeToggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === loanType);
      });
      els.ioPeriodField.classList.toggle('visible', loanType === 'io');
    }
  } catch (_) {}
}

// ── Stamp duty auto-calc ──────────────────────────────────────────────────────

function autoCalcStampDuty() {
  if (stampManual) return;
  const price = parseMoney(els.propertyPrice);
  const rate  = STAMP_DUTY_RATES[els.propertyState.value] || 0.04;
  els.stampDuty.value = price > 0 ? Math.round(price * rate).toLocaleString('en-AU') : '';
}

function onStampInput() {
  formatMoneyInput(els.stampDuty);
  stampManual = true;
  els.stampAutoTag.style.display  = 'none';
  els.stampResetBtn.style.display = '';
  saveToStorage();
  scheduleRender();
}

function onResetStamp() {
  stampManual = false;
  els.stampAutoTag.style.display  = '';
  els.stampResetBtn.style.display = 'none';
  autoCalcStampDuty();
  saveToStorage();
  scheduleRender();
}

// ── Input mode ────────────────────────────────────────────────────────────────

function applyInputMode() {
  const isPurchase = inputMode === 'purchase';
  els.purchaseFields.classList.toggle('hidden', !isPurchase);
  els.loanAmountField.classList.toggle('hidden', isPurchase);
  document.querySelectorAll('#inputModeToggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === inputMode);
  });
  if (isPurchase) autoCalcStampDuty();
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  [els.loanAmount, els.offsetBalance, els.extraPerPeriod, els.depositAmount].forEach(el => {
    el.addEventListener('input', () => {
      formatMoneyInput(el);
      saveToStorage();
      scheduleRender();
    });
  });

  els.propertyPrice.addEventListener('input', () => {
    formatMoneyInput(els.propertyPrice);
    autoCalcStampDuty();
    saveToStorage();
    scheduleRender();
  });

  els.propertyState.addEventListener('change', () => {
    autoCalcStampDuty();
    saveToStorage();
    scheduleRender();
  });

  els.stampDuty.addEventListener('input', onStampInput);
  els.stampResetBtn.addEventListener('click', onResetStamp);

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

  els.includeLMI.addEventListener('change', () => {
    saveToStorage();
    scheduleRender();
  });

  document.querySelectorAll('#inputModeToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      inputMode = btn.dataset.val;
      applyInputMode();
      saveToStorage();
      scheduleRender();
    });
  });

  document.querySelectorAll('#loanTypeToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#loanTypeToggle .toggle-btn').forEach(b => b.classList.remove('active'));
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
  let principal;
  if (inputMode === 'purchase') {
    const propertyPrice = parseMoney(els.propertyPrice);
    const deposit       = parseMoney(els.depositAmount);
    const stampDutyAmt  = parseMoney(els.stampDuty);
    const netDeposit    = Math.max(deposit - stampDutyAmt, 0);
    const baseLoan      = Math.max(propertyPrice - netDeposit, 0);
    const lmiAmt        = baseLoan > 0 && propertyPrice > 0 && els.includeLMI.checked
      ? estimateLMI(baseLoan, propertyPrice)
      : 0;
    principal = baseLoan + lmiAmt;
  } else {
    principal = parseMoney(els.loanAmount);
  }

  const annualRate     = parseFloat(els.annualRate.value) / 100 || 0;
  const years          = parseInt(els.loanTermYears.value, 10) || 30;
  const frequency      = els.frequencySelect.value;
  const ioPeriodYears  = loanType === 'io' ? Math.min(parseInt(els.ioPeriodYears.value, 10) || 0, years) : 0;
  const offsetBalance  = parseMoney(els.offsetBalance);
  const extraPerPeriod = parseMoney(els.extraPerPeriod);
  return { principal, annualRate, years, frequency, loanType, ioPeriodYears, offsetBalance, extraPerPeriod };
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderResults() {
  const inputs = getInputs();
  renderPurchaseMode();
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
  renderStressTest(inputs);
  renderFrequencyTable(freqRows, inputs.frequency);
  renderChart(yearlyData);
  renderScheduleTable(schedule, inputs.frequency);
}

// ── Purchase mode derived display ─────────────────────────────────────────────

function renderPurchaseMode() {
  if (inputMode !== 'purchase') return;

  const propertyPrice = parseMoney(els.propertyPrice);
  const deposit       = parseMoney(els.depositAmount);
  const stampDutyAmt  = parseMoney(els.stampDuty);
  const netDeposit    = Math.max(deposit - stampDutyAmt, 0);

  if (!propertyPrice || propertyPrice <= 0) {
    els.netDepositDerived.textContent   = '';
    els.lvrDerived.textContent          = '';
    els.purchaseLoanDerived.textContent = '';
    els.lmiRow.classList.add('hidden');
    return;
  }

  if (stampDutyAmt > 0) {
    els.netDepositDerived.textContent = stampDutyAmt >= deposit
      ? `Stamp duty (${formatCurrency(stampDutyAmt)}) exceeds deposit — net deposit: ${formatCurrency(netDeposit)}`
      : `Net deposit after stamp duty: ${formatCurrency(netDeposit)}`;
  } else {
    els.netDepositDerived.textContent = '';
  }

  const baseLoan    = Math.max(propertyPrice - netDeposit, 0);
  const lvr         = (baseLoan / propertyPrice) * 100;
  const lmiAmt      = estimateLMI(baseLoan, propertyPrice);
  const lmiRequired = lmiAmt > 0;

  els.lvrDerived.textContent = `LVR: ${lvr.toFixed(1)}%${!lmiRequired ? '  ·  No LMI required' : ''}`;

  if (lmiRequired) {
    els.lmiRow.classList.remove('hidden');
    const included = els.includeLMI.checked;
    els.lmiAmountDerived.textContent = `Estimated LMI: ~${formatCurrency(lmiAmt)}${included ? ' (added to loan)' : ' (not included)'}`;
    const totalLoan = baseLoan + (included ? lmiAmt : 0);
    els.purchaseLoanDerived.textContent = `Loan amount: ${formatCurrency(totalLoan)}`;
  } else {
    els.lmiRow.classList.add('hidden');
    els.purchaseLoanDerived.textContent = `Loan amount: ${formatCurrency(baseLoan)}`;
  }
}

// ── Rate stress test ──────────────────────────────────────────────────────────

function renderStressTest(inputs) {
  const stressRate  = inputs.annualRate + 0.03;
  const freqLabel   = { monthly: 'month', fortnightly: 'fortnight', weekly: 'week' }[inputs.frequency];

  const effectivePrincipal = Math.max(inputs.principal - inputs.offsetBalance, 0);
  const baseAmt = inputs.loanType === 'io'
    ? interestOnlyRepayment(effectivePrincipal, inputs.annualRate, inputs.frequency)
    : repaymentAmount(inputs.principal, inputs.annualRate, inputs.years, inputs.frequency);
  const stressAmt  = repaymentAmount(inputs.principal, stressRate, inputs.years, inputs.frequency);
  const extra      = stressAmt - baseAmt;

  const stressSchedule = buildSchedule({ ...inputs, annualRate: stressRate, loanType: 'pi', ioPeriodYears: 0 });
  const stressSummary  = computeSummary(stressSchedule, inputs.principal);

  els.stressRateLabel.textContent      = (stressRate * 100).toFixed(1) + '%';
  els.stressRepaymentValue.textContent = formatCurrency(stressAmt) + ' / ' + freqLabel;
  els.stressExtraValue.textContent     = '+' + formatCurrency(extra) + ' / ' + freqLabel;
  els.stressTotalInterest.textContent  = formatCurrency(stressSummary.totalInterest);
  els.stressFreqLabel.textContent      = freqLabel;
}

// ── Derived repayment text (below inputs) ─────────────────────────────────────

function renderRepaymentDerived(inputs) {
  const { principal, annualRate, years, frequency, loanType, ioPeriodYears, offsetBalance } = inputs;
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

  els.totalInterestValue.textContent = formatCurrency(summary.totalInterest);
  const interestPct = inputs.principal > 0
    ? ((summary.totalInterest / inputs.principal) * 100).toFixed(0)
    : 0;
  els.totalInterestSub.textContent = `${interestPct}% of loan amount`;

  els.totalPaidValue.textContent = formatCurrency(summary.totalPaid);
  els.totalPaidSub.textContent   = `principal + interest`;

  if (summary.paidOff) {
    els.paidOffValue.textContent = formatDuration(summary.periodsActual, frequency);
    const baselineDuration = formatDuration(baseline.periodsActual, frequency);
    els.paidOffSub.textContent = summary.periodsActual < baseline.periodsActual
      ? `vs ${baselineDuration} (no offset/extra)`
      : `${inputs.years}-year loan term`;
  } else {
    els.paidOffValue.textContent = 'Not paid off';
    els.paidOffSub.textContent   = `${formatCurrency(summary.remainingBalance)} outstanding at term end`;
  }
}

// ── Savings banner ────────────────────────────────────────────────────────────

function renderSavingsBanner(summary, baseline, inputs) {
  const hasBoost = inputs.offsetBalance > 0 || inputs.extraPerPeriod > 0;
  if (!hasBoost) { els.savingsBanner.classList.add('hidden'); return; }

  const interestSaved = baseline.totalInterest - summary.totalInterest;
  if (interestSaved <= 0) { els.savingsBanner.classList.add('hidden'); return; }

  els.savingsBanner.classList.remove('hidden');
  els.interestSavedValue.textContent = formatCurrency(interestSaved);
  els.timeSavedValue.textContent = formatDuration(Math.max(0, baseline.periodsActual - summary.periodsActual), inputs.frequency);
}

// ── Savings derived text ──────────────────────────────────────────────────────

function renderSavingsDerived(summary, baseline, inputs) {
  const hasBoost = inputs.offsetBalance > 0 || inputs.extraPerPeriod > 0;
  if (!hasBoost) {
    els.savingsDerived.classList.add('hidden');
    els.savingsDerived.textContent = '';
    return;
  }
  const saved = baseline.totalInterest - summary.totalInterest;
  if (saved <= 0) { els.savingsDerived.classList.add('hidden'); return; }
  els.savingsDerived.classList.remove('hidden');
  els.savingsDerived.textContent =
    `Saves ${formatCurrency(saved)} interest · ${formatDuration(Math.max(0, baseline.periodsActual - summary.periodsActual), inputs.frequency)} sooner`;
}

// ── Frequency table ───────────────────────────────────────────────────────────

function renderFrequencyTable(rows, selectedFreq) {
  const monthlyRow   = rows.find(r => r.frequency === 'monthly');
  const monthlyMonths = monthlyRow ? monthlyRow.periods : 0;

  els.freqBody.innerHTML = rows.map(row => {
    const isActive = row.frequency === selectedFreq;
    const interestSaved = monthlyRow && row.frequency !== 'monthly'
      ? monthlyRow.totalInterest - row.totalInterest
      : null;
    const interestSavedStr = interestSaved !== null && interestSaved > 0
      ? formatCurrency(interestSaved)
      : '—';
    const rowMonths      = row.periods * 12 / PERIODS[row.frequency];
    const timeSavedMonths = Math.round(monthlyMonths - rowMonths);
    const timeSavedStr   = row.frequency !== 'monthly' && timeSavedMonths > 0
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
  if (mortgageChart) { mortgageChart.destroy(); mortgageChart = null; }

  const isDark = document.documentElement.classList.contains('dark');
  const balanceColor = isDark ? '#38bdf8' : '#0369a1';
  const balanceFill  = isDark ? 'rgba(56,189,248,0.10)' : 'rgba(3,105,161,0.10)';

  mortgageChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: yearlyData.map(r => `Yr ${r.year}`),
      datasets: [
        {
          label: 'Remaining Balance',
          data: yearlyData.map(r => r.balance),
          borderColor: balanceColor,
          backgroundColor: balanceFill,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Cumulative Interest',
          data: yearlyData.map(r => r.cumulativeInterest),
          borderColor: isDark ? '#f59e0b' : '#d97706',
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
        legend: { labels: { color: '#94a3b8', boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 10, font: { size: 11 } },
          grid:  { color: 'rgba(51,65,85,0.5)' },
        },
        y: {
          ticks: {
            color: '#64748b',
            font:  { size: 11 },
            callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'k'),
          },
          grid:    { color: 'rgba(51,65,85,0.5)' },
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
  const total     = schedule.length;
  const freqLabel = { monthly: 'Month', fortnightly: 'Fortnight', weekly: 'Week' }[frequency];

  let rows;
  if (total <= SHOW_HEAD + SHOW_TAIL) {
    rows = schedule;
    els.scheduleNote.textContent = '';
  } else {
    rows = [...schedule.slice(0, SHOW_HEAD), null, ...schedule.slice(total - SHOW_TAIL)];
    els.scheduleNote.textContent = `Showing first ${SHOW_HEAD} and last ${SHOW_TAIL} of ${total} periods`;
  }

  els.scheduleBody.innerHTML = rows.map(row => {
    if (row === null) return `<tr class="gap-row"><td colspan="5">· · ·</td></tr>`;
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
