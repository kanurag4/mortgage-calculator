function formatCurrency(n) {
  if (!isFinite(n) || isNaN(n)) return '$—';
  return '$' + Math.round(n).toLocaleString('en-AU');
}

function parseMoney(el) {
  return parseInt(String(el.value).replace(/,/g, ''), 10) || 0;
}

function formatMoneyVal(n) {
  const rounded = Math.round(n);
  return rounded > 0 ? rounded.toLocaleString('en-AU') : '';
}

function formatMoneyInput(el) {
  const pos = el.selectionStart;
  const oldVal = el.value;
  const digitsBeforeCursor = (oldVal.slice(0, pos).match(/\d/g) || []).length;

  const raw = oldVal.replace(/[^\d]/g, '');
  if (!raw) { el.value = ''; return; }
  const formatted = Number(raw).toLocaleString('en-AU');
  el.value = formatted;

  let digitCount = 0;
  let newPos = formatted.length;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) digitCount++;
    if (digitCount === digitsBeforeCursor) { newPos = i + 1; break; }
  }
  el.setSelectionRange(newPos, newPos);
}

if (typeof module !== 'undefined') module.exports = { formatCurrency, parseMoney, formatMoneyVal, formatMoneyInput };
