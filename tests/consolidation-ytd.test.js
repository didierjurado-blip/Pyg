const { buildConsolidatedYtdDataset, buildEliminationScopeKey } = require('../src/services/consolidation-service');
const { buildDefaultLineSettingsMap } = require('../src/services/line-settings-service');

function monthExecution(value) {
  const standardTable = [
    { lineKey: 'ingresos_operacionales', lineLabel: 'Ingresos operacionales', value },
    { lineKey: 'utilidad_antes_impuestos', lineLabel: 'UAI', value: value * 0.1 },
  ];
  const detailedTable = [{ sectionLabel: 'Ingresos', subgroup: 'Ventas', value: value * 0.5, accountCount: 1 }];
  return {
    contable: { standardTable, detailedTable },
    gerencial: { standardTable, detailedTable },
    accountMapping: [],
    managerialAdjustments: [],
    automaticNotes: { technicalNotes: [], qualityWarnings: [], exclusionsSuggested: [], reclassificationsSuggested: [], missingDescriptions: [] },
  };
}

describe('buildConsolidatedYtdDataset', () => {
  test('sums YTD across companies and applies eliminations across months', () => {
    const c1 = { id: 'c1', name: 'A' };
    const c2 = { id: 'c2', name: 'B' };
    const scopeKey = buildEliminationScopeKey({ groupId: null, companyIds: ['c1', 'c2'] });

    const db = {
      companies: [c1, c2],
      companyGroups: [],
      dataByCompany: {
        c1: {
          months: {
            '2026-01': { execution: monthExecution(100) },
            '2026-02': { execution: monthExecution(50) },
          },
          lineSettings: buildDefaultLineSettingsMap(),
        },
        c2: {
          months: {
            '2026-01': { execution: monthExecution(200) },
            '2026-02': { execution: monthExecution(100) },
          },
          lineSettings: buildDefaultLineSettingsMap(),
        },
      },
      consolidationEliminations: [
        {
          id: 'e1',
          month: '2026-01',
          scopeKey,
          scopeType: 'adhoc',
          groupId: null,
          companyIds: ['c1', 'c2'],
          lineKey: 'ingresos_operacionales',
          description: 'test',
          value: 30,
          eliminationType: 'ingreso_intercompania',
          sourceCompanyId: 'c1',
          targetCompanyId: 'c2',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'e2',
          month: '2026-02',
          scopeKey,
          scopeType: 'adhoc',
          groupId: null,
          companyIds: ['c1', 'c2'],
          lineKey: 'ingresos_operacionales',
          description: 'test2',
          value: 10,
          eliminationType: 'ingreso_intercompania',
          sourceCompanyId: 'c1',
          targetCompanyId: 'c2',
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    const dataset = buildConsolidatedYtdDataset({
      db,
      companyIds: ['c1', 'c2'],
      cutoffMonth: '2026-02',
      includeBudget: false,
      view: 'gerencial',
      groupId: null,
    });

    expect(dataset.periodType).toBe('ytd');
    expect(dataset.meta.schema).toBe('consolidated_ytd_v1');
    expect(dataset.ytdPeriod.months).toEqual(['2026-01', '2026-02']);
    expect(dataset.eliminations.items.length).toBe(2);
    expect(dataset.eliminations.total).toBe(40);

    const ingRow = dataset.real.consolidated.standardTable.find((r) => r.lineKey === 'ingresos_operacionales');
    expect(ingRow.value).toBe(450);
    const adjRow = dataset.real.consolidated.adjustedRowsWithEliminations.find((r) => r.lineKey === 'ingresos_operacionales');
    expect(adjRow.eliminationValue).toBe(40);
    expect(adjRow.adjustedValue).toBe(410);
  });
});
