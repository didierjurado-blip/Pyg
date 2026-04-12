#!/usr/bin/env node
/**
 * Asigna rol corporativo a un usuario existente (admin | editor | viewer).
 * Uso: node scripts/set-user-role.js <email> <admin|editor|viewer>
 */
const { readDb, writeDb } = require('../src/services/storage-service');
const { ensureAuthState, normalizeEmail } = require('../src/services/auth-service');

const [, , emailArg, roleArg] = process.argv;

if (!emailArg || !roleArg) {
  console.error('Uso: node scripts/set-user-role.js <email> <admin|editor|viewer>');
  process.exit(1);
}

const email = normalizeEmail(emailArg);
const role = String(roleArg || '').trim().toLowerCase();
if (!['admin', 'editor', 'viewer'].includes(role)) {
  console.error('Rol invalido. Usa admin, editor o viewer.');
  process.exit(1);
}

const db = readDb();
const auth = ensureAuthState(db);
const user = auth.users.find((u) => u.email === email);
if (!user) {
  console.error('Usuario no encontrado:', email);
  process.exit(1);
}

user.role = role;
user.updatedAt = new Date().toISOString();
writeDb(db);
console.log('Rol actualizado:', email, '->', role);
