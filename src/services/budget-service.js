const { PYG_LINES } = require('../config/pyg-lines');
const { parseMoney, round2, normalizeText } = require('../utils/number-utils');

const ICA_RATE = 10 / 1000;

const BUDGET_DETAIL_TEMPLATE = [
  { detailKey: 'ingresos_operacionales_servicios', lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', subgroup: 'Ingresos por servicios', order: 1 },
  { detailKey: 'ingresos_operacionales_productos', lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', subgroup: 'Ingresos por productos', order: 2 },
  { detailKey: 'ingresos_operacionales_otros', lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', subgroup: 'Otros ingresos operacionales', order: 3 },
  { detailKey: 'menor_valor_ingreso_descuentos', lineKey: 'menor_valor_ingreso', lineLabel: 'Menor valor del ingreso', subgroup: 'Descuentos comerciales', order: 4 },
  { detailKey: 'costos_directos_materiales', lineKey: 'costos_directos', lineLabel: 'Costo de prestación del servicio / costo de ventas', subgroup: 'Materiales e insumos', order: 5 },
  { detailKey: 'costos_directos_personal', lineKey: 'costos_directos', lineLabel: 'Costo de prestación del servicio / costo de ventas', subgroup: 'Costos de personal', order: 6 },
  { detailKey: 'costos_directos_otros', lineKey: 'costos_directos', lineLabel: 'Costo de prestación del servicio / costo de ventas', subgroup: 'Otros costos directos', order: 7 },
  { detailKey: 'gastos_administrativos_personal', lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administración', subgroup: 'Personal administrativo', order: 8 },
  { detailKey: 'gastos_administrativos_servicios', lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administración', subgroup: 'Servicios administrativos', order: 9 },
  { detailKey: 'gastos_administrativos_depreciacion', lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administración', subgroup: 'Depreciación', order: 10 },
  { detailKey: 'gastos_administrativos_otros', lineKey: 'gastos_administrativos', lineLabel: 'Gastos operacionales de administración', subgroup: 'Otros gastos administrativos', order: 11 },
  { detailKey: 'gastos_ventas_publicidad', lineKey: 'gastos_ventas', lineLabel: 'Gastos operacionales de ventas', subgroup: 'Publicidad y mercadeo', order: 12 },
  { detailKey: 'gastos_ventas_personal', lineKey: 'gastos_ventas', lineLabel: 'Gastos operacionales de ventas', subgroup: 'Personal comercial', order: 13 },
  { detailKey: 'gastos_ventas_otros', lineKey: 'gastos_ventas', lineLabel: 'Gastos operacionales de ventas', subgroup: 'Otros gastos de ventas', order: 14 },
  { detailKey: 'otros_ingresos_recuperaciones', lineKey: 'otros_ingresos', lineLabel: 'Otros ingresos', subgroup: 'Recuperaciones y reintegros', order: 15 },
  { detailKey: 'otros_ingresos_otros', lineKey: 'otros_ingresos', lineLabel: 'Otros ingresos', subgroup: 'Otros ingresos no operacionales', order: 16 },
  { detailKey: 'gastos_financieros_intereses', lineKey: 'gastos_financieros', lineLabel: 'Gastos financieros', subgroup: 'Intereses', order: 17 },
  { detailKey: 'gastos_financieros_otros', lineKey: 'gastos_financieros', lineLabel: 'Gastos financieros', subgroup: 'Otros gastos financieros', order: 18 },
  { detailKey: 'otros_gastos_no_operacionales_otros', lineKey: 'otros_gastos_no_operacionales', lineLabel: 'Otros gastos no operacionales', subgroup: 'Otros gastos no operacionales', order: 19 },
  { detailKey: 'impuesto_renta_provision', lineKey: 'impuesto_renta', lineLabel: 'Impuesto de renta', subgroup: 'Provisión impuesto de renta', order: 20 },
];

const LEGACY_DETAIL_BY_LINE = {
  ingresos_operacionales: 'ingresos_operacionales_otros',
  menor_valor_ingreso: 'menor_valor_ingreso_descuentos',
  costos_directos: 'costos_directos_otros',
  gastos_administrativos: 'gastos_administrativos_otros',
  gastos_ventas: 'gastos_ventas_otros',
  otros_ingresos: 'otros_ingresos_otros',
  gastos_financieros: 'gastos_financieros_otros',
  otros_gastos_no_operacionales: 'otros_gastos_no_operacionales_otros',
  impuesto_renta: 'impuesto_renta_provision',
};

function buildBudgetTemplate() {
  return BUDGET_DETAIL_TEMPLATE.map((item) => ({
    detailKey: item.detailKey,
    lineKey: item.lineKey,
    lineLabel: item.lineLabel,
    subgroup: item.subgroup,
    budget: 0,
    comment: '',
  }));
}

function buildBudgetStandardTable(detailRows = []) {
  const totals = new Map();
  detailRows.forEach((row) => {
    const key = String(row.lineKey || '').trim();
    if (!key) return;
    totals.set(key, round2((totals.get(key) || 0) + parseMoney(row.budget)));
  });

  const byKey = Object.fromEntries(Array.from(totals.entries()));
  byKey.ingresos_operacionales_netos = round2((byKey.ingresos_operacionales || 0) - (byKey.menor_valor_ingreso || 0));
  byKey.utilidad_bruta = round2((byKey.ingresos_operacionales_netos || 0) - (byKey.costos_directos || 0));
  byKey.utilidad_operacional = round2((byKey.utilidad_bruta || 0) - (byKey.gastos_administrativos || 0) - (byKey.gastos_ventas || 0));
  byKey.utilidad_antes_impuestos = round2((byKey.utilidad_operacional || 0) + (byKey.otros_ingresos || 0) - (byKey.gastos_financieros || 0) - (byKey.otros_gastos_no_operacionales || 0));
  byKey.utilidad_neta = round2((byKey.utilidad_antes_impuestos || 0) - (byKey.impuesto_renta || 0));

  return PYG_LINES
    .filter((line) => !['ica_estimado_gerencial', 'utilidad_gerencial_ajustada'].includes(line.key))
    .map((line) => ({
      lineKey: line.key,
      lineLabel: line.label,
      budget: round2(byKey[line.key] || 0),
      value: round2(byKey[line.key] || 0),
      comment: '',
    }));
}

function buildBudgetGerencialTable(contableTable = []) {
  const totals = Object.fromEntries((contableTable || []).map((row) => [row.lineKey, round2(parseMoney(row.budget ?? row.value))]));
  const ica = round2(((totals.ingresos_operacionales || 0) + (totals.otros_ingresos || 0)) * ICA_RATE);
  const adjusted = round2((totals.utilidad_antes_impuestos || 0) - ica);

  const baseRows = PYG_LINES
    .filter((line) => !['ica_estimado_gerencial', 'utilidad_gerencial_ajustada'].includes(line.key))
    .map((line) => ({
      lineKey: line.key,
      lineLabel: line.label,
      budget: round2(totals[line.key] || 0),
      value: round2(totals[line.key] || 0),
      comment: '',
    }));

  baseRows.push(
    { lineKey: 'ica_estimado_gerencial', lineLabel: 'ICA estimado gerencial', budget: ica, value: ica, comment: '' },
    { lineKey: 'utilidad_gerencial_ajustada', lineLabel: 'Utilidad gerencial ajustada', budget: adjusted, value: adjusted, comment: '' }
  );

  return baseRows;
}

function buildBudgetDetailedTable(detailRows = [], includeIca = false) {
  const rows = (detailRows || []).map((row) => ({
    sectionKey: row.lineKey,
    sectionLabel: row.lineLabel,
    subgroup: row.subgroup,
    value: round2(parseMoney(row.budget)),
    accountCount: 1,
  }));

  if (includeIca) {
    const standard = buildBudgetStandardTable(detailRows);
    const gerencial = buildBudgetGerencialTable(standard);
    rows.push({
      sectionKey: 'ajuste_gerencial',
      sectionLabel: 'Ajustes gerenciales',
      subgroup: 'ICA estimado presupuestado',
      value: round2(gerencial.find((row) => row.lineKey === 'ica_estimado_gerencial')?.budget || 0),
      accountCount: 1,
    });
  }

  return rows.filter((row) => row.value || row.subgroup === 'Depreciación');
}

function buildBudgetNotes() {
  return [
    'La depreciación se maneja como subgrupo gerencial dentro de Gastos operacionales de administración.',
    'El ICA presupuestado se calcula como 1% sobre ingresos operacionales presupuestados más otros ingresos presupuestados.',
    'Estos ajustes alimentan la utilidad gerencial ajustada presupuestada.',
  ];
}

function findTemplateByValue(rawValue) {
  const text = normalizeText(rawValue);
  return BUDGET_DETAIL_TEMPLATE.find((item) => {
    return [item.lineLabel, item.lineKey, item.subgroup, `${item.lineLabel} ${item.subgroup}`].some((candidate) => normalizeText(candidate) === text);
  });
}

function normalizeBudgetInput(items = []) {
  const templateMap = new Map(buildBudgetTemplate().map((row) => [row.detailKey, row]));

  items.forEach((item) => {
    const detailKey = String(item.detailKey || '').trim();
    const rawLineKey = String(item.lineKey || '').trim();
    const resolvedDetailKey = detailKey && templateMap.has(detailKey)
      ? detailKey
      : (rawLineKey && LEGACY_DETAIL_BY_LINE[rawLineKey]) || '';

    if (!resolvedDetailKey || !templateMap.has(resolvedDetailKey)) {
      return;
    }

    const base = templateMap.get(resolvedDetailKey);
    templateMap.set(resolvedDetailKey, {
      ...base,
      budget: round2(parseMoney(item.budget)),
      comment: String(item.comment || '').trim(),
    });
  });

  return Array.from(templateMap.values()).sort((a, b) => {
    const left = BUDGET_DETAIL_TEMPLATE.find((item) => item.detailKey === a.detailKey)?.order || 999;
    const right = BUDGET_DETAIL_TEMPLATE.find((item) => item.detailKey === b.detailKey)?.order || 999;
    return left - right;
  });
}

function parseBudgetRowsFromFile(rows, mapping) {
  const lineField = mapping.line || 'Linea';
  const budgetField = mapping.budget || 'Presupuesto';
  const commentField = mapping.comment || '';

  const parsed = rows
    .map((row) => {
      const lineText = String(row[lineField] || '').trim();
      if (!lineText) return null;

      const template = findTemplateByValue(lineText);
      if (template) {
        return {
          detailKey: template.detailKey,
          lineKey: template.lineKey,
          budget: round2(parseMoney(row[budgetField])),
          comment: commentField ? String(row[commentField] || '').trim() : '',
        };
      }

      const normalizedLine = normalizeText(lineText);
      const line = PYG_LINES.find((item) => normalizeText(item.label) === normalizedLine || normalizeText(item.key) === normalizedLine);
      if (!line || !LEGACY_DETAIL_BY_LINE[line.key]) {
        return null;
      }

      return {
        detailKey: LEGACY_DETAIL_BY_LINE[line.key],
        lineKey: line.key,
        budget: round2(parseMoney(row[budgetField])),
        comment: commentField ? String(row[commentField] || '').trim() : '',
      };
    })
    .filter(Boolean);

  return normalizeBudgetInput(parsed);
}

function buildBudgetDataset(items = [], sourceFileName = null) {
  const rows = normalizeBudgetInput(items);
  const contableStandard = buildBudgetStandardTable(rows);
  const gerencialStandard = buildBudgetGerencialTable(contableStandard);
  const detailContable = buildBudgetDetailedTable(rows, false);
  const detailGerencial = buildBudgetDetailedTable(rows, true);

  return {
    rows,
    sourceFileName,
    generatedAt: new Date().toISOString(),
    notes: buildBudgetNotes(),
    assumptions: buildBudgetNotes(),
    contable: {
      standardTable: contableStandard,
      pygTable: contableStandard,
      detailedTable: detailContable,
    },
    gerencial: {
      standardTable: gerencialStandard,
      pygTable: gerencialStandard,
      detailedTable: detailGerencial,
    },
  };
}

function toBudgetMap(budgetRows = []) {
  const map = new Map();
  budgetRows.forEach((row) => {
    map.set(row.lineKey, round2(parseMoney(row.budget)));
  });
  return map;
}

module.exports = {
  buildBudgetTemplate,
  buildBudgetDataset,
  normalizeBudgetInput,
  parseBudgetRowsFromFile,
  toBudgetMap,
};
