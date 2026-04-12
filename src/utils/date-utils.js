function ensureMonth(value) {
  const month = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Mes invalido. Usa formato YYYY-MM.');
  }
  return month;
}

function sortMonths(months) {
  return [...months].sort((a, b) => String(a).localeCompare(String(b)));
}

function getPreviousMonth(month) {
  const normalizedMonth = ensureMonth(month);
  const [yearText, monthText] = normalizedMonth.split('-');
  const previous = new Date(Number(yearText), Number(monthText) - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function getTodayLocalDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Meses calendario desde enero del año del corte hasta `cutoffMonth` (inclusive). */
function monthsInYearUpTo(cutoffMonth) {
  const normalized = ensureMonth(cutoffMonth);
  const year = Number(normalized.slice(0, 4));
  const end = Number(normalized.slice(5, 7));
  const out = [];
  for (let m = 1; m <= end; m += 1) {
    out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  const next = new Date(year, (month || 1) - 1, day || 1);
  next.setDate(next.getDate() + Number(days || 0));
  return getTodayLocalDateKey(next);
}

module.exports = {
  ensureMonth,
  sortMonths,
  getPreviousMonth,
  getTodayLocalDateKey,
  addDaysToDateKey,
  monthsInYearUpTo,
};
