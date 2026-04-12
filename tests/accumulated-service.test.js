const { buildAccumulatedDataset } = require('../src/services/accumulated-service');
const { buildDefaultLineSettingsMap } = require('../src/services/line-settings-service');

function minimalMonthExecution(month, value = 1000) {
  const standardTable = [
    { lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', value },
    { lineKey: 'utilidad_antes_impuestos', lineLabel: 'Utilidad antes de impuestos', value: value * 0.1 },
    { lineKey: 'utilidad_gerencial_ajustada', lineLabel: 'Utilidad gerencial ajustada', value: value * 0.12 },
  ];
  const detailedTable = [
    { sectionKey: 'ingresos', sectionLabel: 'Ingresos', subgroup: 'Ventas', value: value * 0.5, accountCount: 2 },
  ];
  return {
    contable: { standardTable, detailedTable },
    gerencial: { standardTable, detailedTable },
    accountMapping: [{ account: '4100', accountName: 'Ventas', saldoOriginal: value, valorPyg: value, valorGerencial: value, seccionPyg: 'Ingresos', subgrupo: 'Ventas' }],
    managerialAdjustments: [],
    automaticNotes: { technicalNotes: [], qualityWarnings: [], exclusionsSuggested: [], reclassificationsSuggested: [], missingDescriptions: [] },
  };
}

describe('buildAccumulatedDataset', () => {
  test('returns YTD meta, executiveSummary and sums multiple months', () => {
    const company = { id: 'c1', name: 'Test Co' };
    const companyData = {
      months: {
        '2026-01': { execution: minimalMonthExecution('2026-01', 1000) },
        '2026-02': { execution: minimalMonthExecution('2026-02', 500) },
      },
      lineSettings: buildDefaultLineSettingsMap(),
    };

    const dataset = buildAccumulatedDataset({
      company,
      companyData,
      cutoffMonth: '2026-02',
      includeBudget: false,
    });

    expect(dataset.meta.schema).toBe('accumulated_ytd_v1');
    expect(dataset.meta.consolidationReady).toBe(true);
    expect(dataset.period.monthsIncluded).toEqual(['2026-01', '2026-02']);
    expect(dataset.summary.totalMonths).toBe(2);
    expect(dataset.executiveSummary.periodLabel).toContain('2026-01');
    expect(dataset.executiveSummary.periodLabel).toContain('2026-02');

    const ingresos = dataset.execution.contable.standardTable.find((r) => r.lineKey === 'ingresos_operacionales');
    expect(ingresos.value).toBe(1500);
  });
});
