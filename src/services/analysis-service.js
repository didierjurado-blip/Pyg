function topByAbsoluteVariation(rows, count = 3) {
  return [...rows]
    .sort((a, b) => Math.abs(b.variation || 0) - Math.abs(a.variation || 0))
    .slice(0, count);
}

function buildExecutiveSummary({ month, comparison, contable, gerencial, dataQualityAlerts }) {
  const utilityRow = comparison.rows.find((row) => row.lineKey === 'utilidad_neta');
  const metBudget = utilityRow ? utilityRow.favorable : false;

  const highlights = [];
  if (comparison.kpis.incumplidas === 0) {
    highlights.push('No se detectaron lineas en incumplimiento en el mes analizado.');
  } else {
    highlights.push(`Se detectaron ${comparison.kpis.incumplidas} lineas en incumplimiento.`);
  }

  const topDeviations = topByAbsoluteVariation(comparison.rows.filter((row) => row.status !== 'Cumplido'));
  topDeviations.forEach((row) => {
    highlights.push(`${row.lineLabel}: variacion ${row.variation.toLocaleString('es-CO')} (${row.variationPct ?? 'n/a'}%).`);
  });

  if ((dataQualityAlerts || []).length) {
    highlights.push(`Alertas de calidad de dato activas: ${dataQualityAlerts.length}.`);
  }

  const rentabilityImpact = contable.totals.utilidad_neta - gerencial.totals.utilidad_neta;

  return {
    month,
    metBudget,
    mainMessage: metBudget
      ? 'El mes cumple el objetivo de utilidad neta frente al presupuesto.'
      : 'El mes no cumple el objetivo de utilidad neta y requiere plan correctivo.',
    rentabilityImpact,
    highlights,
  };
}

function buildFindings({ comparison, execution }) {
  const findings = [];

  if (execution.summary.incomeRawNegativeCount > 0) {
    findings.push('Los ingresos en negativo del exporte contable se normalizaron a positivo para el P&G.');
  }

  if (execution.summary.alertedAccounts > 0) {
    findings.push(`Se detectaron ${execution.summary.alertedAccounts} cuentas con alertas contables (IVA, activos, reintegros u otras).`);
  }

  const worst = comparison.rows
    .filter((row) => row.status === 'Incumplido')
    .sort((a, b) => Math.abs(b.variation || 0) - Math.abs(a.variation || 0))
    .slice(0, 5);

  worst.forEach((row) => {
    findings.push(`${row.lineLabel} en ${row.status}: variacion ${row.variation.toLocaleString('es-CO')} (${row.variationPct ?? 'n/a'}%).`);
  });

  if (!worst.length) {
    findings.push('No hay desviaciones criticas; enfocar seguimiento en alertas y lineas con tendencia creciente de gasto.');
  }

  return findings;
}

function buildActionPlan(comparisonRows) {
  return comparisonRows
    .filter((row) => row.status !== 'Cumplido')
    .sort((a, b) => {
      if (a.priority === b.priority) {
        return Math.abs(b.variation || 0) - Math.abs(a.variation || 0);
      }
      return a.priority === 'Alta' ? -1 : b.priority === 'Alta' ? 1 : 0;
    })
    .map((row) => ({
      line: row.lineLabel,
      problem: row.comment,
      possibleCause: row.favorable
        ? 'Variacion favorable por encima de expectativa; validar sostenibilidad.'
        : 'Desviacion desfavorable frente al plan presupuestado.',
      action: row.actionSuggested,
      responsibleSuggested: row.responsibleSuggested,
      priority: row.priority,
      horizon: row.priority === 'Alta' ? '0-30 dias' : row.priority === 'Media' ? '30-60 dias' : '60-90 dias',
    }));
}

module.exports = {
  buildExecutiveSummary,
  buildFindings,
  buildActionPlan,
};