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

function buildBudgetSheet(rows) {
  const data = [
    ['Linea', 'Presupuesto', 'Comentario'],
    ...(rows || []).map((row) => [row.lineLabel, row.budget, row.comment || '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 46 }, { wch: 20 }, { wch: 55 }];
  setCurrency(ws, 'B', 2, data.length);
  return ws;
}

function buildComparisonSheet(rows) {
  const data = [
    [
      'Linea',
      'Presupuesto',
      'Real',
      'Variacion',
      'Variacion %',
      'Favorable',
      'Estado',
      'Prioridad',
      'Comentario',
      'Accion sugerida',
      'Responsable',
    ],
    ...(rows || []).map((row) => [
      row.lineLabel,
      row.budget,
      row.real,
      row.variation,
      row.variationPct,
      row.favorable ? 'Si' : 'No',
      row.status,
      row.priority,
      row.comment,
      row.actionSuggested,
      row.responsibleSuggested,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 42 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 55 },
    { wch: 55 },
    { wch: 22 },
  ];

  setCurrency(ws, 'B', 2, data.length);
  setCurrency(ws, 'C', 2, data.length);
  setCurrency(ws, 'D', 2, data.length);
  return ws;
}

function buildActionPlanSheet(rows) {
  const data = [
    ['Linea', 'Problema', 'Posible causa', 'Accion', 'Responsable sugerido', 'Prioridad', 'Horizonte'],
    ...(rows || []).map((row) => [
      row.line,
      row.problem,
      row.possibleCause,
      row.action,
      row.responsibleSuggested,
      row.priority,
      row.horizon,
    ]),
  ];

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

function createWorkbookBuffer(snapshot) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, buildPygSheet('P&G Contable', snapshot.execution?.contable?.pygTable), 'PYG Contable');
  XLSX.utils.book_append_sheet(workbook, buildPygSheet('P&G Gerencial', snapshot.execution?.gerencial?.pygTable), 'PYG Gerencial');
  XLSX.utils.book_append_sheet(workbook, buildBudgetSheet(snapshot.budget?.rows || []), 'Presupuesto');
  XLSX.utils.book_append_sheet(workbook, buildComparisonSheet(snapshot.comparison?.rows || []), 'Comparativo');
  XLSX.utils.book_append_sheet(workbook, buildActionPlanSheet(snapshot.analysis?.actionPlan || []), 'Plan accion');
  XLSX.utils.book_append_sheet(
    workbook,
    buildSimpleListSheet('Hallazgos clave', snapshot.analysis?.findings || []),
    'Hallazgos'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildSimpleListSheet('Alertas de calidad de dato', snapshot.analysis?.dataQualityAlerts || []),
    'Calidad dato'
  );

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });
}


function createBudgetTemplateWorkbookBuffer({ companyName, month, templateRows = [] }) {
  const workbook = XLSX.utils.book_new();
  const data = [
    ['Empresa', 'Mes', 'Linea', 'Presupuesto', 'Comentario'],
    ...(templateRows || []).map((row) => [
      companyName || '',
      month || '',
      row.lineLabel || row.lineKey || '',
      0,
      '',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 46 }, { wch: 20 }, { wch: 55 }];
  setCurrency(ws, 'D', 2, data.length);
  XLSX.utils.book_append_sheet(workbook, ws, 'Plantilla presupuesto');

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });
}

module.exports = {
  createWorkbookBuffer,
  createBudgetTemplateWorkbookBuffer,
};