const {
  PUC_SECTIONS,
  FINANCIAL_PREFIXES,
  NON_OPERATIONAL_PREFIXES,
  ALERT_PATTERNS,
  INCOME_TAX_PATTERNS,
  DISCOUNT_PATTERNS,
} = require('../config/puc-rules');
const { parseMoney, normalizeText, round2 } = require('../utils/number-utils');

const ICA_RATE = 10 / 1000;

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

function matchesAny(patterns, code, name) {
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(name) || pattern.test(code);
    }
    return false;
  });
}

function inferSection(accountCode, accountName) {
  const code = String(accountCode || '').trim();
  const name = normalizeText(accountName);

  if (code === '516025') {
    return {
      sectionKey: 'gastos_administrativos',
      sectionLabel: 'Gastos operacionales de administración',
      standardLineKey: 'gastos_administrativos',
      observation: 'La cuenta 516025 fue interpretada gerencialmente como depreciación.',
    };
  }

  if (!name) {
    return {
      sectionKey: 'no_clasificado',
      sectionLabel: 'No clasificado',
      standardLineKey: null,
      observation: 'Cuenta sin descripción.',
    };
  }

  if (matchesAny(DISCOUNT_PATTERNS, code, name)) {
    return {
      sectionKey: 'menor_valor_ingreso',
      sectionLabel: 'Menor valor del ingreso',
      standardLineKey: 'menor_valor_ingreso',
      observation: 'Descuento comercial tratado como menor valor del ingreso.',
    };
  }

  if (matchesAny(INCOME_TAX_PATTERNS, code, name)) {
    return {
      sectionKey: 'impuesto_renta',
      sectionLabel: 'Impuesto de renta',
      standardLineKey: 'impuesto_renta',
      observation: '',
    };
  }

  for (const [sectionKey, def] of Object.entries(PUC_SECTIONS)) {
    if (def.prefixes.some((prefix) => code.startsWith(prefix))) {
      return {
        sectionKey,
        sectionLabel: def.label,
        standardLineKey: sectionToPygLine(sectionKey),
        observation: '',
      };
    }
  }

  if (NON_OPERATIONAL_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    const isFinancial = FINANCIAL_PREFIXES.some((prefix) => code.startsWith(prefix)) || /(interes|financier|comision|banco|tesorer|gmf)/.test(name);
    if (isFinancial) {
      return {
        sectionKey: 'gastos_financieros',
        sectionLabel: 'Gastos financieros',
        standardLineKey: 'gastos_financieros',
        observation: '',
      };
    }

    return {
      sectionKey: 'otros_gastos_no_operacionales',
      sectionLabel: 'Otros gastos no operacionales',
      standardLineKey: 'otros_gastos_no_operacionales',
      observation: '',
    };
  }

  return {
    sectionKey: 'no_clasificado',
    sectionLabel: 'No clasificado',
    standardLineKey: null,
    observation: 'No se identificó clasificación PUC clara para esta cuenta.',
  };
}

function sectionToPygLine(sectionKey) {
  const map = {
    ingresos_operacionales: 'ingresos_operacionales',
    menor_valor_ingreso: 'menor_valor_ingreso',
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

function inferSubgroup(sectionKey, accountName, accountCode) {
  const name = normalizeText(accountName);
  const code = String(accountCode || '').trim();

  if (code === '516025') {
    return 'Depreciación';
  }

  if (!name) {
    return 'Sin descripción';
  }

  if (sectionKey === 'ingresos_operacionales' || sectionKey === 'menor_valor_ingreso') {
    if (sectionKey === 'menor_valor_ingreso' || /descuento comercial|rebaja comercial|devolucion en ventas/.test(name)) return 'Descuentos comerciales';
    if (/producto|mercancia|inventario/.test(name)) return 'Ingresos por venta de productos';
    if (/servicio|prestacion|cirugia|consulta|honorario|procedimiento/.test(name)) return 'Ingresos por servicios';
    if (/interes/.test(name)) return 'Ingresos financieros operativos';
    return 'Otros ingresos operacionales';
  }

  if (sectionKey === 'costos_directos') {
    if (/nomina|sueldo|salario|hora extra|prestacion|seguridad social|parafiscal/.test(name)) return 'Costos de personal';
    if (/material|insumo|suministro|medicamento|repuesto/.test(name)) return 'Materiales e insumos';
    if (/publicidad|mercadeo|promocion/.test(name)) return 'Publicidad en costo';
    if (/arrendamiento|aseo|vigilancia|transporte|flete/.test(name)) return 'Servicios operativos';
    return 'Otros costos directos';
  }

  if (sectionKey === 'gastos_administrativos') {
    if (/nomina|sueldo|salario|prestacion|seguridad social/.test(name)) return 'Personal administrativo';
    if (/honorario|asesoria|consultoria/.test(name)) return 'Honorarios y asesorías';
    if (/arrendamiento|arriendo/.test(name)) return 'Arrendamientos';
    if (/servicio publico|energia|agua|telefono|internet/.test(name)) return 'Servicios administrativos';
    if (/impuesto|gmf|gravamen|tasa|contribucion|estampilla|iva/.test(name) || code.startsWith('5115')) return 'Impuestos y tasas';
    if (/depreciaci|amortizaci/.test(name) || code === '516025') return 'Depreciación';
    return 'Otros gastos administrativos';
  }

  if (sectionKey === 'gastos_ventas') {
    if (/publicidad|mercadeo|promocion/.test(name)) return 'Publicidad y mercadeo';
    if (/comision/.test(name)) return 'Comisiones comerciales';
    if (/nomina|sueldo|salario|prestacion/.test(name)) return 'Personal comercial';
    if (/flete|transporte|distribucion/.test(name)) return 'Distribución y transporte';
    return 'Otros gastos de ventas';
  }

  if (sectionKey === 'gastos_financieros') {
    if (/interes/.test(name)) return 'Intereses';
    if (/comision|banco/.test(name)) return 'Comisiones bancarias';
    if (/gmf|gravamen/.test(name)) return 'Gravamen financiero';
    return 'Otros gastos financieros';
  }

  if (sectionKey === 'otros_ingresos') {
    if (/descuento comercial/.test(name)) return 'Descuentos comerciales';
    if (/reintegro|recuperacion/.test(name)) return 'Recuperaciones y reintegros';
    if (/venta de activo|utilidad en venta/.test(name)) return 'Venta de activos';
    return 'Otros ingresos no operacionales';
  }

  if (sectionKey === 'otros_gastos_no_operacionales') {
    if (/perdida en venta|venta de activo/.test(name)) return 'Pérdida en venta de activos';
    if (/multa|sancion/.test(name)) return 'Multas y sanciones';
    return 'Otros gastos no operacionales';
  }

  if (sectionKey === 'impuesto_renta') {
    return 'Impuesto de renta';
  }

  return 'Sin clasificar';
}

function buildAlerts(accountName) {
  const name = String(accountName || '');
  return ALERT_PATTERNS.filter((rule) => rule.pattern.test(name)).map((rule) => rule.message);
}

function inferManagerialTreatment(row) {
  const name = normalizeText(row.accountName);
  const code = String(row.account || '').trim();

  if (code === '516025') {
    return {
      action: 'managerial_interpretation',
      reason: 'La cuenta 516025 fue interpretada gerencialmente como depreciación.',
      category: 'interpretacion_gerencial',
    };
  }

  if (/iva descontable|iva recuperable/.test(name)) {
    return {
      action: 'exclude_from_gerencial',
      reason: 'IVA descontable/recuperable identificado en resultado.',
      category: 'exclusion_sugerida',
    };
  }

  if (row.sectionKey === 'costos_directos' && /publicidad|mercadeo|promocion/.test(name)) {
    return {
      action: 'review_reclassification',
      reason: 'Publicidad/mercadeo cargado en costo; validar reclasificación a gasto de ventas.',
      category: 'reclasificacion_sugerida',
    };
  }

  return null;
}

function buildEstimatedIcaRow(contableTotals) {
  const base = Number(contableTotals.ingresos_operacionales || 0) + Number(contableTotals.otros_ingresos || 0);
  const managerialValue = round2(base * ICA_RATE);

  return {
    account: 'ICA_ESTIMADO',
    accountName: 'ICA ESTIMADO GERENCIAL',
    rawAmount: 0,
    valuePyg: 0,
    managerialValue,
    sectionKey: 'ajuste_gerencial',
    sectionLabel: 'Ajustes gerenciales',
    standardLineKey: null,
    pygLineKey: null,
    subgroup: 'ICA estimado gerencial',
    alerts: [],
    alertsText: '',
    observation: 'El ICA fue estimado como 1% sobre la suma de ingresos operacionales y otros ingresos, según regla gerencial definida por el usuario.',
    managerialTreatment: {
      action: 'estimated_ica',
      reason: 'El ICA fue estimado como 1% sobre la suma de ingresos operacionales y otros ingresos, según regla gerencial definida por el usuario.',
      category: 'ajuste_gerencial',
    },
  };
}

function consolidateLineTotals(mappingRows, managerialMode = false) {
  const totals = {
    ingresos_operacionales: 0,
    menor_valor_ingreso: 0,
    ingresos_operacionales_netos: 0,
    costos_directos: 0,
    utilidad_bruta: 0,
    gastos_administrativos: 0,
    gastos_ventas: 0,
    utilidad_operacional: 0,
    otros_ingresos: 0,
    gastos_financieros: 0,
    otros_gastos_no_operacionales: 0,
    utilidad_antes_impuestos: 0,
    impuesto_renta: 0,
    utilidad_neta: 0,
    ica_estimado_gerencial: 0,
    utilidad_gerencial_ajustada: 0,
  };

  mappingRows.forEach((row) => {
    const targetValue = managerialMode ? row.managerialValue : row.valuePyg;
    if (row.standardLineKey && row.standardLineKey in totals) {
      totals[row.standardLineKey] += targetValue;
    }

    if (managerialMode && row.managerialTreatment?.action === 'estimated_ica') {
      totals.ica_estimado_gerencial += Number(row.managerialValue || 0);
    }
  });

  totals.ingresos_operacionales_netos = totals.ingresos_operacionales - totals.menor_valor_ingreso;
  totals.utilidad_bruta = totals.ingresos_operacionales_netos - totals.costos_directos;
  totals.utilidad_operacional = totals.utilidad_bruta - totals.gastos_administrativos - totals.gastos_ventas;
  totals.utilidad_antes_impuestos = totals.utilidad_operacional + totals.otros_ingresos - totals.gastos_financieros - totals.otros_gastos_no_operacionales;
  totals.utilidad_neta = totals.utilidad_antes_impuestos - totals.impuesto_renta;
  totals.utilidad_gerencial_ajustada = managerialMode
    ? totals.utilidad_antes_impuestos - totals.ica_estimado_gerencial
    : totals.utilidad_antes_impuestos;

  Object.keys(totals).forEach((key) => {
    totals[key] = round2(totals[key]);
  });

  return totals;
}

function buildPygTable(totals, metadata = {}, options = {}) {
  const netIncomeLabel = metadata.hasIncomeTax
    ? 'Utilidad neta'
    : 'Utilidad neta (equivale a utilidad antes de impuestos)';

  const rows = [
    { lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', value: totals.ingresos_operacionales },
    { lineKey: 'menor_valor_ingreso', lineLabel: 'Menor valor del ingreso', value: totals.menor_valor_ingreso },
    { lineKey: 'ingresos_operacionales_netos', lineLabel: 'Ingresos operacionales netos', value: totals.ingresos_operacionales_netos },
    { lineKey: 'costos_directos', lineLabel: 'Costo de prestación del servicio / costo de ventas', value: totals.costos_directos },
    { lineKey: 'utilidad_bruta', lineLabel: 'Utilidad bruta', value: totals.utilidad_bruta },
    { lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administración', value: totals.gastos_administrativos },
    { lineKey: 'gastos_ventas', lineLabel: 'Gastos operacionales de ventas', value: totals.gastos_ventas },
    { lineKey: 'utilidad_operacional', lineLabel: 'Utilidad operacional', value: totals.utilidad_operacional },
    { lineKey: 'otros_ingresos', lineLabel: 'Otros ingresos', value: totals.otros_ingresos },
    { lineKey: 'gastos_financieros', lineLabel: 'Gastos financieros', value: totals.gastos_financieros },
    { lineKey: 'otros_gastos_no_operacionales', lineLabel: 'Otros gastos no operacionales', value: totals.otros_gastos_no_operacionales },
    { lineKey: 'utilidad_antes_impuestos', lineLabel: 'Utilidad antes de impuestos', value: totals.utilidad_antes_impuestos },
    { lineKey: 'impuesto_renta', lineLabel: 'Impuesto de renta', value: totals.impuesto_renta },
    { lineKey: 'utilidad_neta', lineLabel: netIncomeLabel, value: totals.utilidad_neta },
  ];

  if (options.managerialMode) {
    rows.push(
      { lineKey: 'ica_estimado_gerencial', lineLabel: 'ICA estimado gerencial', value: totals.ica_estimado_gerencial },
      { lineKey: 'utilidad_gerencial_ajustada', lineLabel: 'Utilidad gerencial ajustada', value: totals.utilidad_gerencial_ajustada }
    );
  }

  return rows;
}

function buildDetailedTable(mappingRows, valueField) {
  const groups = new Map();
  mappingRows.forEach((row) => {
    const value = Number(row[valueField] || 0);
    if (!value) return;
    if (!row.standardLineKey && row.sectionKey !== 'ajuste_gerencial') return;

    const key = row.sectionLabel + '|' + row.subgroup;
    const current = groups.get(key) || {
      sectionKey: row.sectionKey,
      sectionLabel: row.sectionLabel,
      subgroup: row.subgroup,
      value: 0,
      accountCount: 0,
    };
    current.value += value;
    current.accountCount += 1;
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      value: round2(item.value),
    }))
    .sort((a, b) => {
      if (a.sectionLabel !== b.sectionLabel) {
        return a.sectionLabel.localeCompare(b.sectionLabel, 'es');
      }
      return Math.abs(b.value) - Math.abs(a.value);
    });
}

function buildAutomaticNotes(mappingRows, metadata, icaEstimatedValue) {
  const exclusionsSuggested = [];
  const reclassificationsSuggested = [];
  const qualityWarnings = [];
  const missingDescriptions = [];
  const technicalNotes = [];

  mappingRows.forEach((row) => {
    if (!row.accountName) {
      missingDescriptions.push(`Cuenta ${row.account} sin descripción.`);
    }

    if (row.managerialTreatment?.category === 'exclusion_sugerida') {
      exclusionsSuggested.push(`${row.account} ${row.accountName}: ${row.managerialTreatment.reason}`);
    }

    if (row.managerialTreatment?.category === 'reclasificacion_sugerida') {
      reclassificationsSuggested.push(`${row.account} ${row.accountName}: ${row.managerialTreatment.reason}`);
    }

    if (row.observation) {
      qualityWarnings.push(`${row.account} ${row.accountName}: ${row.observation}`.trim());
    }

    if (row.alerts && row.alerts.length) {
      row.alerts.forEach((alert) => {
        qualityWarnings.push(`${row.account} ${row.accountName}: ${alert}`.trim());
      });
    }

    if (row.account === '516025') {
      technicalNotes.push('La cuenta 516025 fue interpretada gerencialmente como depreciación.');
    }
  });

  if (metadata.discountRowsCount > 0) {
    technicalNotes.push(`Se detectaron ${metadata.discountRowsCount} cuentas tratadas como menor valor del ingreso.`);
  }

  if (!metadata.hasIncomeTax) {
    technicalNotes.push('No se identificó impuesto de renta en la base. El resultado corresponde a utilidad antes de impuestos.');
  }

  if (metadata.duplicateAccountsCount > 0) {
    qualityWarnings.push(`Se detectaron ${metadata.duplicateAccountsCount} cuentas duplicadas en la base.`);
  }

  if (metadata.unclassifiedCount > 0) {
    qualityWarnings.push(`Se detectaron ${metadata.unclassifiedCount} cuentas sin mapeo claro al P&G.`);
  }

  if (metadata.incomeRawPositiveCount > 0) {
    technicalNotes.push(`Se detectaron ${metadata.incomeRawPositiveCount} ingresos con signo positivo en la base. Se normalizaron a positivo para presentación.`);
  }

  if (icaEstimatedValue > 0) {
    technicalNotes.push('El ICA fue estimado como 1% sobre la suma de ingresos operacionales y otros ingresos, según regla gerencial definida por el usuario.');
  }

  return {
    exclusionsSuggested: Array.from(new Set(exclusionsSuggested)),
    reclassificationsSuggested: Array.from(new Set(reclassificationsSuggested)),
    qualityWarnings: Array.from(new Set(qualityWarnings)),
    missingDescriptions: Array.from(new Set(missingDescriptions)),
    technicalNotes: Array.from(new Set(technicalNotes)),
  };
}

function buildManagerialAdjustments(mappingRows) {
  return mappingRows
    .filter((row) => row.managerialTreatment && (row.valuePyg !== row.managerialValue || row.managerialTreatment.action === 'estimated_ica'))
    .map((row) => ({
      account: row.account,
      accountName: row.accountName,
      sectionLabel: row.sectionLabel,
      subgroup: row.subgroup,
      action: row.managerialTreatment.action,
      category: row.managerialTreatment.category,
      reason: row.managerialTreatment.reason,
      excludedValue: row.managerialTreatment.action === 'estimated_ica'
        ? round2(row.managerialValue)
        : round2(row.valuePyg - row.managerialValue),
      valuePyg: row.valuePyg,
      managerialValue: row.managerialValue,
    }));
}

function summarizeIntegrity(mappingRows) {
  const duplicateCounter = new Map();
  mappingRows.forEach((row) => {
    const key = `${row.account}|${row.accountName}`;
    duplicateCounter.set(key, (duplicateCounter.get(key) || 0) + 1);
  });

  const duplicateAccountsCount = Array.from(duplicateCounter.values()).filter((count) => count > 1).length;
  const unclassifiedCount = mappingRows.filter((row) => row.sectionKey === 'no_clasificado').length;
  const withoutDescriptionCount = mappingRows.filter((row) => !row.accountName).length;
  const incomeRawNegativeCount = mappingRows.filter((row) => row.account.startsWith('4') && row.rawAmount < 0).length;
  const incomeRawPositiveCount = mappingRows.filter((row) => row.account.startsWith('4') && row.rawAmount > 0).length;
  const discountRowsCount = mappingRows.filter((row) => row.sectionKey === 'menor_valor_ingreso').length;
  const hasIncomeTax = mappingRows.some((row) => row.sectionKey === 'impuesto_renta' && row.valuePyg > 0);
  const has516025Interpretation = mappingRows.some((row) => row.account === '516025');

  return {
    duplicateAccountsCount,
    unclassifiedCount,
    withoutDescriptionCount,
    incomeRawNegativeCount,
    incomeRawPositiveCount,
    discountRowsCount,
    hasIncomeTax,
    has516025Interpretation,
  };
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

      const rawAmount = round2(extractAmount(row, mapping, inferredAmountField));
      const classification = inferSection(account, accountName);
      const subgroup = inferSubgroup(classification.sectionKey, accountName, account);
      const valuePyg = classification.standardLineKey ? round2(Math.abs(rawAmount)) : 0;
      const alerts = buildAlerts(accountName);
      const managerialTreatment = inferManagerialTreatment({ account, accountName, sectionKey: classification.sectionKey });
      const managerialValue = managerialTreatment?.action === 'exclude_from_gerencial' ? 0 : valuePyg;
      const observation = Array.from(new Set([classification.observation, managerialTreatment?.action === 'estimated_ica' ? '' : managerialTreatment?.reason || ''].filter(Boolean))).join(' ');

      return {
        account,
        accountName,
        rawAmount,
        valuePyg,
        managerialValue: round2(managerialValue),
        sectionKey: classification.sectionKey,
        sectionLabel: classification.sectionLabel,
        standardLineKey: classification.standardLineKey,
        pygLineKey: classification.standardLineKey,
        subgroup,
        alerts,
        alertsText: alerts.join(' '),
        observation,
        managerialTreatment,
      };
    })
    .filter(Boolean);

  const metadata = summarizeIntegrity(normalizedRows);
  const contableTotals = consolidateLineTotals(normalizedRows, false);
  const estimatedIcaRow = buildEstimatedIcaRow(contableTotals);
  const managerialRows = [...normalizedRows, estimatedIcaRow];
  const gerencialTotals = consolidateLineTotals(managerialRows, true);
  const automaticNotes = buildAutomaticNotes(managerialRows, metadata, gerencialTotals.ica_estimado_gerencial);
  const managerialAdjustments = buildManagerialAdjustments(managerialRows);

  const contableDetailed = buildDetailedTable(normalizedRows, 'valuePyg');
  const gerencialDetailed = buildDetailedTable(managerialRows, 'managerialValue');

  return {
    sourceFileName,
    generatedAt: new Date().toISOString(),
    mapping: {
      ...mapping,
      inferredAmountField,
    },
    baseRows: normalizedRows,
    summary: {
      incomeRawNegativeCount: metadata.incomeRawNegativeCount,
      incomeRawPositiveCount: metadata.incomeRawPositiveCount,
      unclassifiedCount: metadata.unclassifiedCount,
      alertedAccounts: normalizedRows.filter((row) => row.alerts.length > 0).length,
      discountRowsCount: metadata.discountRowsCount,
      duplicateAccountsCount: metadata.duplicateAccountsCount,
      withoutDescriptionCount: metadata.withoutDescriptionCount,
      managerialAdjustmentsCount: managerialAdjustments.length,
      icaEstimatedValue: gerencialTotals.ica_estimado_gerencial,
    },
    metadata,
    automaticNotes,
    managerialAdjustments,
    accountMapping: normalizedRows.map((row) => ({
      account: row.account,
      accountName: row.accountName,
      saldoOriginal: row.rawAmount,
      valorPyg: row.valuePyg,
      valorGerencial: row.managerialValue,
      seccionPyg: row.sectionLabel,
      subgrupo: row.subgroup,
      observacion: row.observation || row.alertsText || '',
      tratamientoGerencial: row.managerialTreatment?.reason || '',
    })),
    contable: {
      totals: contableTotals,
      pygTable: buildPygTable(contableTotals, metadata),
      standardTable: buildPygTable(contableTotals, metadata),
      detailedTable: contableDetailed,
      mappingRows: normalizedRows,
    },
    gerencial: {
      totals: gerencialTotals,
      pygTable: buildPygTable(gerencialTotals, metadata, { managerialMode: true }),
      standardTable: buildPygTable(gerencialTotals, metadata, { managerialMode: true }),
      detailedTable: gerencialDetailed,
      mappingRows: managerialRows.map((row) => ({
        ...row,
        valuePyg: row.managerialValue,
      })),
    },
  };
}

module.exports = {
  buildExecutionDataset,
};
