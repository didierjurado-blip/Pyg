const { ensureMonth, getTodayLocalDateKey, addDaysToDateKey } = require('../utils/date-utils');

function getMonthClosure(companyData, month) {
  const normalizedMonth = ensureMonth(month);
  const raw = companyData?.monthClosures?.[normalizedMonth] || {};
  const history = Array.isArray(raw.history) ? raw.history : [];

  return {
    month: normalizedMonth,
    closed: raw.closed === true,
    closedAt: raw.closedAt || null,
    managerialComment: raw.managerialComment || '',
    reopenedAt: raw.reopenedAt || null,
    history,
  };
}

function isMonthClosed(companyData, month) {
  return getMonthClosure(companyData, month).closed;
}

function assertMonthOpen(companyData, month, actionLabel) {
  if (isMonthClosed(companyData, month)) {
    throw new Error(`El mes ${month} está cerrado. Reábrelo antes de ${actionLabel}.`);
  }
}

function closeMonth(companyData, month, managerialComment) {
  const normalizedMonth = ensureMonth(month);
  const current = getMonthClosure(companyData, normalizedMonth);
  const now = new Date().toISOString();

  companyData.monthClosures = companyData.monthClosures || {};
  companyData.monthClosures[normalizedMonth] = {
    month: normalizedMonth,
    closed: true,
    closedAt: now,
    managerialComment,
    reopenedAt: current.reopenedAt || null,
    history: [
      ...(current.history || []),
      {
        eventType: 'close_month',
        dateTime: now,
        managerialComment,
      },
    ],
  };

  return companyData.monthClosures[normalizedMonth];
}

function reopenMonth(companyData, month) {
  const normalizedMonth = ensureMonth(month);
  const current = getMonthClosure(companyData, normalizedMonth);
  const now = new Date().toISOString();

  companyData.monthClosures = companyData.monthClosures || {};
  companyData.monthClosures[normalizedMonth] = {
    ...current,
    month: normalizedMonth,
    closed: false,
    reopenedAt: now,
    history: [
      ...(current.history || []),
      {
        eventType: 'reopen_month',
        dateTime: now,
      },
    ],
  };

  return companyData.monthClosures[normalizedMonth];
}

function findPreviousBudgetMonth(companyData, targetMonth) {
  const normalizedTarget = ensureMonth(targetMonth);
  return Object.keys(companyData?.months || {})
    .filter((month) => month < normalizedTarget && companyData.months?.[month]?.budget?.rows?.length)
    .sort((a, b) => b.localeCompare(a, 'es'))[0] || null;
}

function sortActions(items, direction = 'asc') {
  return items.slice().sort((a, b) => {
    const compare = String(a.dueDate || '').localeCompare(String(b.dueDate || ''), 'es');
    if (compare !== 0) {
      return direction === 'asc' ? compare : -compare;
    }
    return String(a.companyName || '').localeCompare(String(b.companyName || ''), 'es');
  });
}

function buildActionTracking(companyName, month, action, todayKey = getTodayLocalDateKey()) {
  const status = ['pendiente', 'en_proceso', 'cerrada'].includes(action?.status) ? action.status : 'pendiente';
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(action?.dueDate || '').trim())
    ? String(action.dueDate).trim()
    : '';
  const nextWeekKey = addDaysToDateKey(todayKey, 7);

  let trackingBucket = 'pending';
  if (status === 'cerrada') {
    trackingBucket = 'closed';
  } else if (dueDate && dueDate < todayKey) {
    trackingBucket = 'overdue';
  } else if (dueDate && dueDate >= todayKey && dueDate <= nextWeekKey) {
    trackingBucket = 'dueSoon';
  } else if (status === 'en_proceso') {
    trackingBucket = 'inProgress';
  }

  return {
    id: String(action?.id || '').trim(),
    companyName,
    month,
    linePyg: String(action?.linePyg || '').trim() || 'Sin línea',
    problemDetected: String(action?.problemDetected || '').trim() || 'Sin problema registrado',
    actionDefined: String(action?.actionDefined || '').trim() || 'Sin acción definida',
    responsible: String(action?.responsible || '').trim() || 'Sin responsable',
    priority: String(action?.priority || '').trim() || 'Media',
    dueDate,
    dueDateLabel: dueDate || 'Sin fecha compromiso',
    status,
    trackingBucket,
    missingDueDate: !dueDate,
    dateTime: action?.dateTime || null,
  };
}

function buildActionsOverview(companiesWithData, filters = {}) {
  const monthFilter = filters.month ? ensureMonth(filters.month) : '';
  const todayKey = filters.todayKey || getTodayLocalDateKey();
  const allItems = [];

  companiesWithData.forEach(({ companyName, companyData }) => {
    const monthlyActions = companyData?.monthlyActions || {};
    Object.keys(monthlyActions).forEach((month) => {
      if (monthFilter && month !== monthFilter) return;
      const actions = Array.isArray(monthlyActions[month]) ? monthlyActions[month] : [];
      actions.forEach((action) => {
        allItems.push(buildActionTracking(companyName, month, action, todayKey));
      });
    });
  });

  const sections = {
    overdue: sortActions(allItems.filter((item) => item.trackingBucket === 'overdue')),
    dueSoon: sortActions(allItems.filter((item) => item.trackingBucket === 'dueSoon')),
    pending: sortActions(allItems.filter((item) => item.status === 'pendiente')),
    inProgress: sortActions(allItems.filter((item) => item.status === 'en_proceso')),
    closed: sortActions(allItems.filter((item) => item.status === 'cerrada'), 'desc'),
    incomplete: sortActions(allItems.filter((item) => item.missingDueDate && item.status !== 'cerrada')),
  };

  return {
    filters: {
      month: monthFilter || null,
      today: todayKey,
    },
    summary: {
      overdue: sections.overdue.length,
      dueSoon: sections.dueSoon.length,
      pending: sections.pending.length,
      inProgress: sections.inProgress.length,
      closed: sections.closed.length,
      incomplete: sections.incomplete.length,
      total: allItems.length,
    },
    sections,
  };
}

module.exports = {
  getMonthClosure,
  isMonthClosed,
  assertMonthOpen,
  closeMonth,
  reopenMonth,
  findPreviousBudgetMonth,
  buildActionsOverview,
};
