const { PYG_LINES, RESPONSIBLE_BY_LINE } = require('../config/pyg-lines');
const { DEFAULT_TOLERANCES } = require('../config/tolerances');
const { round2 } = require('../utils/number-utils');
const { normalizeLineSettings } = require('./line-settings-service');

function getLineMeta(lineKey) {
  return PYG_LINES.find((line) => line.key === lineKey);
}

function evaluateCompliance({ lineKey, budget, real, hasBudget, lineSetting }) {
  const meta = getLineMeta(lineKey);
  const direction = meta?.direction || 'higher_better';

  const variation = round2(real - budget);
  const budgetAbs = Math.abs(budget || 0);
  const variationPct = budgetAbs > 0 ? round2((variation / budgetAbs) * 100) : null;

  const tolerancePct = Number(lineSetting?.tolerancePct);
  const safeTolerance = Number.isFinite(tolerancePct) && tolerancePct >= 0
    ? tolerancePct
    : Number(DEFAULT_TOLERANCES.cumplido_max_desfavorable_pct || 5);

  if (!hasBudget) {
    return {
      variation,
      variationPct,
      favorable: false,
      status: 'Alerta',
      priority: lineSetting?.priority || 'Media',
    };
  }

  let favorable = true;
  if (direction === 'higher_better') {
    favorable = real >= budget;
  } else {
    favorable = real <= budget;
  }

  let unfavorableDeviationPct = 0;
  if (!favorable && budgetAbs > 0) {
    unfavorableDeviationPct = Math.abs(variationPct || 0);
  }

  let status = 'Cumplido';
  if (!favorable && budgetAbs > 0) {
    if (unfavorableDeviationPct > safeTolerance * 2) {
      status = 'Incumplido';
    } else if (unfavorableDeviationPct > safeTolerance) {
      status = 'Alerta';
    }
  }

  const priority = status === 'Incumplido'
    ? 'Alta'
    : status === 'Alerta'
      ? 'Media'
      : (lineSetting?.priority || 'Baja');

  return {
    variation,
    variationPct,
    favorable,
    status,
    priority,
  };
}

function buildActionSuggestion(lineKey, status, favorable, hasBudget) {
  if (!hasBudget) {
    return 'Definir presupuesto de referencia para esta linea antes del siguiente cierre.';
  }

  if (status === 'Cumplido' && favorable) {
    return 'Mantener estrategia y documentar factores de exito para replicar.';
  }

  const suggestions = {
    ingresos_operacionales: 'Reforzar plan comercial, conversion y seguimiento de pipeline semanal.',
    costos_directos: 'Revisar eficiencia operativa y renegociar costos de proveedores criticos.',
    gastos_administrativos: 'Ajustar gastos discrecionales y controlar compras no presupuestadas.',
    gastos_ventas: 'Priorizar canales con mayor retorno y recortar actividades de bajo impacto.',
    gastos_financieros: 'Optimizar flujo de caja y renegociar condiciones financieras.',
    otros_gastos_no_operacionales: 'Depurar eventos no recurrentes y exigir autorizacion previa.',
    utilidad_neta: 'Activar plan integral de rentabilidad con responsables por frente.',
    ica_estimado_gerencial: 'Validar la base de ingresos usada para el c?lculo del ICA gerencial estimado.',
    utilidad_gerencial_ajustada: 'Revisar conjuntamente ingresos, ICA y estructura de gasto para recuperar la utilidad ajustada.',
  };

  return suggestions[lineKey] || 'Abrir plan de accion correctivo con seguimiento semanal.';
}

function buildComment(lineLabel, status, favorable, variationPct, hasBudget) {
  if (!hasBudget) {
    return `${lineLabel}: sin presupuesto cargado para el mes.`;
  }

  if (status === 'Cumplido' && favorable) {
    return `${lineLabel}: desempeño favorable frente al presupuesto.`;
  }

  if (variationPct === null) {
    return `${lineLabel}: presupuesto en cero; revisar base presupuestal.`;
  }

  return `${lineLabel}: desviacion ${Math.abs(variationPct)}% (${favorable ? 'favorable' : 'desfavorable'}).`;
}

function compareBudgetVsReal({ budgetRows, realPygTable, lineSettings }) {
  const settingsMap = normalizeLineSettings(lineSettings);
  const budgetMap = new Map((budgetRows || []).map((row) => [row.lineKey, Number((row.budget ?? row.value ?? 0))]));
  const realMap = new Map((realPygTable || []).map((row) => [row.lineKey, Number((row.real ?? row.value ?? 0))]));

  const rows = PYG_LINES.map((line) => {
    const setting = settingsMap[line.key] || {};
    const hasBudget = budgetMap.has(line.key);
    const budget = hasBudget ? Number(budgetMap.get(line.key) || 0) : null;
    const real = Number(realMap.get(line.key) || 0);

    const evalResult = evaluateCompliance({
      lineKey: line.key,
      budget: budget ?? 0,
      real,
      hasBudget,
      lineSetting: setting,
    });

    return {
      lineKey: line.key,
      lineLabel: line.label,
      budget,
      real,
      variation: evalResult.variation,
      variationPct: evalResult.variationPct,
      favorable: evalResult.favorable,
      status: evalResult.status,
      priority: evalResult.priority,
      comment: buildComment(line.label, evalResult.status, evalResult.favorable, evalResult.variationPct, hasBudget),
      actionSuggested: buildActionSuggestion(line.key, evalResult.status, evalResult.favorable, hasBudget),
      responsibleSuggested: setting.responsibleSuggested || RESPONSIBLE_BY_LINE[line.key] || 'Direccion financiera',
      tolerancePct: setting.tolerancePct,
      active: setting.active !== false,
    };
  });

  const kpis = {
    cumplidas: rows.filter((row) => row.status === 'Cumplido').length,
    alertas: rows.filter((row) => row.status === 'Alerta').length,
    incumplidas: rows.filter((row) => row.status === 'Incumplido').length,
    utilidadNetaReal: rows.find((row) => row.lineKey === 'utilidad_neta')?.real || 0,
    utilidadNetaPresupuesto: rows.find((row) => row.lineKey === 'utilidad_neta')?.budget || 0,
    utilidadGerencialAjustadaReal: rows.find((row) => row.lineKey === 'utilidad_gerencial_ajustada')?.real || 0,
    utilidadGerencialAjustadaPresupuesto: rows.find((row) => row.lineKey === 'utilidad_gerencial_ajustada')?.budget || 0,
  };

  return {
    rows,
    kpis,
    lineSettings: settingsMap,
  };
}

module.exports = {
  compareBudgetVsReal,
};
