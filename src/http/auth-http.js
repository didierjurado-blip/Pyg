const crypto = require('crypto');
const { readDb, withDb, writeDb } = require('../services/storage-service');
const {
  SESSION_TTL_MS,
  ensureAuthState,
  normalizeEmail,
  sanitizeUser,
  bootstrapInitialUser,
  getSessionData,
  revokeSessionByToken,
  maybeExtendSessionSliding,
  roleMeetsMinimum,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
} = require('../services/auth-service');
const { AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE, AUTH_SETUP_TOKEN, SAFE_API_METHODS } = require('./env');

const authAttemptBuckets = new Map();

function bootstrapInitialAdminFromEnv() {
  try {
    const db = readDb();
    const authState = ensureAuthState(db);
    if (authState.users.length > 0) {
      return;
    }

    const email = normalizeEmail(process.env.AUTH_INITIAL_EMAIL || '');
    const password = String(process.env.AUTH_INITIAL_PASSWORD || '');
    if (!email || !password) {
      return;
    }

    let bootstrapInfo = { bootstrapped: false, user: null };
    withDb((currentDb) => {
      bootstrapInfo = bootstrapInitialUser(currentDb);
      return currentDb;
    });

    if (bootstrapInfo.bootstrapped) {
      console.log('Auth bootstrap completado para ' + bootstrapInfo.user.email + '.');
      if (bootstrapInfo.user.email === DEFAULT_ADMIN_EMAIL) {
        console.log('Credenciales admin por defecto: ' + DEFAULT_ADMIN_EMAIL + ' / ' + DEFAULT_ADMIN_PASSWORD);
      }
    }
  } catch (error) {
    console.error('No fue posible inicializar el usuario administrador:', error.message);
  }
}

function parseCookies(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return String(cookies[AUTH_COOKIE_NAME] || '').trim();
}

function setSessionCookie(res, rawToken) {
  const parts = [
    AUTH_COOKIE_NAME + '=' + encodeURIComponent(rawToken),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(SESSION_TTL_MS / 1000),
  ];

  if (AUTH_COOKIE_SECURE) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [
    AUTH_COOKIE_NAME + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (AUTH_COOKIE_SECURE) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function getClientIp(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').trim();
}

function safeCompareText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function isLocalSetupRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1' || host.startsWith('127.0.0.1:');
}

function resolveSetupMode(req, db) {
  const authState = ensureAuthState(db);
  if (authState.users.length > 0) {
    return 'disabled';
  }
  if (isLocalSetupRequest(req)) {
    return 'local';
  }
  if (AUTH_SETUP_TOKEN) {
    return 'token';
  }
  return 'disabled';
}

function consumeAuthAttempt(key, windowMs = 15 * 60 * 1000, maxAttempts = 10) {
  const now = Date.now();
  const bucket = authAttemptBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    authAttemptBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

function authThrottle(req, res, next) {
  const email = normalizeEmail(req.body?.email || req.body?.username || '');
  const key = [getClientIp(req), req.path, email].join('|');
  const result = consumeAuthAttempt(key);
  if (!result.allowed) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intentelo de nuevo.' });
  }
  return next();
}

function buildAuthPayload(user, session, extra = {}) {
  return {
    authenticated: true,
    user: sanitizeUser(user),
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    ...extra,
  };
}

/** Rellena req.auth desde la cookie de sesion. Ver docs/api-auth-routes.md para rutas protegidas. */
function attachAuthContext(req, res, next) {
  const rawToken = getSessionTokenFromRequest(req);
  if (!rawToken) {
    req.auth = null;
    return next();
  }

  try {
    const db = readDb();
    const sessionData = getSessionData(db, rawToken);
    if (!sessionData) {
      clearSessionCookie(res);
      req.auth = null;
      return next();
    }

    if (maybeExtendSessionSliding(sessionData.session)) {
      writeDb(db);
    }

    req.auth = {
      token: rawToken,
      session: sessionData.session,
      user: sessionData.user,
    };
    return next();
  } catch (_error) {
    req.auth = null;
    return next();
  }
}

/** Exige sesion; POST/PUT/PATCH/DELETE requieren cabecera x-csrf-token. Ver docs/api-auth-routes.md. */
function requireAuthenticatedApi(req, res, next) {
  if (!req.auth?.user || !req.auth?.session) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
  }

  if (!SAFE_API_METHODS.has(String(req.method || 'GET').toUpperCase())) {
    const csrfToken = String(req.headers['x-csrf-token'] || '').trim();
    if (!csrfToken || csrfToken !== req.auth.session.csrfToken) {
      return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
    }
  }

  return next();
}

function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.auth?.user || !req.auth?.session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
    }
    if (!roleMeetsMinimum(req.auth.user.role, minRole)) {
      return res.status(403).json({ error: 'Permisos insuficientes para esta operacion.' });
    }
    return next();
  };
}

function isPublicApiPath(req) {
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
  if (pathOnly === '/api/health' || pathOnly === '/api/ready') {
    return true;
  }
  if (pathOnly === '/api/openapi.json') {
    return true;
  }
  if (pathOnly.startsWith('/api/auth/')) {
    return true;
  }
  return false;
}

module.exports = {
  authAttemptBuckets,
  bootstrapInitialAdminFromEnv,
  getSessionTokenFromRequest,
  setSessionCookie,
  clearSessionCookie,
  getClientIp,
  safeCompareText,
  resolveSetupMode,
  authThrottle,
  buildAuthPayload,
  attachAuthContext,
  requireAuthenticatedApi,
  requireMinRole,
  isPublicApiPath,
};
