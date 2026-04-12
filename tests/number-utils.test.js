const { parseMoney, round2, normalizeText } = require('../src/utils/number-utils');

describe('parseMoney', () => {
  test('parses plain numbers', () => {
    expect(parseMoney(12.5)).toBe(12.5);
    expect(parseMoney('1000')).toBe(1000);
  });

  test('handles Colombian-style thousands with dot', () => {
    expect(parseMoney('1.234.567,89')).toBeCloseTo(1234567.89, 2);
  });

  test('parentheses imply negative', () => {
    expect(parseMoney('(100)')).toBe(-100);
  });

  test('empty becomes zero', () => {
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(null)).toBe(0);
  });
});

describe('round2', () => {
  test('rounds to two decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
  });
});

describe('normalizeText', () => {
  test('strips accents and lowercases', () => {
    expect(normalizeText('  Ingreso Operacional  ')).toBe('ingreso operacional');
    expect(normalizeText('Pérdida')).toBe('perdida');
  });
});
