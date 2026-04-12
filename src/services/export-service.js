const XLSX = require('xlsx');

const CURRENCY_FORMAT = '$#,##0.00;[Red]($#,##0.00)';

function setCurrency(ws, col, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r += 1) {
    const cell = ws[`${col}${r}`];
    if (cell && cell.t === 'n') {
      cell.z = CURRENCY_FORMAT;
    }
  }
}

function buildPygSheet(title, rows) {
  const data = [[title, 'Valor'], ...(rows || []).map((row) => [row.lineLabel, row.value])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 48 }, { wch: 20 }];
  setCurrency(ws, 'B', 2, data.length);
  return ws;
}

function buildDetailedPygSheet(title, rows) {
  const data = [['Sección P&G', 'Subgrupo', 'Valor', 'Cuentas'], ...(rows || []).map((row) => [row.sectionLabel, row.subgroup, row.value, row.accountCount])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 34 }, { wch: 34 }, { wch: 18 }, { wch: 12 }];
  setCurrency(ws, 'C', 2, data.length);
  return ws;
}

function buildBudgetSheet(rows) {
  const data = [
    ['Sección', 'Subgrupo', 'Presupuesto', 'Comentario'],
    ...(rows || []).map((row) => [row.lineLabel, row.subgroup || row.lineLabel, row.budget, row.comment || '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 34 }, { wch: 34 }, { wch: 20 }, { wch: 55 }];
  setCurrency(ws, 'C', 2, data.length);
  return ws;
}

function buildComparisonSheet(rows) {
  const data = [
    ['Línea', 'Presupuesto', 'Real', 'Variación', 'Variación %', 'Favorable', 'Estado', 'Prioridad', 'Comentario', 'Acción sugerida', 'Responsable'],
    ...(rows || []).map((row) => [
      row.lineLabel,
      row.budget,
      row.real,
      row.variation,
      row.variationPct,
      row.favorable ? 'Sí' : 'No',
      row.status,
      row.priority,
      row.comment,
      row.actionSuggested,
      row.responsibleSuggested,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 55 }, { wch: 55 }, { wch: 22 }];
  setCurrency(ws, 'B', 2, data.length);
  setCurrency(ws, 'C', 2, data.length);
  setCurrency(ws, 'D', 2, data.length);
  return ws;
}

function buildMatrixSheet(title, companies, rows, type = 'standard') {
  const companyNames = (companies || []).map((company) => company.name);
  const header = type === 'standard'
    ? ['Línea', ...companyNames, 'Total consolidado']
    : ['Sección', 'Subgrupo', ...companyNames, 'Total consolidado'];

  const data = [
    [title],
    header,
    ...(rows || []).map((row) => {
      const values = (companies || []).map((company) => Number(row.valuesByCompany?.[company.id] || 0));
      if (type === 'standard') {
        return [row.lineLabel, ...values, Number(row.total || 0)];
      }
      return [row.sectionLabel, row.subgroup, ...values, Number(row.total || 0)];
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = type === 'standard'
    ? [{ wch: 42 }, ...(companyNames.map(() => ({ wch: 16 }))), { wch: 18 }]
    : [{ wch: 28 }, { wch: 32 }, ...(companyNames.map(() => ({ wch: 16 }))), { wch: 18 }];

  const fromCol = type === 'standard' ? 'B' : 'C';
  const toIndex = (type === 'standard' ? 2 : 3) + companyNames.length;
  for (let i = (type === 'standard' ? 1 : 2); i <= toIndex; i += 1) {
    const col = XLSX.utils.encode_col(i);
    setCurrency(ws, col, 3, data.length);
  }

  return ws;
}

function buildActionPlanSheet(rows) {
  const data = [['Línea', 'Problema', 'Posible causa', 'Acción', 'Responsable sugerido', 'Prioridad', 'Horizonte'], ...(rows || []).map((row) => [row.line, row.problem, row.possibleCause, row.action, row.responsibleSuggested, row.priority, row.horizon])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 36 }, { wch: 40 }, { wch: 45 }, { wch: 55 }, { wch: 24 }, { wch: 10 }, { wch: 12 }];
  return ws;
}

function buildSimpleListSheet(title, rows, key = 'texto') {
  const data = [[title], ...(rows || []).map((item) => [typeof item === 'string' ? item : item[key] || ''])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 120 }];
  return ws;
}

function buildMappingSheet(rows) {
  const data = [['Cuenta', 'Nombre cuenta', 'Saldo original', 'Valor P&G', 'Valor gerencial', 'Sección P&G', 'Subgrupo', 'Observación', 'Tratamiento gerencial'], ...(rows || []).map((row) => [row.account, row.accountName, row.saldoOriginal, row.valorPyg, row.valorGerencial, row.seccionPyg, row.subgrupo, row.observacion, row.tratamientoGerencial])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 28 }, { wch: 48 }, { wch: 42 }];
  setCurrency(ws, 'C', 2, data.length);
  setCurrency(ws, 'D', 2, data.length);
  setCurrency(ws, 'E', 2, data.length);
  return ws;
}

function buildAccumulatedSummarySheet(dataset) {
  const period = dataset.period || {};
  const meta = dataset.meta || {};
  const exec = dataset.executiveSummary || {};
  const data = [
    ['Resumen acumulado YTD'],
    ['Empresa', dataset.companyName || ''],
    ['Corte (hasta mes)', dataset.cutoffMonth || ''],
    ['Año', dataset.year || ''],
    ['Esquema API', meta.schema || ''],
    ['Meses con ejecución', String(dataset.summary?.totalMonths ?? '')],
    ['Desde', period.fromMonth || ''],
    ['Hasta', period.toMonth || ''],
    ['Meses incluidos', (period.monthsIncluded || []).join(', ')],
    ['Meses sin presupuesto (si aplica)', (period.monthsWithoutBudget || []).join(', ') || '—'],
    ['Utilidad contable YTD', dataset.summary?.totalUtilityContable ?? 0],
    ['Utilidad gerencial YTD', dataset.summary?.totalUtilityGerencial ?? 0],
    ['Comparativo presupuesto activo', dataset.summary?.comparisonEnabled ? 'Sí' : 'No'],
    [],
    ['Resumen ejecutivo'],
    ['Periodo', exec.periodLabel || ''],
    ['Cumplimiento líneas (si hay comparativo)', exec.budgetComparison?.compliancePct != null ? String(exec.budgetComparison.compliancePct) + '%' : 'N/A'],
    ['Líneas evaluadas', String(exec.budgetComparison?.linesEvaluated ?? '')],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 42 }, { wch: 56 }];
  return ws;
}

function buildAccumulatedExecutiveTableSheet(executiveSummary) {
  const ex = executiveSummary || {};
  const top = ex.budgetComparison?.topUnfavorableLines || [];
  const data = [
    ['Top desvíos desfavorables (real vs presupuesto acumulado)'],
    ['Línea', 'Presupuesto', 'Real', 'Variación', 'Variación %', 'Estado'],
    ...top.map((r) => [r.lineLabel, r.budget, r.real, r.variation, r.variationPct, r.status]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  setCurrency(ws, 'B', 3, data.length);
  setCurrency(ws, 'C', 3, data.length);
  setCurrency(ws, 'D', 3, data.length);
  return ws;
}

function buildAccumulatedNotesFullSheet(notesObject = {}) {
  const keys = [
    ['technicalNotes', 'Notas técnicas'],
    ['qualityWarnings', 'Advertencias calidad'],
    ['exclusionsSuggested', 'Exclusiones sugeridas'],
    ['reclassificationsSuggested', 'Reclasificaciones sugeridas'],
    ['missingDescriptions', 'Descripciones faltantes'],
  ];
  const data = [['Notas y advertencias acumuladas (por categoría)']];
  keys.forEach(([key, label]) => {
    data.push([]);
    data.push([label]);
    (notesObject[key] || []).forEach((line) => data.push([String(line)]));
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 120 }];
  return ws;
}

function buildAccumulatedAdjustmentsSheet(rows) {
  const data = [['Mes', 'Cuenta', 'Nombre cuenta', 'Sección', 'Subgrupo', 'Categoría', 'Acción', 'Valor excluido', 'Razón'], ...(rows || []).map((row) => [row.month, row.account, row.accountName, row.sectionLabel, row.subgroup, row.category, row.action, row.excludedValue, row.reason])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 56 }];
  setCurrency(ws, 'H', 2, data.length);
  return ws;
}

function buildAccumulatedMappingSheet(rows) {
  const data = [['Mes', 'Cuenta', 'Nombre cuenta', 'Saldo original', 'Valor P&G', 'Valor gerencial', 'Sección P&G', 'Subgrupo', 'Observación', 'Tratamiento gerencial'], ...(rows || []).map((row) => [row.month, row.account, row.accountName, row.saldoOriginal, row.valorPyg, row.valorGerencial, row.seccionPyg, row.subgrupo, row.observacion, row.tratamientoGerencial])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 28 }, { wch: 48 }, { wch: 42 }];
  setCurrency(ws, 'D', 2, data.length);
  setCurrency(ws, 'E', 2, data.length);
  setCurrency(ws, 'F', 2, data.length);
  return ws;
}

function buildAdjustmentsSheet(rows) {
  const data = [['Cuenta', 'Nombre cuenta', 'Sección', 'Subgrupo', 'Categoría', 'Acción', 'Valor excluido', 'Razón'], ...(rows || []).map((row) => [row.account, row.accountName, row.sectionLabel, row.subgroup, row.category, row.action, row.excludedValue, row.reason])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 56 }];
  setCurrency(ws, 'G', 2, data.length);
  return ws;
}

function buildEliminationsSheet(rows) {
  const data = [['Mes', 'Tipo', 'Empresa origen', 'Empresa destino', 'Línea P&G', 'Descripción', 'Valor'], ...(rows || []).map((row) => [row.sourceYtdMonth || row.month, row.eliminationType, row.sourceCompanyId || '', row.targetCompanyId || '', row.lineLabel || row.lineKey, row.description, row.value])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 32 }, { wch: 50 }, { wch: 16 }];
  setCurrency(ws, 'G', 2, data.length);
  return ws;
}

function buildConsolidatedYtdPeriodSheet(dataset) {
  const y = dataset.ytdPeriod || {};
  const data = [
    ['Consolidado año corrido (YTD)'],
    ['Corte (último mes del periodo)', dataset.cutoffMonth || dataset.month || ''],
    ['Desde', y.fromMonth || ''],
    ['Hasta', y.toMonth || ''],
    ['Meses calendario en ventana', (y.months || []).join(', ')],
    ['Empresas sin datos YTD en corte', (dataset.summary?.missingYtdCompanies || []).join(', ') || '—'],
    ['Esquema', dataset.meta?.schema || ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 38 }, { wch: 72 }];
  return ws;
}

function createWorkbookBuffer(snapshot) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, buildPygSheet('P&G Contable', snapshot.execution?.contable?.standardTable || snapshot.execution?.contable?.pygTable), 'PYG Contable');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('P&G Gerencial', snapshot.execution?.gerencial?.standardTable || snapshot.execution?.gerencial?.pygTable), 'PYG Gerencial');
  XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('P&G detallado contable', snapshot.execution?.contable?.detailedTable || []), 'PYG Detallado C');
  XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('P&G detallado gerencial', snapshot.execution?.gerencial?.detailedTable || []), 'PYG Detallado G');
  XLSX.utils.book_append_sheet(workbook, buildMappingSheet(snapshot.execution?.accountMapping || []), 'Mapeo cuentas');
  XLSX.utils.book_append_sheet(workbook, buildAdjustmentsSheet(snapshot.execution?.managerialAdjustments || []), 'Ajustes gerenciales');
  XLSX.utils.book_append_sheet(workbook, buildBudgetSheet(snapshot.budget?.rows || []), 'Presupuesto detalle');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('Presupuesto contable', snapshot.budget?.contable?.standardTable || []), 'Presup. Contable');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('Presupuesto gerencial', snapshot.budget?.gerencial?.standardTable || []), 'Presup. Gerencial');
  XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('Presupuesto detallado', snapshot.budget?.gerencial?.detailedTable || snapshot.budget?.contable?.detailedTable || []), 'Presup. Detallado');
  XLSX.utils.book_append_sheet(workbook, buildComparisonSheet(snapshot.comparison?.rows || []), 'Comparativo');
  XLSX.utils.book_append_sheet(workbook, buildActionPlanSheet(snapshot.analysis?.actionPlan || []), 'Plan acción');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Hallazgos clave', snapshot.analysis?.findings || []), 'Hallazgos');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Alertas de calidad de dato', snapshot.analysis?.dataQualityAlerts || []), 'Calidad dato');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Supuestos gerenciales de presupuesto', snapshot.budget?.notes || snapshot.budget?.assumptions || []), 'Supuestos presupuesto');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Exclusiones sugeridas', snapshot.execution?.automaticNotes?.exclusionsSuggested || []), 'Notas exclusión');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Reclasificaciones sugeridas', snapshot.execution?.automaticNotes?.reclassificationsSuggested || []), 'Notas reclasif');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Notas técnicas', snapshot.execution?.automaticNotes?.technicalNotes || []), 'Notas técnicas');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function createBudgetTemplateWorkbookBuffer({ companyName, month, templateRows = [] }) {
  const workbook = XLSX.utils.book_new();
  const data = [
    ['Empresa', 'Mes', 'Sección', 'Subgrupo', 'Presupuesto', 'Comentario'],
    ...(templateRows || []).map((row) => [companyName || '', month || '', row.lineLabel || row.lineKey || '', row.subgroup || row.lineLabel || '', 0, '']),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 34 }, { wch: 34 }, { wch: 20 }, { wch: 55 }];
  setCurrency(ws, 'E', 2, data.length);
  XLSX.utils.book_append_sheet(workbook, ws, 'Plantilla presupuesto');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function createAccumulatedWorkbookBuffer(dataset) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, buildAccumulatedSummarySheet(dataset), '00 Resumen');
  XLSX.utils.book_append_sheet(workbook, buildAccumulatedExecutiveTableSheet(dataset.executiveSummary), '01 Ejecutivo');

  XLSX.utils.book_append_sheet(workbook, buildPygSheet('Acumulado contable', dataset.execution?.contable?.standardTable || []), 'Acum. Contable');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('Acumulado gerencial', dataset.execution?.gerencial?.standardTable || []), 'Acum. Gerencial');
  XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('Acumulado detallado contable', dataset.execution?.contable?.detailedTable || []), 'Acum. Detallado C');
  XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('Acumulado detallado gerencial', dataset.execution?.gerencial?.detailedTable || []), 'Acum. Detallado G');
  XLSX.utils.book_append_sheet(workbook, buildAccumulatedMappingSheet(dataset.execution?.accountMapping || []), 'Acum. Mapeo');
  XLSX.utils.book_append_sheet(workbook, buildAccumulatedAdjustmentsSheet(dataset.execution?.managerialAdjustments || []), 'Acum. Ajustes');

  if (dataset.budget) {
    XLSX.utils.book_append_sheet(workbook, buildPygSheet('Presupuesto acumulado contable', dataset.budget?.contable?.standardTable || []), 'Ppto. Acum. C');
    XLSX.utils.book_append_sheet(workbook, buildPygSheet('Presupuesto acumulado gerencial', dataset.budget?.gerencial?.standardTable || []), 'Ppto. Acum. G');
    XLSX.utils.book_append_sheet(workbook, buildDetailedPygSheet('Presupuesto acumulado detallado', dataset.budget?.gerencial?.detailedTable || dataset.budget?.contable?.detailedTable || []), 'Ppto. Acum. D');
  }

  if (dataset.comparison?.rows?.length) {
    XLSX.utils.book_append_sheet(workbook, buildComparisonSheet(dataset.comparison.rows), 'Acum. Comparativo');
  }

  XLSX.utils.book_append_sheet(workbook, buildAccumulatedNotesFullSheet(dataset.execution?.automaticNotes || {}), 'Acum. Notas');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function createConsolidatedWorkbookBuffer(dataset) {
  const workbook = XLSX.utils.book_new();
  if (dataset.periodType === 'ytd') {
    XLSX.utils.book_append_sheet(workbook, buildConsolidatedYtdPeriodSheet(dataset), '00 YTD Periodo');
  }
  XLSX.utils.book_append_sheet(workbook, buildMatrixSheet('Consolidado real estándar', dataset.companies, dataset.real?.standardMatrix || [], 'standard'), 'Cons. Real');
  XLSX.utils.book_append_sheet(workbook, buildMatrixSheet('Consolidado real detallado', dataset.companies, dataset.real?.detailedMatrix || [], 'detailed'), 'Cons. Real Det');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('Consolidado ajustado por eliminaciones', dataset.real?.consolidated?.adjustedStandardTable || []), 'Cons. Ajustado');

  if (dataset.budget) {
    XLSX.utils.book_append_sheet(workbook, buildMatrixSheet('Consolidado presupuesto estándar', dataset.companies, dataset.budget?.standardMatrix || [], 'standard'), 'Cons. Ppto');
    XLSX.utils.book_append_sheet(workbook, buildMatrixSheet('Consolidado presupuesto detallado', dataset.companies, dataset.budget?.detailedMatrix || [], 'detailed'), 'Cons. Ppto Det');
  }

  if (dataset.comparison?.rows?.length) {
    XLSX.utils.book_append_sheet(workbook, buildComparisonSheet(dataset.comparison.rows), 'Cons. Comparativo');
  }

  XLSX.utils.book_append_sheet(workbook, buildEliminationsSheet(dataset.eliminations?.items || []), 'Eliminaciones');
  XLSX.utils.book_append_sheet(workbook, buildAccumulatedMappingSheet(dataset.accountMapping || []), 'Cons. Mapeo');
  XLSX.utils.book_append_sheet(workbook, buildSimpleListSheet('Notas consolidado', dataset.notes || []), 'Cons. Notas');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  createWorkbookBuffer,
  createBudgetTemplateWorkbookBuffer,
  createAccumulatedWorkbookBuffer,
  createConsolidatedWorkbookBuffer,
};
