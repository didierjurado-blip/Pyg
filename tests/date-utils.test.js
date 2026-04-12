const { monthsInYearUpTo, ensureMonth } = require('../src/utils/date-utils');

describe('monthsInYearUpTo', () => {
  test('lists january through cutoff month', () => {
    expect(monthsInYearUpTo('2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  test('january only', () => {
    expect(monthsInYearUpTo('2026-01')).toEqual(['2026-01']);
  });

  test('ensureMonth validates', () => {
    expect(() => ensureMonth('13-2026')).toThrow();
  });
});
