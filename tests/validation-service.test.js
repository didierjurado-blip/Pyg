const {
  validateExecutionRows,
  validateBudgetRows,
} = require('../src/services/validation-service');

describe('validateExecutionRows', () => {
  test('requires mapping and rows', () => {
    const r = validateExecutionRows([], { account: 'A', accountName: 'B' });
    expect(r.errors.length).toBeGreaterThan(0);

    const r2 = validateExecutionRows([{ A: '1', B: 'x' }], {});
    expect(r2.errors.some((e) => e.includes('mapear'))).toBe(true);
  });

  test('passes minimal valid grid', () => {
    const rows = [{ cuenta: '4100', nombre: 'Ventas', saldo: '1000' }];
    const mapping = { account: 'cuenta', accountName: 'nombre', balance: 'saldo' };
    const r = validateExecutionRows(rows, mapping);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateBudgetRows', () => {
  test('rejects empty rows', () => {
    const r = validateBudgetRows([]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('accepts valid budget rows', () => {
    const rows = [{ lineKey: 'ingresos_operacionales', budget: '1000' }];
    const r = validateBudgetRows(rows);
    expect(r.errors).toHaveLength(0);
  });
});
