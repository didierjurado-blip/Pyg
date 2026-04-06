const { PUC_SECTIONS, FINANCIAL_PREFIXES, NON_OPERATIONAL_PREFIXES, ALERT_PATTERNS } = require('../config/puc-rules');
const { parseMoney, normalizeText, round2 } = require('../utils/number-utils');

function detectAmountField(rows, mapping) {
  const reserved = new Set([mapping.account, mapping.accountName, mapping.balance, mapping.debit, mapping.credit].filter(Boolean));
  const candidates = new Map();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (reserved.has(key)) {
        return;
      }
      const numeric = parseMoney(row[key]);
      if (!numeric && String(row[key] || '').trim() !== '0') {
        return;
      }
      const stats = candidates.get(key) || { hits: 0, totalAbs: 0 };
      stats.hits += 1;
      stats.totalAbs += Math.abs(numeric);
      candidates.set(key, stats);
    });
  });

  const ranked = Array.from(candidates.entries()).sort((a, b) => {
    if (b[1].hits !== a[1].hits) {
      return b[1].hits - a[1].hits;
    }
    return b[1].totalAbs - a[1].totalAbs;
  });

  return ranked.length ? ranked[0][0] : '';
}

function extractAmount(row, mapping, inferredAmountField) {
  const balance = parseMoney(row[mapping.balance]);
  if (balance) {
    return balance;
  }

  const debit = parseMoney(row[mapping.debit]);
  const credit = parseMoney(row[mapping.credit]);
  if (debit || credit) {
    return credit - debit;
  }

  if (inferredAmountField) {
    return parseMoney(row[inferredAmountField]);
  }

  return 0;
}

function classifySection(accountCode, accountName) {
  const code = String(accountCode || '').trim();
  const name = normalizeText(accountName);

  for (const [sectionKey, def] of Object.entries(PUC_SECTIONS)) {
    if (def.prefixes.some((prefix) => code.startsWith(prefix))) {
      return { sectionKey, sectionLabel: def.label };
    }
  }

  if (NON_OPERATIONAL_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    const isFinancial = FINANCIAL_PREFIXES.some((prefix) => code.startsWith(prefix)) || /(interes|financier|comision|banco|tesorer)/.test(name);
    if (isFinancial) {
      return { sectionKey: 'gastos_financieros', sectionLabel: 'Gastos financieros' };
    }

    return { sectionKey: 'otros_gastos_no_operacionales', sectionLabel: 'Otros gastos no operacionales' };
  }

  if (/(impuesto de renta|renta y complementarios|provision de renta)/.test(name)) {
    return { sectionKey: 'impuesto_renta', sectionLabel: 'Impuesto de renta' };
  }

  return { sectionKey: 'no_clasificado', sectionLabel: 'No clasificado' };
}

function sectionToPygLine(sectionKey) {
  const map = {
    ingresos_operacionales: 'ingresos_operacionales',
    costos_directos: 'costos_directos',
    gastos_administrativos: 'gastos_administrativos',
    gastos_ventas: 'gastos_ventas',
    otros_ingresos: 'otros_ingresos',
    gastos_financieros: 'gastos_financieros',
    otros_gastos_no_operacionales: 'otros_gastos_no_operacionales',
    impuesto_renta: 'impuesto_renta',
  };
  return map[sectionKey] || null;
}

function buildAlerts(accountName) {
  const name = String(accountName || '');
  return ALERT_PATTERNS.filter((rule) => rule.pattern.test(name)).map((rule) => rule.message);
}

function consolidateLineTotals(mappingRows) {
  const totals = {
    ingresos_operacionales: 0,
    costos_directos: 0,
    gastos_administrativos: 0,
    gastos_ventas: 0,
    otros_ingresos: 0,
    gastos_financieros: 0,
    otros_gastos_no_operacionales: 0,
    impuesto_renta: 0,
  };

  mappingRows.forEach((row) => {
    if (row.pygLineKey && row.pygLineKey in totals) {
      totals[row.pygLineKey] += row.valuePyg;
    }
  });

  totals.utilidad_bruta = totals.ingresos_operacionales - totals.costos_directos;
  totals.utilidad_operacional = totals.utilidad_bruta - totals.gastos_administrativos - totals.gastos_ventas;
  totals.utilidad_antes_impuestos =
    totals.utilidad_operacional +
    totals.otros_ingresos -
    totals.gastos_financieros -
    totals.otros_gastos_no_operacionales;
  totals.utilidad_neta = totals.utilidad_antes_impuestos - totals.impuesto_renta;

  Object.keys(totals).forEach((key) => {
    totals[key] = round2(totals[key]);
  });

  return totals;
}

function buildPygTable(totals) {
  return [
    { lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', value: totals.ingresos_operacionales },
    { lineKey: 'costos_directos', lineLabel: 'Costos de prestacion del servicio / costo de ventas', value: totals.costos_directos },
    { lineKey: 'utilidad_bruta', lineLabel: 'Utilidad bruta', value: totals.utilidad_bruta },
    { lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administracion', value: totals.gastos_administrativos },
    { lineKey: 'gastos_ventas', lineLabel: 'Gastos operacionales de ventas', value: totals.gastos_ventas },
    { lineKey: 'utilidad_operacional', lineLabel: 'Utilidad operacional', value: totals.utilidad_operacional },
    { lineKey: 'otros_ingresos', lineLabel: 'Otros ingresos', value: totals.otros_ingresos },
    { lineKey: 'gastos_financieros', lineLabel: 'Gastos financieros', value: totals.gastos_financieros },
    {
      lineKey: 'otros_gastos_no_operacionales',
      lineLabel: 'Otros gastos no operacionales',
      value: totals.otros_gastos_no_operacionales,
    },
    { lineKey: 'utilidad_antes_impuestos', lineLabel: 'Utilidad antes de impuestos', value: totals.utilidad_antes_impuestos },
    { lineKey: 'impuesto_renta', lineLabel: 'Impuesto de renta', value: totals.impuesto_renta },
    { lineKey: 'utilidad_neta', lineLabel: 'Utilidad neta', value: totals.utilidad_neta },
  ];
}

function buildExecutionDataset({ rows, mapping, sourceFileName }) {
  const inferredAmountField = mapping.balance || detectAmountField(rows, mapping);

  const normalizedRows = rows
    .map((row) => {
      const account = String(row[mapping.account] || '').trim();
      const accountName = String(row[mapping.accountName] || '').trim();
      if (!account && !accountName) {
        return null;
      }

      const amountRaw = extractAmount(row, mapping, inferredAmountField);
      const classif = classifySection(account, accountName);
      const pygLineKey = sectionToPygLine(classif.sectionKey);
      const valuePyg = pygLineKey ? Math.abs(amountRaw) : 0;
      const alerts = buildAlerts(accountName);

      return {
        account,
        accountName,
        rawAmount: round2(amountRaw),
        valuePyg: round2(valuePyg),
        sectionKey: classif.sectionKey,
        sectionLabel: classif.sectionLabel,
        pygLineKey,
        alerts,
        alertsText: alerts.join(' '),
      };
    })
    .filter(Boolean);

  const contableTotals = consolidateLineTotals(normalizedRows);

  const gerencialRows = normalizedRows.map((row) => {
    const name = normalizeText(row.accountName);
    if (/(iva descontable|iva recuperable|anticipo|activo)/.test(name) && row.sectionKey === 'gastos_administrativos') {
      return {
        ...row,
        valuePyg: 0,
        sectionKey: 'reclasificacion_gerencial',
        sectionLabel: 'Reclasificacion gerencial fuera del P&G',
        pygLineKey: null,
        alerts: [...row.alerts, 'Reclasificada en modelo gerencial.'],
        alertsText: `${row.alertsText} Reclasificada en modelo gerencial.`.trim(),
      };
    }

    return row;
  });

  const gerencialTotals = consolidateLineTotals(gerencialRows);

  const summary = {
    incomeRawNegativeCount: normalizedRows.filter((row) => row.account.startsWith('4') && row.rawAmount < 0).length,
    unclassifiedCount: normalizedRows.filter((row) => row.sectionKey === 'no_clasificado').length,
    alertedAccounts: normalizedRows.filter((row) => row.alerts.length > 0).length,
  };

  return {
    sourceFileName,
    generatedAt: new Date().toISOString(),
    mapping: {
      ...mapping,
      inferredAmountField,
    },
    baseRows: normalizedRows,
    contable: {
      totals: contableTotals,
      pygTable: buildPygTable(contableTotals),
      mappingRows: normalizedRows,
    },
    gerencial: {
      totals: gerencialTotals,
      pygTable: buildPygTable(gerencialTotals),
      mappingRows: gerencialRows,
    },
    summary,
  };
}

module.exports = {
  buildExecutionDataset,
};