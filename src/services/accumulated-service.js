/**
 * Acumulado YTD por empresa — capa sobre el mismo modelo maestro que el mensual:
 * ejecución por mes con contable/gerencial (standardTable, detailedTable, accountMapping,
 * managerialAdjustments). La suma YTD agrega por lineKey / (sección+subgrupo), no por
 * “cuenta cruda” como motor principal. Presupuesto mensual se suma en paralelo cuando
 * includeBudget y existe presupuesto por mes. Este módulo expone meta.schema para
 * alinear futuros consolidados (Fase 2+) que reutilizarán las mismas tablas estándar.
 */
const { compareBudgetVsReal } = require('./comparison-service');
const { sortMonths, ensureMonth } = require('../utils/date-utils');
const { round2 } = require('../utils/number-utils');

const ACCUMULATED_SCHEMA_ID = 'accumulated_ytd_v1';

function sumStandardTables(tables = []) {
  const totals = new Map();
  const labels = new Map();

  tables.forEach((rows) => {
    (rows || []).forEach((row) => {
      const key = String(row.lineKey || '').trim();
      if (!key) return;
      labels.set(key, row.lineLabel || key);
      const addend = Number(row.value ?? row.real ?? row.budget ?? 0);
      totals.set(key, round2((totals.get(key) || 0) + addend));
    });
  });

  return Array.from(labels.keys()).map((key) => ({
    lineKey: key,
    lineLabel: labels.get(key) || key,
    value: round2(totals.get(key) || 0),
    budget: round2(totals.get(key) || 0),
  }));
}

function sumDetailedTables(tables = []) {
  const groups = new Map();

  tables.forEach((rows) => {
    (rows || []).forEach((row) => {
      const sectionLabel = String(row.sectionLabel || '').trim();
      const subgroup = String(row.subgroup || '').trim();
      const key = `${sectionLabel}|${subgroup}`;
      const current = groups.get(key) || {
        sectionKey: row.sectionKey || '',
        sectionLabel,
        subgroup,
        value: 0,
        accountCount: 0,
      };
      current.value = round2(current.value + Number(row.value || 0));
      current.accountCount += Number(row.accountCount || 0);
      groups.set(key, current);
    });
  });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.sectionLabel !== b.sectionLabel) {
      return a.sectionLabel.localeCompare(b.sectionLabel, 'es');
    }
    return Math.abs(b.value) - Math.abs(a.value);
  });
}

function buildAccumulatedMapping(monthSnapshots = []) {
  return monthSnapshots.flatMap(({ month, execution }) =>
    (execution?.accountMapping || []).map((row) => ({
      month,
      ...row,
    }))
  );
}

function buildAccumulatedAdjustments(monthSnapshots = []) {
  return monthSnapshots.flatMap(({ month, execution }) =>
    (execution?.managerialAdjustments || []).map((row) => ({
      month,
      ...row,
    }))
  );
}

function buildAccumulatedExecutiveSummary({ summary, comparison, period }) {
  const rows = comparison?.rows || [];
  const totalLines = rows.length;
  const cumplidas = rows.filter((r) => r.status === 'Cumplido').length;
  const compliancePct = totalLines ? Math.round((cumplidas / totalLines) * 100) : null;
  const topUnfavorable = totalLines
    ? [...rows]
      .filter((r) => !r.favorable)
      .sort((a, b) => Math.abs(Number(b.variationPct || 0)) - Math.abs(Number(a.variationPct || 0)))
      .slice(0, 5)
    : [];

  return {
    periodLabel: `${period.fromMonth} → ${period.toMonth}`,
    monthsIncluded: period.monthsIncluded,
    monthsWithoutBudget: period.monthsWithoutBudget || [],
    totalMonthsWithExecution: summary.totalMonths,
    utilitiesYtd: {
      contable: summary.totalUtilityContable,
      gerencial: summary.totalUtilityGerencial,
    },
    budgetComparison: {
      enabled: Boolean(comparison),
      compliancePct,
      linesEvaluated: totalLines,
      topUnfavorableLines: topUnfavorable.map((r) => ({
        lineKey: r.lineKey,
        lineLabel: r.lineLabel,
        budget: r.budget,
        real: r.real,
        variation: r.variation,
        variationPct: r.variationPct,
        status: r.status,
      })),
    },
  };
}

function buildAccumulatedNotes(monthSnapshots = [], missingBudgetMonths = []) {
  const notes = {
    exclusionsSuggested: [],
    reclassificationsSuggested: [],
    qualityWarnings: [],
    missingDescriptions: [],
    technicalNotes: [],
  };

  monthSnapshots.forEach(({ month, execution }) => {
    const automaticNotes = execution?.automaticNotes || {};
    Object.keys(notes).forEach((key) => {
      (automaticNotes[key] || []).forEach((item) => {
        notes[key].push(`${month}: ${item}`);
      });
    });
  });

  if (missingBudgetMonths.length) {
    notes.technicalNotes.push(`Meses sin presupuesto en el acumulado: ${missingBudgetMonths.join(', ')}.`);
  }

  notes.technicalNotes.push('El acumulado corresponde al año corrido desde enero hasta el mes de corte seleccionado.');

  Object.keys(notes).forEach((key) => {
    notes[key] = Array.from(new Set(notes[key]));
  });

  return notes;
}

function filterYearMonths(months = [], cutoffMonth) {
  const normalizedCutoff = ensureMonth(cutoffMonth);
  const year = normalizedCutoff.slice(0, 4);
  return sortMonths(months).filter((month) => month.startsWith(year) && month <= normalizedCutoff);
}

function buildAccumulatedDataset({ company, companyData, cutoffMonth, includeBudget = true }) {
  const months = filterYearMonths(Object.keys(companyData.months || {}), cutoffMonth);
  const monthSnapshots = months
    .map((month) => ({
      month,
      snapshot: companyData.months[month],
    }))
    .filter(({ snapshot }) => snapshot?.execution);

  if (!monthSnapshots.length) {
    throw new Error('No hay ejecución cargada para construir el acumulado de la empresa en ese año.');
  }

  const executionContableStandard = sumStandardTables(
    monthSnapshots.map(({ snapshot }) => snapshot.execution?.contable?.standardTable || snapshot.execution?.contable?.pygTable || [])
  );
  const executionGerencialStandard = sumStandardTables(
    monthSnapshots.map(({ snapshot }) => snapshot.execution?.gerencial?.standardTable || snapshot.execution?.gerencial?.pygTable || [])
  );
  const executionContableDetailed = sumDetailedTables(
    monthSnapshots.map(({ snapshot }) => snapshot.execution?.contable?.detailedTable || [])
  );
  const executionGerencialDetailed = sumDetailedTables(
    monthSnapshots.map(({ snapshot }) => snapshot.execution?.gerencial?.detailedTable || [])
  );

  const monthsWithBudget = monthSnapshots.filter(({ snapshot }) => snapshot?.budget);
  const missingBudgetMonths = includeBudget
    ? monthSnapshots.filter(({ snapshot }) => !snapshot?.budget).map(({ month }) => month)
    : [];

  const budgetContableStandard = includeBudget
    ? sumStandardTables(monthsWithBudget.map(({ snapshot }) => snapshot.budget?.contable?.standardTable || []))
    : [];
  const budgetGerencialStandard = includeBudget
    ? sumStandardTables(monthsWithBudget.map(({ snapshot }) => snapshot.budget?.gerencial?.standardTable || []))
    : [];
  const budgetContableDetailed = includeBudget
    ? sumDetailedTables(monthsWithBudget.map(({ snapshot }) => snapshot.budget?.contable?.detailedTable || []))
    : [];
  const budgetGerencialDetailed = includeBudget
    ? sumDetailedTables(monthsWithBudget.map(({ snapshot }) => snapshot.budget?.gerencial?.detailedTable || []))
    : [];

  const notes = buildAccumulatedNotes(
    monthSnapshots.map(({ month, snapshot }) => ({ month, execution: snapshot.execution })),
    missingBudgetMonths
  );

  const comparison = includeBudget && budgetGerencialStandard.length
    ? compareBudgetVsReal({
        budgetRows: budgetGerencialStandard,
        realPygTable: executionGerencialStandard,
        lineSettings: companyData.lineSettings,
      })
    : null;

  const totalUtilityContable = executionContableStandard.find((row) => row.lineKey === 'utilidad_antes_impuestos')?.value || 0;
  const totalUtilityGerencial = executionGerencialStandard.find((row) => row.lineKey === 'utilidad_gerencial_ajustada')?.value
    || executionGerencialStandard.find((row) => row.lineKey === 'utilidad_antes_impuestos')?.value
    || 0;

  const period = {
    fromMonth: monthSnapshots[0].month,
    toMonth: ensureMonth(cutoffMonth),
    monthsIncluded: monthSnapshots.map(({ month }) => month),
    monthsWithoutBudget: missingBudgetMonths,
  };

  const summaryBlock = {
    totalMonths: monthSnapshots.length,
    totalUtilityContable: round2(totalUtilityContable),
    totalUtilityGerencial: round2(totalUtilityGerencial),
    comparisonEnabled: Boolean(comparison),
  };

  const executiveSummary = buildAccumulatedExecutiveSummary({
    summary: summaryBlock,
    comparison,
    period,
  });

  return {
    meta: {
      schema: ACCUMULATED_SCHEMA_ID,
      reportType: 'accumulated_ytd',
      consolidationReady: true,
      description: 'Suma YTD de tablas estándar/detalle por empresa; mismo shape que mensual para reutilizar en consolidado.',
    },
    companyId: company.id,
    companyName: company.name,
    cutoffMonth: ensureMonth(cutoffMonth),
    year: ensureMonth(cutoffMonth).slice(0, 4),
    period,
    summary: summaryBlock,
    executiveSummary,
    execution: {
      contable: {
        standardTable: executionContableStandard,
        detailedTable: executionContableDetailed,
      },
      gerencial: {
        standardTable: executionGerencialStandard,
        detailedTable: executionGerencialDetailed,
      },
      accountMapping: buildAccumulatedMapping(
        monthSnapshots.map(({ month, snapshot }) => ({ month, execution: snapshot.execution }))
      ),
      managerialAdjustments: buildAccumulatedAdjustments(
        monthSnapshots.map(({ month, snapshot }) => ({ month, execution: snapshot.execution }))
      ),
      automaticNotes: notes,
    },
    budget: includeBudget
      ? {
          contable: {
            standardTable: budgetContableStandard,
            detailedTable: budgetContableDetailed,
          },
          gerencial: {
            standardTable: budgetGerencialStandard,
            detailedTable: budgetGerencialDetailed,
          },
          notes: [
            'El presupuesto acumulado corresponde a la suma de los presupuestos mensuales cargados desde enero hasta el mes de corte.',
            'La vista gerencial acumulada preserva depreciación como subgrupo y ICA estimado presupuestado.',
          ],
        }
      : null,
    comparison,
  };
}

module.exports = {
  buildAccumulatedDataset,
};
