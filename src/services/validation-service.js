const { parseMoney, normalizeText } = require('../utils/number-utils');

function validateExecutionRows(rows, mapping) {
  const errors = [];
  const warnings = [];

  if (!mapping.account || !mapping.accountName) {
    errors.push('Debes mapear al menos cuenta y nombre cuenta.');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push('No hay filas para procesar.');
    return { errors, warnings };
  }

  const required = [mapping.account, mapping.accountName].filter(Boolean);
  for (const column of required) {
    const hasColumn = rows.some((row) => Object.prototype.hasOwnProperty.call(row, column));
    if (!hasColumn) {
      errors.push(`No se encontro la columna requerida: ${column}`);
    }
  }

  const nonEmptyRows = rows.filter((row) => {
    const acc = String(row[mapping.account] || '').trim();
    const name = String(row[mapping.accountName] || '').trim();
    return acc || name;
  });

  if (!nonEmptyRows.length) {
    errors.push('Todas las filas estan vacias en cuenta/nombre cuenta.');
  }

  const duplicates = new Map();
  nonEmptyRows.forEach((row) => {
    const key = `${String(row[mapping.account] || '').trim()}|${String(row[mapping.accountName] || '').trim()}`;
    duplicates.set(key, (duplicates.get(key) || 0) + 1);
  });

  const duplicatedCount = Array.from(duplicates.values()).filter((count) => count > 1).length;
  if (duplicatedCount > 0) {
    warnings.push(`Se detectaron ${duplicatedCount} cuentas duplicadas.`);
  }

  const amountField = mapping.balance || '';
  if (amountField) {
    const nonNumeric = nonEmptyRows.filter((row) => {
      const value = row[amountField];
      return String(value || '').trim() && Number.isNaN(parseMoney(value));
    }).length;

    if (nonNumeric > 0) {
      warnings.push(`Hay ${nonNumeric} filas con valores no numericos en la columna de saldo.`);
    }
  }

  const hasIncomePositive = nonEmptyRows.some((row) => {
    const account = String(row[mapping.account] || '').trim();
    const amount = parseMoney(row[mapping.balance] || 0);
    return account.startsWith('4') && amount > 0;
  });

  if (hasIncomePositive) {
    warnings.push('Se detectaron ingresos en signo positivo en la base original; se normalizaran para P&G.');
  }

  return { errors, warnings };
}

function validateBudgetRows(rows) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push('El presupuesto no tiene filas.');
    return { errors, warnings };
  }

  const withoutLine = rows.filter((row) => !String(row.lineKey || '').trim()).length;
  if (withoutLine > 0) {
    errors.push(`Hay ${withoutLine} filas de presupuesto sin linea P&G.`);
  }

  const invalidBudget = rows.filter((row) => Number.isNaN(parseMoney(row.budget))).length;
  if (invalidBudget > 0) {
    errors.push(`Hay ${invalidBudget} filas con presupuesto invalido.`);
  }

  return { errors, warnings };
}

function buildExecutionPreviewSummary({ rows, mapping, headers, validation, tempExecution, conflict, companyName, month, fileName }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const emptyRows = safeRows.filter((row) => {
    const acc = String(row[mapping.account] || '').trim();
    const name = String(row[mapping.accountName] || '').trim();
    return !acc && !name;
  }).length;

  const duplicateMap = new Map();
  safeRows.forEach((row) => {
    const key = `${String(row[mapping.account] || '').trim()}|${String(row[mapping.accountName] || '').trim()}`;
    if (key === '|') return;
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  });

  const duplicateCount = Array.from(duplicateMap.values()).filter((n) => n > 1).length;
  const unclassified = (tempExecution?.baseRows || []).filter((row) => row.sectionKey === 'no_clasificado');
  const suspiciousSignCount = (tempExecution?.baseRows || []).filter((row) => row.account.startsWith('4') && row.rawAmount > 0).length;

  return {
    destination: {
      companyName,
      month,
      dataType: 'ejecucion',
    },
    fileName,
    columnsDetected: headers || [],
    mappingApplied: mapping,
    totalRows: safeRows.length,
    emptyRows,
    duplicateCount,
    unclassifiedCount: unclassified.length,
    unclassifiedSample: unclassified.slice(0, 5).map((row) => `${row.account} ${row.accountName}`),
    suspiciousSignCount,
    conflict,
    rowsProcessed: tempExecution?.baseRows?.length || 0,
    warnings: validation.warnings || [],
    errors: validation.errors || [],
  };
}

function buildBudgetPreviewSummary({ rows, mapping, headers, validation, parsedRows, conflict, companyName, month, fileName }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const lineField = mapping.line || 'Linea';
  const emptyRows = safeRows.filter((row) => !String(row[lineField] || '').trim()).length;

  const duplicates = new Map();
  parsedRows.forEach((row) => {
    const key = String(row.lineKey || '').trim();
    if (!key) return;
    duplicates.set(key, (duplicates.get(key) || 0) + 1);
  });

  const duplicateCount = Array.from(duplicates.values()).filter((n) => n > 1).length;

  return {
    destination: {
      companyName,
      month,
      dataType: 'presupuesto',
    },
    fileName,
    columnsDetected: headers || [],
    mappingApplied: mapping,
    totalRows: safeRows.length,
    emptyRows,
    duplicateCount,
    rowsProcessed: parsedRows.length,
    conflict,
    warnings: validation.warnings || [],
    errors: validation.errors || [],
  };
}

function buildDataQualityAlerts({ comparisonRows, mappingRows }) {
  const alerts = [];

  const withoutBudget = comparisonRows.filter((row) => row.budget === null).map((row) => row.lineLabel);
  if (withoutBudget.length) {
    alerts.push(`Lineas sin presupuesto: ${withoutBudget.join(', ')}.`);
  }

  const budgetZeroRealMaterial = comparisonRows.filter(
    (row) => (row.budget || 0) === 0 && Math.abs(row.real || 0) > 0
  );
  if (budgetZeroRealMaterial.length) {
    alerts.push(
      `Lineas con presupuesto cero y ejecucion material: ${budgetZeroRealMaterial
        .map((row) => row.lineLabel)
        .join(', ')}.`
    );
  }

  const unclassified = mappingRows.filter((row) => row.sectionKey === 'no_clasificado');
  if (unclassified.length) {
    alerts.push(`Cuentas sin clasificacion PUC base: ${unclassified.length}.`);
  }

  const suspicious = mappingRows.filter((row) => /posible cuenta de balance|partida no recurrente|extraordinaria/i.test(normalizeText(row.alertsText)));
  if (suspicious.length) {
    alerts.push(`Cuentas con alertas contables: ${suspicious.length}.`);
  }

  return alerts;
}

module.exports = {
  validateExecutionRows,
  validateBudgetRows,
  buildExecutionPreviewSummary,
  buildBudgetPreviewSummary,
  buildDataQualityAlerts,
};
