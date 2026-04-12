const { round2 } = require('../utils/number-utils');
const { compareBudgetVsReal } = require('./comparison-service');
const { ensureMonth, monthsInYearUpTo } = require('../utils/date-utils');
const { buildAccumulatedDataset } = require('./accumulated-service');

function sumRowsByCompany(companyEntries = [], accessor) {
  const labels = new Map();
  const totals = new Map();

  companyEntries.forEach((entry) => {
    const rows = accessor(entry) || [];
    rows.forEach((row) => {
      const key = row.lineKey
        ? String(row.lineKey).trim()
        : String(`${row.sectionLabel || ''}|${row.subgroup || ''}`).trim();
      if (!key || key === '|') return;
      const value = Number(row.value ?? row.budget ?? row.real ?? 0);
      const current = totals.get(key) || { key, valuesByCompany: {}, total: 0 };
      current.valuesByCompany[entry.company.id] = round2((current.valuesByCompany[entry.company.id] || 0) + value);
      current.total = round2(current.total + value);
      labels.set(key, row);
      totals.set(key, current);
    });
  });

  return Array.from(totals.values()).map((item) => {
    const labelRow = labels.get(item.key) || {};
    return {
      key: item.key,
      lineKey: labelRow.lineKey || '',
      lineLabel: labelRow.lineLabel || '',
      sectionKey: labelRow.sectionKey || '',
      sectionLabel: labelRow.sectionLabel || '',
      subgroup: labelRow.subgroup || '',
      accountCount: labelRow.accountCount || 0,
      valuesByCompany: item.valuesByCompany,
      total: item.total,
    };
  });
}

function buildStandardMatrix(companyEntries = [], viewKey = 'gerencial', datasetKey = 'execution') {
  return sumRowsByCompany(companyEntries, (entry) => entry.snapshot?.[datasetKey]?.[viewKey]?.standardTable || []);
}

function buildDetailedMatrix(companyEntries = [], viewKey = 'gerencial', datasetKey = 'execution') {
  return sumRowsByCompany(companyEntries, (entry) => entry.snapshot?.[datasetKey]?.[viewKey]?.detailedTable || []);
}

function buildConsolidatedStandardFromMatrix(matrix = []) {
  return matrix
    .filter((row) => row.lineKey)
    .map((row) => ({
      lineKey: row.lineKey,
      lineLabel: row.lineLabel,
      value: round2(row.total || 0),
      budget: round2(row.total || 0),
    }));
}

function buildConsolidatedDetailedFromMatrix(matrix = []) {
  return matrix
    .filter((row) => row.sectionLabel || row.subgroup)
    .map((row) => ({
      sectionKey: row.sectionKey,
      sectionLabel: row.sectionLabel,
      subgroup: row.subgroup,
      value: round2(row.total || 0),
      accountCount: round2(row.accountCount || 0),
    }));
}

function buildConsolidatedNotes(companyEntries = [], month) {
  const notes = [];
  companyEntries.forEach((entry) => {
    const technicalNotes = entry.snapshot?.execution?.automaticNotes?.technicalNotes || [];
    technicalNotes.forEach((note) => {
      notes.push(`${entry.company.name} ${month}: ${note}`);
    });
  });

  return Array.from(new Set(notes));
}

function buildConsolidatedMapping(companyEntries = [], month) {
  return companyEntries.flatMap((entry) =>
    (entry.snapshot?.execution?.accountMapping || []).map((row) => ({
      month,
      companyId: entry.company.id,
      companyName: entry.company.name,
      ...row,
    }))
  );
}

function buildEliminationScopeKey({ groupId, companyIds = [] }) {
  if (groupId) {
    return `group:${groupId}`;
  }
  const sorted = [...companyIds].sort();
  return `adhoc:${sorted.join('|')}`;
}

function buildEliminationLineMap(eliminations = []) {
  const byLine = new Map();
  eliminations.forEach((item) => {
    const key = String(item.lineKey || '').trim();
    if (!key) return;
    byLine.set(key, round2((byLine.get(key) || 0) + Number(item.value || 0)));
  });
  return byLine;
}

function applyEliminationsToStandardRows(rows = [], eliminations = []) {
  const lineMap = buildEliminationLineMap(eliminations);
  return (rows || []).map((row) => {
    const eliminationValue = round2(lineMap.get(row.lineKey) || 0);
    return {
      ...row,
      eliminationValue,
      adjustedValue: round2(Number(row.value || row.budget || 0) - eliminationValue),
    };
  });
}

function buildAdjustedStandardTable(rows = []) {
  return (rows || []).map((row) => ({
    lineKey: row.lineKey,
    lineLabel: row.lineLabel,
    value: round2(row.adjustedValue || 0),
    budget: round2(row.adjustedValue || 0),
  }));
}

function buildEliminationSummary(eliminations = []) {
  const groups = new Map();
  eliminations.forEach((item) => {
    const lineKey = String(item.lineKey || '').trim();
    const current = groups.get(lineKey) || {
      lineKey,
      lineLabel: item.lineLabel || lineKey,
      total: 0,
      count: 0,
    };
    current.total = round2(current.total + Number(item.value || 0));
    current.count += 1;
    groups.set(lineKey, current);
  });
  return Array.from(groups.values());
}

function buildStandardMatrixFromYtd(entries, viewKey, datasetKey) {
  return sumRowsByCompany(entries, (entry) => entry.accumulated?.[datasetKey]?.[viewKey]?.standardTable || []);
}

function buildDetailedMatrixFromYtd(entries, viewKey, datasetKey) {
  return sumRowsByCompany(entries, (entry) => entry.accumulated?.[datasetKey]?.[viewKey]?.detailedTable || []);
}

function buildConsolidatedNotesYtd(accumulatedEntries, cutoffMonth) {
  const notes = [];
  accumulatedEntries.forEach(({ company, accumulated }) => {
    (accumulated.execution?.automaticNotes?.technicalNotes || []).forEach((n) => {
      notes.push(`${company.name}: ${n}`);
    });
  });
  notes.push(
    `Consolidado YTD con corte en ${cutoffMonth}. Las eliminaciones mostradas suman los registros guardados por mes (mismo alcance grupo/selección) entre enero y el corte.`
  );
  return Array.from(new Set(notes));
}

function buildConsolidatedMappingYtd(accumulatedEntries) {
  return accumulatedEntries.flatMap(({ company, accumulated }) =>
    (accumulated.execution?.accountMapping || []).map((row) => ({
      companyId: company.id,
      companyName: company.name,
      ...row,
    }))
  );
}

function buildConsolidatedYtdDataset({ db, companyIds, cutoffMonth, includeBudget = true, view = 'gerencial', groupId = null }) {
  const normalizedCutoff = ensureMonth(cutoffMonth);
  const selectedCompanies = (db.companies || []).filter((company) => companyIds.includes(company.id));

  if (!selectedCompanies.length) {
    throw new Error('Selecciona al menos una empresa para consolidar.');
  }

  const accumulatedEntries = [];
  const missingYtdCompanies = [];

  selectedCompanies.forEach((company) => {
    try {
      const companyData = db.dataByCompany?.[company.id];
      if (!companyData) {
        throw new Error('sin datos');
      }
      const accumulated = buildAccumulatedDataset({
        company,
        companyData,
        cutoffMonth: normalizedCutoff,
        includeBudget,
      });
      accumulatedEntries.push({ company, accumulated });
    } catch (_error) {
      missingYtdCompanies.push(company.name);
    }
  });

  if (!accumulatedEntries.length) {
    throw new Error('Ninguna empresa tiene ejecución suficiente para armar el consolidado YTD en ese corte.');
  }

  const viewKey = view === 'contable' ? 'contable' : 'gerencial';

  const standardRealMatrix = buildStandardMatrixFromYtd(accumulatedEntries, viewKey, 'execution');
  const detailedRealMatrix = buildDetailedMatrixFromYtd(accumulatedEntries, viewKey, 'execution');
  const consolidatedRealStandard = buildConsolidatedStandardFromMatrix(standardRealMatrix);
  const consolidatedRealDetailed = buildConsolidatedDetailedFromMatrix(detailedRealMatrix);

  const budgetEntries = includeBudget
    ? accumulatedEntries.filter((entry) => entry.accumulated.budget)
    : [];
  const standardBudgetMatrix = includeBudget ? buildStandardMatrixFromYtd(budgetEntries, viewKey, 'budget') : [];
  const detailedBudgetMatrix = includeBudget ? buildDetailedMatrixFromYtd(budgetEntries, viewKey, 'budget') : [];
  const consolidatedBudgetStandard = includeBudget ? buildConsolidatedStandardFromMatrix(standardBudgetMatrix) : [];
  const consolidatedBudgetDetailed = includeBudget ? buildConsolidatedDetailedFromMatrix(detailedBudgetMatrix) : [];

  const comparison = includeBudget && consolidatedBudgetStandard.length
    ? compareBudgetVsReal({
        budgetRows: consolidatedBudgetStandard,
        realPygTable: consolidatedRealStandard,
        lineSettings: [],
      })
    : null;

  const scopeKey = buildEliminationScopeKey({ groupId, companyIds: selectedCompanies.map((c) => c.id) });
  const ytdMonths = monthsInYearUpTo(normalizedCutoff);
  const eliminations = [];
  ytdMonths.forEach((m) => {
    (db.consolidationEliminations || [])
      .filter((item) => item.month === m && item.scopeKey === scopeKey)
      .forEach((item) => {
        eliminations.push({
          ...item,
          lineLabel: consolidatedRealStandard.find((row) => row.lineKey === item.lineKey)?.lineLabel || item.lineKey,
          sourceYtdMonth: m,
        });
      });
  });

  const adjustedRowsWithEliminations = applyEliminationsToStandardRows(consolidatedRealStandard, eliminations);
  const adjustedStandard = buildAdjustedStandardTable(adjustedRowsWithEliminations);

  const ytdPeriod = {
    fromMonth: ytdMonths[0],
    toMonth: normalizedCutoff,
    months: ytdMonths,
  };

  return {
    periodType: 'ytd',
    meta: { schema: 'consolidated_ytd_v1' },
    month: normalizedCutoff,
    cutoffMonth: normalizedCutoff,
    ytdPeriod,
    view: viewKey,
    scopeKey,
    groupId,
    companyIds: selectedCompanies.map((company) => company.id),
    companies: selectedCompanies.map((company) => ({
      id: company.id,
      name: company.name,
      hasExecution: accumulatedEntries.some((entry) => entry.company.id === company.id),
      hasBudget: budgetEntries.some((entry) => entry.company.id === company.id),
    })),
    summary: {
      totalCompanies: selectedCompanies.length,
      activeCompanies: accumulatedEntries.length,
      missingExecutionCompanies: missingYtdCompanies,
      missingYtdCompanies: missingYtdCompanies,
      view: viewKey,
      includeBudget: Boolean(includeBudget),
      ytdMonthsCount: ytdMonths.length,
    },
    real: {
      standardMatrix: standardRealMatrix,
      detailedMatrix: detailedRealMatrix,
      consolidated: {
        standardTable: consolidatedRealStandard,
        detailedTable: consolidatedRealDetailed,
        adjustedStandardTable: adjustedStandard,
        adjustedRowsWithEliminations,
      },
    },
    budget: includeBudget
      ? {
          standardMatrix: standardBudgetMatrix,
          detailedMatrix: detailedBudgetMatrix,
          consolidated: {
            standardTable: consolidatedBudgetStandard,
            detailedTable: consolidatedBudgetDetailed,
          },
        }
      : null,
    comparison,
    notes: buildConsolidatedNotesYtd(accumulatedEntries, normalizedCutoff),
    accountMapping: buildConsolidatedMappingYtd(accumulatedEntries),
    eliminations: {
      items: eliminations,
      summary: buildEliminationSummary(eliminations),
      total: round2(eliminations.reduce((acc, item) => acc + Number(item.value || 0), 0)),
    },
  };
}

function buildConsolidatedDataset({ db, companyIds, month, includeBudget = true, view = 'gerencial', groupId = null }) {
  const normalizedMonth = ensureMonth(month);
  const selectedCompanies = (db.companies || []).filter((company) => companyIds.includes(company.id));

  if (!selectedCompanies.length) {
    throw new Error('Selecciona al menos una empresa para consolidar.');
  }

  const companyEntries = selectedCompanies
    .map((company) => ({
      company,
      snapshot: db.dataByCompany?.[company.id]?.months?.[normalizedMonth] || null,
    }))
    .filter((entry) => entry.snapshot?.execution);

  if (!companyEntries.length) {
    throw new Error('Ninguna de las empresas seleccionadas tiene ejecución cargada para ese mes.');
  }

  const missingExecutionCompanies = selectedCompanies
    .filter((company) => !companyEntries.some((entry) => entry.company.id === company.id))
    .map((company) => company.name);

  const standardRealMatrix = buildStandardMatrix(companyEntries, view, 'execution');
  const detailedRealMatrix = buildDetailedMatrix(companyEntries, view, 'execution');
  const consolidatedRealStandard = buildConsolidatedStandardFromMatrix(standardRealMatrix);
  const consolidatedRealDetailed = buildConsolidatedDetailedFromMatrix(detailedRealMatrix);

  const budgetEntries = includeBudget
    ? companyEntries.filter((entry) => entry.snapshot?.budget?.[view]?.standardTable?.length)
    : [];
  const standardBudgetMatrix = includeBudget ? buildStandardMatrix(budgetEntries, view, 'budget') : [];
  const detailedBudgetMatrix = includeBudget ? buildDetailedMatrix(budgetEntries, view, 'budget') : [];
  const consolidatedBudgetStandard = includeBudget ? buildConsolidatedStandardFromMatrix(standardBudgetMatrix) : [];
  const consolidatedBudgetDetailed = includeBudget ? buildConsolidatedDetailedFromMatrix(detailedBudgetMatrix) : [];

  const comparison = includeBudget && consolidatedBudgetStandard.length
    ? compareBudgetVsReal({
        budgetRows: consolidatedBudgetStandard,
        realPygTable: consolidatedRealStandard,
        lineSettings: [],
      })
    : null;

  const scopeKey = buildEliminationScopeKey({ groupId, companyIds: selectedCompanies.map((company) => company.id) });
  const eliminations = (db.consolidationEliminations || [])
    .filter((item) => item.month === normalizedMonth && item.scopeKey === scopeKey)
    .map((item) => ({
      ...item,
      lineLabel: consolidatedRealStandard.find((row) => row.lineKey === item.lineKey)?.lineLabel || item.lineKey,
    }));

  const adjustedRowsWithEliminations = applyEliminationsToStandardRows(consolidatedRealStandard, eliminations);
  const adjustedStandard = buildAdjustedStandardTable(adjustedRowsWithEliminations);

  return {
    month: normalizedMonth,
    view,
    scopeKey,
    groupId,
    companyIds: selectedCompanies.map((company) => company.id),
    companies: selectedCompanies.map((company) => ({
      id: company.id,
      name: company.name,
      hasExecution: companyEntries.some((entry) => entry.company.id === company.id),
      hasBudget: budgetEntries.some((entry) => entry.company.id === company.id),
    })),
    summary: {
      totalCompanies: selectedCompanies.length,
      activeCompanies: companyEntries.length,
      missingExecutionCompanies,
      view,
      includeBudget: Boolean(includeBudget),
    },
    real: {
      standardMatrix: standardRealMatrix,
      detailedMatrix: detailedRealMatrix,
      consolidated: {
        standardTable: consolidatedRealStandard,
        detailedTable: consolidatedRealDetailed,
        adjustedStandardTable: adjustedStandard,
        adjustedRowsWithEliminations,
      },
    },
    budget: includeBudget ? {
      standardMatrix: standardBudgetMatrix,
      detailedMatrix: detailedBudgetMatrix,
      consolidated: {
        standardTable: consolidatedBudgetStandard,
        detailedTable: consolidatedBudgetDetailed,
      },
    } : null,
    comparison,
    notes: buildConsolidatedNotes(companyEntries, normalizedMonth),
    accountMapping: buildConsolidatedMapping(companyEntries, normalizedMonth),
    eliminations: {
      items: eliminations,
      summary: buildEliminationSummary(eliminations),
      total: round2(eliminations.reduce((acc, item) => acc + Number(item.value || 0), 0)),
    },
  };
}

module.exports = {
  buildConsolidatedDataset,
  buildConsolidatedYtdDataset,
  buildEliminationScopeKey,
};
