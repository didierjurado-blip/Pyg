const crypto = require('crypto');
const { authenticator } = require('otplib');

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.AUTH_SESSION_TTL_HOURS || 12));
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const SESSION_SLIDE_MS = Math.max(1, Number(process.env.AUTH_SESSION_SLIDE_MINUTES || 5)) * 60 * 1000;

const ROLE_RANK = {
  viewer: 1,
  editor: 2,
  admin: 3,
};
const DEFAULT_ADMIN_EMAIL = 'admin@pgcontrol.local';
const DEFAULT_ADMIN_PASSWORD = 'PgcAdmin_2026!Cambiar';
const DEFAULT_ADMIN_NAME = 'Administrador';

function ensureAuthState(db) {
  db.auth = db.auth && typeof db.auth === 'object' ? db.auth : {};
  db.auth.users = Array.isArray(db.auth.users) ? db.auth.users : [];
  db.auth.sessions = Array.isArray(db.auth.sessions) ? db.auth.sessions : [];
  cleanupExpiredSessions(db);
  return db.auth;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUserRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'viewer' || r === 'editor' || r === 'admin') {
    return r;
  }
  return 'admin';
}

function roleMeetsMinimum(userRole, minimumRole) {
  const u = ROLE_RANK[normalizeUserRole(userRole)] || 0;
  const m = ROLE_RANK[normalizeUserRole(minimumRole)] || 0;
  return u >= m;
}

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password || ''), salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    derived.toString('hex'),
  ].join('$');
}

function verifyPassword(password, storedHash) {
  const raw = String(storedHash || '').trim();
  const [scheme, n, r, p, salt, expectedHex] = raw.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const derived = crypto.scryptSync(String(password || ''), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAXMEM,
  });

  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function validatePasswordStrength(password) {
  const value = String(password || '').trim();
  const errors = [];

  if (!value) {
    errors.push('Debes ingresar una contrasena.');
  }

  return errors;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.email,
    role: normalizeUserRole(user.role),
    mfaEnabled: Boolean(user.mfaEnabled),
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function createUserRecord({ email, password, displayName, role = 'admin' }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordErrors = validatePasswordStrength(password);
  if (!normalizedEmail) {
    throw new Error('Debes ingresar un usuario.');
  }
  if (passwordErrors.length) {
    throw new Error(passwordErrors[0]);
  }

  const timestamp = nowIso();
  return {
    id: `usr-${crypto.randomUUID()}`,
    email: normalizedEmail,
    displayName: String(displayName || '').trim() || 'Administrador',
    role: normalizeUserRole(role),
    passwordHash: hashPassword(password),
    mfaEnabled: false,
    mfaSecret: null,
    mfaTempSecret: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: null,
  };
}

function createAdminUser(db, { email, password, displayName }) {
  const auth = ensureAuthState(db);
  const normalizedEmail = normalizeEmail(email);

  if (auth.users.some((user) => user.email === normalizedEmail)) {
    throw new Error('Ya existe un usuario con ese nombre.');
  }

  const user = createUserRecord({
    email: normalizedEmail,
    password,
    displayName: displayName || 'Administrador',
    role: 'admin',
  });

  auth.users.push(user);
  return user;
}

function updateUserIdentity(db, userId, { email, displayName }) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Debes ingresar un usuario.');
  }

  const duplicated = auth.users.find((item) => item.email === normalizedEmail && item.id !== userId);
  if (duplicated) {
    throw new Error('Ya existe otro usuario con ese nombre.');
  }

  user.email = normalizedEmail;
  user.displayName = String(displayName || '').trim() || 'Administrador';
  user.updatedAt = nowIso();
  return user;
}

function updateUserPassword(db, userId, newPassword) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }

  const passwordErrors = validatePasswordStrength(newPassword);
  if (passwordErrors.length) {
    throw new Error(passwordErrors[0]);
  }

  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = nowIso();
  return user;
}

function cleanupExpiredSessions(db) {
  const auth = db.auth && typeof db.auth === 'object' ? db.auth : { users: [], sessions: [] };
  const validUsers = new Set((auth.users || []).map((user) => user.id));
  const now = Date.now();
  auth.sessions = (auth.sessions || []).filter((session) => {
    const expiresAt = new Date(session.expiresAt || 0).getTime();
    return validUsers.has(session.userId) && Number.isFinite(expiresAt) && expiresAt > now;
  });
  db.auth = auth;
  return auth.sessions;
}

function createSession(db, { userId, ipAddress, userAgent }) {
  const auth = ensureAuthState(db);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const timestamp = nowIso();
  const session = {
    id: `ses-${crypto.randomUUID()}`,
    userId,
    tokenHash: hashToken(rawToken),
    csrfToken: crypto.randomBytes(24).toString('hex'),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    ipAddress: String(ipAddress || '').trim().slice(0, 120),
    userAgent: String(userAgent || '').trim().slice(0, 260),
  };

  auth.sessions.unshift(session);
  auth.sessions = auth.sessions.slice(0, 500);
  return { session, rawToken };
}

function getSessionData(db, rawToken) {
  const auth = ensureAuthState(db);
  const tokenHash = hashToken(rawToken);
  const session = auth.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) {
    return null;
  }

  const user = auth.users.find((item) => item.id === session.userId);
  if (!user) {
    return null;
  }

  return { session, user };
}

function revokeSession(db, sessionId) {
  const auth = ensureAuthState(db);
  auth.sessions = auth.sessions.filter((session) => session.id !== sessionId);
}

function revokeSessionByToken(db, rawToken) {
  const auth = ensureAuthState(db);
  const tokenHash = hashToken(rawToken);
  auth.sessions = auth.sessions.filter((session) => session.tokenHash !== tokenHash);
}

function revokeUserSessions(db, userId, keepSessionId = '') {
  const auth = ensureAuthState(db);
  auth.sessions = auth.sessions.filter((session) => {
    if (session.userId !== userId) return true;
    return keepSessionId && session.id === keepSessionId;
  });
}

function registerSuccessfulLogin(db, userId) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user) {
    return null;
  }

  user.lastLoginAt = nowIso();
  user.updatedAt = nowIso();
  return user;
}

function maybeExtendSessionSliding(session) {
  if (!session) {
    return false;
  }
  const now = Date.now();
  const last = new Date(session.lastSeenAt || session.createdAt || 0).getTime();
  if (!Number.isFinite(last)) {
    return false;
  }
  if (now - last < SESSION_SLIDE_MS) {
    return false;
  }
  session.lastSeenAt = new Date(now).toISOString();
  session.expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  session.updatedAt = session.lastSeenAt;
  return true;
}

function verifyTotpCode(secret, token) {
  const cleaned = String(token || '').replace(/\s/g, '');
  if (!cleaned || !secret) {
    return false;
  }
  return authenticator.verify({ token: cleaned, secret: String(secret) });
}

function startMfaEnrollment(db, userId) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }
  const secret = authenticator.generateSecret();
  user.mfaTempSecret = secret;
  user.updatedAt = nowIso();
  const label = encodeURIComponent(user.email || 'pg-control');
  const issuer = encodeURIComponent('Control P&G');
  const otpauthUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}`;
  return { secret, otpauthUrl };
}

function confirmMfaEnrollment(db, userId, token) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user || !user.mfaTempSecret) {
    throw new Error('No hay configuracion MFA pendiente. Reinicia el asistente.');
  }
  if (!verifyTotpCode(user.mfaTempSecret, token)) {
    throw new Error('Codigo de verificacion incorrecto.');
  }
  user.mfaSecret = user.mfaTempSecret;
  user.mfaTempSecret = null;
  user.mfaEnabled = true;
  user.updatedAt = nowIso();
  return user;
}

function cancelMfaEnrollment(db, userId) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }
  user.mfaTempSecret = null;
  user.updatedAt = nowIso();
  return user;
}

function disableMfaWithCode(db, userId, token) {
  const auth = ensureAuthState(db);
  const user = auth.users.find((item) => item.id === userId);
  if (!user || !user.mfaEnabled) {
    throw new Error('MFA no esta activo.');
  }
  if (!verifyTotpCode(user.mfaSecret, token)) {
    throw new Error('Codigo de verificacion incorrecto.');
  }
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaTempSecret = null;
  user.updatedAt = nowIso();
  return user;
}

function bootstrapInitialUser(db, env = process.env) {
  const auth = ensureAuthState(db);
  if (auth.users.length > 0) {
    return { bootstrapped: false, user: null };
  }

  const email = normalizeEmail(env.AUTH_INITIAL_EMAIL || DEFAULT_ADMIN_EMAIL);
  const password = String(env.AUTH_INITIAL_PASSWORD || DEFAULT_ADMIN_PASSWORD);
  const displayName = String(env.AUTH_INITIAL_NAME || DEFAULT_ADMIN_NAME).trim() || DEFAULT_ADMIN_NAME;

  if (!email || !password) {
    return { bootstrapped: false, user: null };
  }

  const user = createAdminUser(db, { email, password, displayName });
  return { bootstrapped: true, user };
}

module.exports = {
  SESSION_TTL_HOURS,
  SESSION_TTL_MS,
  SESSION_SLIDE_MS,
  ROLE_RANK,
  ensureAuthState,
  normalizeEmail,
  normalizeUserRole,
  roleMeetsMinimum,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  sanitizeUser,
  createAdminUser,
  updateUserIdentity,
  updateUserPassword,
  cleanupExpiredSessions,
  createSession,
  getSessionData,
  revokeSession,
  revokeSessionByToken,
  revokeUserSessions,
  registerSuccessfulLogin,
  maybeExtendSessionSliding,
  verifyTotpCode,
  startMfaEnrollment,
  confirmMfaEnrollment,
  cancelMfaEnrollment,
  disableMfaWithCode,
  bootstrapInitialUser,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_NAME,
};
