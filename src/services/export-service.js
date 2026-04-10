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

function buildAdjustmentsSheet(rows) {
  const data = [['Cuenta', 'Nombre cuenta', 'Sección', 'Subgrupo', 'Categoría', 'Acción', 'Valor excluido', 'Razón'], ...(rows || []).map((row) => [row.account, row.accountName, row.sectionLabel, row.subgroup, row.category, row.action, row.excludedValue, row.reason])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 56 }];
  setCurrency(ws, 'G', 2, data.length);
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

module.exports = {
  createWorkbookBuffer,
  createBudgetTemplateWorkbookBuffer,
};
