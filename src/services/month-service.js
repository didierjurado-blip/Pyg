function getMonthClosure(companyData, month) {
  const closures = companyData.monthClosures || {};
  const record = closures[month] || {};
  const closed = Boolean(record.closed);
  return {
    month,
    closed,
    closedAt: record.closedAt || null,
    managerialComment: String(record.managerialComment || ''),
    reopenedAt: record.reopenedAt || null,
  };
}

function assertMonthOpen(companyData, month, actionLabel) {
  const { closed } = getMonthClosure(companyData, month);
  if (closed) {
    throw new Error(
      `No puedes ${actionLabel} porque el mes ${month} est� cerrado. Reabre el mes o elige otro periodo.`
    );
  }
}

function closeMonth(mutableCompanyData, month, managerialComment) {
  mutableCompanyData.monthClosures = mutableCompanyData.monthClosures || {};
  const now = new Date().toISOString();
  mutableCompanyData.monthClosures[month] = {
    closed: true,
    closedAt: now,
    managerialComment: String(managerialComment || '').trim(),
    reopenedAt: null,
  };
  return getMonthClosure(mutableCompanyData, month);
}

function reopenMonth(mutableCompanyData, month) {
  mutableCompanyData.monthClosures = mutableCompanyData.monthClosures || {};
  const prev = mutableCompanyData.monthClosures[month] || {};
  const now = new Date().toISOString();
  mutableCompanyData.monthClosures[month] = {
    ...prev,
    closed: false,
    reopenedAt: now,
  };
  return getMonthClosure(mutableCompanyData, month);
}

function findPreviousBudgetMonth(companyData, normalizedMonth) {
  const keys = Object.keys(companyData.months || {})
    .filter((m) => m < normalizedMonth)
    .sort()
    .reverse();
  for (const m of keys) {
    const rows = companyData.months[m]?.budget?.rows;
    if (Array.isArray(rows) && rows.length > 0) {
      return m;
    }
  }
  return null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDueDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function enrichAction(action, companyName, monthKey) {
  const due = parseDueDate(action.dueDate);
  const missingDueDate = !String(action.dueDate || '').trim();
  const dueDateLabel = missingDueDate ? 'Sin fecha' : String(action.dueDate);
  return {
    ...action,
    companyName,
    month: monthKey,
    dueDateLabel,
    missingDueDate,
    _due: due,
  };
}

function buildActionsOverview(companyEntries, { month: filterMonth } = {}) {
  const all = [];
  companyEntries.forEach(({ companyName, companyData }) => {
    const actionsByMonth = companyData.monthlyActions || {};
    Object.keys(actionsByMonth).forEach((monthKey) => {
      if (filterMonth && monthKey !== filterMonth) return;
      const rows = Array.isArray(actionsByMonth[monthKey]) ? actionsByMonth[monthKey] : [];
      rows.forEach((row) => {
        all.push(enrichAction(row, companyName, monthKey));
      });
    });
  });

  const today = startOfDay(new Date());
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const overdue = [];
  const dueSoon = [];
  const incomplete = [];
  const pending = [];
  const inProgress = [];

  all.forEach((item) => {
    if (item.status === 'cerrada') return;
    const due = item._due;
    if (due && due < today) {
      overdue.push(item);
      return;
    }
    if (due && due >= today && due <= weekAhead) {
      dueSoon.push(item);
      return;
    }
    if (item.missingDueDate) {
      incomplete.push(item);
      return;
    }
    if (item.status === 'en_proceso') {
      inProgress.push(item);
      return;
    }
    pending.push(item);
  });

  const strip = (rows) =>
    rows.map(({ _due, ...rest }) => rest);

  return {
    summary: {
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      incomplete: incomplete.length,
      pending: pending.length,
      inProgress: inProgress.length,
    },
    sections: {
      overdue: strip(overdue),
      dueSoon: strip(dueSoon),
      incomplete: strip(incomplete),
      pending: strip(pending),
      inProgress: strip(inProgress),
    },
  };
}

module.exports = {
  getMonthClosure,
  assertMonthOpen,
  closeMonth,
  reopenMonth,
  findPreviousBudgetMonth,
  buildActionsOverview,
};
