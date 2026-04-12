const {
  normalizeUserRole,
  roleMeetsMinimum,
} = require('../src/services/auth-service');

describe('normalizeUserRole', () => {
  test('defaults unknown to admin for backward compatibility', () => {
    expect(normalizeUserRole(undefined)).toBe('admin');
    expect(normalizeUserRole('superuser')).toBe('admin');
  });

  test('accepts canonical roles', () => {
    expect(normalizeUserRole('viewer')).toBe('viewer');
    expect(normalizeUserRole('editor')).toBe('editor');
    expect(normalizeUserRole('admin')).toBe('admin');
  });
});

describe('roleMeetsMinimum', () => {
  test('compares role ranks', () => {
    expect(roleMeetsMinimum('admin', 'viewer')).toBe(true);
    expect(roleMeetsMinimum('editor', 'editor')).toBe(true);
    expect(roleMeetsMinimum('viewer', 'editor')).toBe(false);
  });
});
