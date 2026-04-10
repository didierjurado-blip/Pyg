const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { parseUploadedFile } = require('./src/services/file-parser');
const { buildExecutionDataset } = require('./src/services/execution-service');
const { buildBudgetTemplate, buildBudgetDataset, normalizeBudgetInput, parseBudgetRowsFromFile } = require('./src/services/budget-service');
const { compareBudgetVsReal } = require('./src/services/comparison-service');
const { buildExecutiveSummary, buildFindings, buildActionPlan } = require('./src/services/analysis-service');
const {
  buildDataQualityAlerts,
  validateExecutionRows,
  validateBudgetRows,
  buildExecutionPreviewSummary,
  buildBudgetPreviewSummary,
} = require('./src/services/validation-service');
const { createWorkbookBuffer, createBudgetTemplateWorkbookBuffer } = require('./src/services/export-service');
const { readDb, withDb, getCompanyData, defaultCompanyData } = require('./src/services/storage-service');
const { ensureMonth } = require('./src/utils/date-utils');
const { PYG_LINES } = require('./src/config/pyg-lines');
const { toLineSettingsArray, normalizeLineSettings } = require('./src/services/line-settings-service');
const {
  getMonthClosure,
  assertMonthOpen,
  closeMonth,
  reopenMonth,
  findPreviousBudgetMonth,
  buildActionsOverview,
} = require('./src/services/month-service');

const {
  SESSION_TTL_MS,
  ensureAuthState,
  normalizeEmail,
  verifyPassword,
  sanitizeUser,
  createAdminUser,
  updateUserIdentity,
  updateUserPassword,
  createSession,
  getSessionData,
  revokeSession,
  revokeSessionByToken,
  revokeUserSessions,
  registerSuccessfulLogin,
  bootstrapInitialUser,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
} = require('./src/services/auth-service');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').trim();
const AUTH_COOKIE_SECURE = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true';
const AUTH_COOKIE_NAME = AUTH_COOKIE_SECURE ? '__Host-pgc_session' : 'pgc_session';
const AUTH_SETUP_TOKEN = String(process.env.AUTH_SETUP_TOKEN || '').trim();
const SAFE_API_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const uploadedExecutionFiles = new Map();
const uploadedBudgetFiles = new Map();
const authAttemptBuckets = new Map();

if (TRUST_PROXY) {
  app.set('trust proxy', TRUST_PROXY === 'true' ? 1 : TRUST_PROXY);
}

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use('/api', attachAuthContext);
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
      if (/\.html$/i.test(filePath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      if (/\.css$/i.test(filePath)) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      if (/\.js$/i.test(filePath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

bootstrapInitialAdminFromEnv();

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

function resolveCompanyId(req, db) {
  const fromQuery = String(req.query?.companyId || '').trim();
  const fromBody = String(req.body?.companyId || '').trim();
  const candidate = fromQuery || fromBody || db.companies[0]?.id;

  if (!candidate) {
    throw new Error('No hay empresa disponible. Crea una empresa primero.');
  }

  const company = db.companies.find((item) => item.id === candidate);
  if (!company) {
    throw new Error('Empresa no encontrada.');
  }

  return company.id;
}

function upsertLoadRecord(companyData, { type, month, fileName }) {
  const previous = (companyData.loads || []).find((item) => item.type === type && item.month === month) || null;
  companyData.loads = (companyData.loads || []).filter((item) => !(item.type === type && item.month === month));
  const newRecord = {
    id: crypto.randomUUID(),
    type,
    month,
    fileName,
    createdAt: new Date().toISOString(),
  };
  companyData.loads.push(newRecord);
  return {
    newRecord,
    replacedRecordId: previous?.id || null,
  };
}

function pushAuditLog(db, companyId, event) {
  const payload = {
    id: event.id || crypto.randomUUID(),
    companyId,
    companyName: event.companyName || 'N/A',
    month: event.month || null,
    eventType: event.eventType || 'evento',
    dataType: event.dataType || 'general',
    fileName: event.fileName || null,
    dateTime: event.dateTime || new Date().toISOString(),
    rowsRead: Number(event.rowsRead || 0),
    rowsProcessed: Number(event.rowsProcessed || 0),
    resultStatus: event.resultStatus || 'exitoso',
    messageSummary: event.messageSummary || '',
    alertsDetected: Array.isArray(event.alertsDetected) ? event.alertsDetected : [],
    replacedRecordId: event.replacedRecordId || null,
  };

  db.auditLogsGlobal = Array.isArray(db.auditLogsGlobal) ? db.auditLogsGlobal : [];
  db.auditLogsGlobal.unshift(payload);
  db.auditLogsGlobal = db.auditLogsGlobal.slice(0, 5000);

  if (companyId && db.dataByCompany?.[companyId]) {
    const companyData = db.dataByCompany[companyId];
    companyData.auditLogs = Array.isArray(companyData.auditLogs) ? companyData.auditLogs : [];
    companyData.auditLogs.unshift(payload);
    companyData.auditLogs = companyData.auditLogs.slice(0, 2000);
  }

  return payload;
}

function getMonthSnapshot(companyId, month) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  return companyData.months[month] || null;
}

function getMonthStatusPayload(companyData, month) {
  const status = getMonthClosure(companyData, month);
  return {
    ...status,
    blockedActions: [
      'cargar ejecución',
      'reemplazar ejecución',
      'cargar presupuesto',
      'reemplazar presupuesto',
      'editar presupuesto',
      'borrar ejecución',
      'borrar presupuesto',
    ],
    allowedActions: [
      'ver reportes',
      'exportar',
      'consultar histórico',
      'consultar observaciones',
      'consultar acciones',
    ],
  };
}

function refreshMonthAnalysisIfPossible(companyId, month) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  if (!companyData.months?.[month]?.execution) {
    return db;
  }
  return buildOrRefreshAnalysis(companyId, month);
}

function buildTrendForCompany(companyData) {
  const months = Object.keys(companyData.months || {}).sort();
  return months.map((month) => {
    const snapshot = companyData.months[month];
    const rows = snapshot.comparison?.rows || [];
    const byKey = new Map(rows.map((row) => [row.lineKey, row]));
    return {
      month,
      ingresos_operacionales: byKey.get('ingresos_operacionales')?.real || 0,
      utilidad_operacional: byKey.get('utilidad_operacional')?.real || 0,
      utilidad_neta: byKey.get('utilidad_neta')?.real || 0,
      utilidad_neta_presupuesto: byKey.get('utilidad_neta')?.budget || 0,
    };
  });
}

function buildExecutiveBoard(companyName, month, snapshot, trend) {
  const rows = snapshot.comparison?.rows || [];
  const utilityRow = rows.find((row) => row.lineKey === 'utilidad_neta') || { real: 0, budget: 0 };
  const totalLines = rows.length || 1;
  const cumplidas = rows.filter((row) => row.status === 'Cumplido').length;

  const topUnfavorable = rows
    .filter((row) => !row.favorable)
    .sort((a, b) => Math.abs(b.variationPct || 0) - Math.abs(a.variationPct || 0))
    .slice(0, 5);

  const topFavorable = rows
    .filter((row) => row.favorable)
    .sort((a, b) => Math.abs(b.variationPct || 0) - Math.abs(a.variationPct || 0))
    .slice(0, 5);

  return {
    companyName,
    month,
    compliancePct: Math.round((cumplidas / totalLines) * 100),
    utilityBudget: utilityRow.budget || 0,
    utilityReal: utilityRow.real || 0,
    topUnfavorable,
    topFavorable,
    incumplidas: rows.filter((row) => row.status === 'Incumplido'),
    dataQualityAlerts: snapshot.analysis?.dataQualityAlerts || [],
    actionSummary: (snapshot.analysis?.actionPlan || []).slice(0, 3),
    recentTrend: (trend || []).slice(-6),
  };
}

function refreshCompanyAnalyses(companyId) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  const months = Object.keys(companyData.months || {}).sort();
  months.forEach((month) => {
    if (companyData.months[month]?.execution) {
      try {
        buildOrRefreshAnalysis(companyId, month);
      } catch (_error) {
        // no-op
      }
    }
  });
}

function buildOrRefreshAnalysis(companyId, month) {
  return withDb((db) => {
    const { company, companyData } = getCompanyData(db, companyId);
    const snapshot = companyData.months[month] || {};

    if (!snapshot.execution) {
      throw new Error('No hay ejecución cargada para este mes.');
    }

    const budgetRows = snapshot.budget?.rows || buildBudgetTemplate();
    const comparison = compareBudgetVsReal({
      budgetRows: snapshot.budget?.gerencial?.standardTable || snapshot.budget?.contable?.standardTable || budgetRows,
      realPygTable: snapshot.execution.gerencial?.standardTable || snapshot.execution.gerencial?.pygTable || snapshot.execution.contable.pygTable,
      lineSettings: companyData.lineSettings,
    });

    const dataQualityAlerts = buildDataQualityAlerts({
      comparisonRows: comparison.rows,
      execution: snapshot.execution,
    });

    const executiveSummary = buildExecutiveSummary({
      month,
      comparison,
      contable: snapshot.execution.contable,
      gerencial: snapshot.execution.gerencial,
      dataQualityAlerts,
      execution: snapshot.execution,
    });

    const findings = buildFindings({ comparison, execution: snapshot.execution });
    const actionPlan = buildActionPlan(comparison.rows);

    companyData.months[month] = {
      ...snapshot,
      month,
      comparison,
      analysis: {
        executiveSummary,
        findings,
        actionPlan,
        dataQualityAlerts,
        generatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    return db;
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: 'v3.1-mini-sprint' });
});

app.get('/api/auth/session', (req, res) => {
  try {
    const db = readDb();
    const authState = ensureAuthState(db);
    const setupMode = resolveSetupMode(req, db);

    if (req.auth?.user && req.auth?.session) {
      return res.json(buildAuthPayload(req.auth.user, req.auth.session, {
        setupRequired: false,
        setupMode: 'disabled',
      }));
    }

    return res.json({
      authenticated: false,
      setupRequired: authState.users.length === 0,
      setupMode,
      setupTokenConfigured: Boolean(AUTH_SETUP_TOKEN),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No fue posible validar la sesion actual.' });
  }
});

app.post('/api/auth/setup', authThrottle, (req, res) => {
  try {
    const db = readDb();
    const authState = ensureAuthState(db);
    if (authState.users.length > 0) {
      return res.status(409).json({ error: 'La configuracion inicial ya fue completada.' });
    }

    const setupMode = resolveSetupMode(req, db);
    if (setupMode === 'disabled') {
      return res.status(403).json({ error: 'La configuracion inicial no esta habilitada. Define AUTH_INITIAL_EMAIL/AUTH_INITIAL_PASSWORD o AUTH_SETUP_TOKEN.' });
    }

    if (setupMode === 'token' && !safeCompareText(req.body?.setupToken || '', AUTH_SETUP_TOKEN)) {
      return res.status(403).json({ error: 'Token de configuracion invalido.' });
    }

    const email = normalizeEmail(req.body?.email || req.body?.username || '');
    const password = String(req.body?.password || '');
    const passwordConfirm = String(req.body?.passwordConfirm || '');
    const displayName = String(req.body?.displayName || 'Administrador').trim() || 'Administrador';

    if (!email) {
      return res.status(400).json({ error: 'Debes ingresar un usuario.' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: 'La confirmacion de contrasena no coincide.' });
    }

    let setupPayload = null;
    withDb((currentDb) => {
      const user = createAdminUser(currentDb, { email, password, displayName });
      const updatedUser = registerSuccessfulLogin(currentDb, user.id) || user;
      const createdSession = createSession(currentDb, {
        userId: updatedUser.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      });

      setupPayload = {
        user: updatedUser,
        session: createdSession.session,
        rawToken: createdSession.rawToken,
      };
      return currentDb;
    });

    setSessionCookie(res, setupPayload.rawToken);
    return res.status(201).json(buildAuthPayload(setupPayload.user, setupPayload.session, {
      message: 'Administrador inicial creado correctamente.',
      setupRequired: false,
      setupMode: 'disabled',
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible crear el administrador inicial.' });
  }
});

app.post('/api/auth/login', authThrottle, (req, res) => {
  try {
    const db = readDb();
    const authState = ensureAuthState(db);
    if (authState.users.length === 0) {
      return res.status(400).json({ error: 'No hay usuarios configurados. Completa el alta inicial.' });
    }

    const email = normalizeEmail(req.body?.email || req.body?.username || '');
    const password = String(req.body?.password || '');
    const user = authState.users.find((item) => item.email === email) || null;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    let loginPayload = null;
    withDb((currentDb) => {
      const currentAuth = ensureAuthState(currentDb);
      const mutableUser = currentAuth.users.find((item) => item.email === email);
      if (!mutableUser || !verifyPassword(password, mutableUser.passwordHash)) {
        throw new Error('Credenciales invalidas.');
      }

      revokeUserSessions(currentDb, mutableUser.id);
      const updatedUser = registerSuccessfulLogin(currentDb, mutableUser.id) || mutableUser;
      const createdSession = createSession(currentDb, {
        userId: updatedUser.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      });

      loginPayload = {
        user: updatedUser,
        session: createdSession.session,
        rawToken: createdSession.rawToken,
      };
      return currentDb;
    });

    setSessionCookie(res, loginPayload.rawToken);
    return res.json(buildAuthPayload(loginPayload.user, loginPayload.session, {
      message: 'Sesion iniciada correctamente.',
      setupRequired: false,
      setupMode: 'disabled',
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible iniciar sesion.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const rawToken = getSessionTokenFromRequest(req);
    if (rawToken) {
      withDb((currentDb) => {
        revokeSessionByToken(currentDb, rawToken);
        return currentDb;
      });
    }

    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    clearSessionCookie(res);
    return res.status(400).json({ error: error.message || 'No fue posible cerrar sesion.' });
  }
});

app.post('/api/auth/profile', (req, res) => {
  try {
    if (!req.auth?.user || !req.auth?.session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
    }

    const csrfToken = String(req.headers['x-csrf-token'] || '').trim();
    if (!csrfToken || csrfToken !== req.auth.session.csrfToken) {
      return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const email = normalizeEmail(req.body?.email || req.body?.username || '');
    const displayName = String(req.body?.displayName || '').trim() || 'Administrador';

    if (!currentPassword) {
      return res.status(400).json({ error: 'Debes confirmar tu contrasena actual.' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Debes ingresar un usuario.' });
    }

    let profilePayload = null;
    withDb((currentDb) => {
      const currentAuth = ensureAuthState(currentDb);
      const mutableUser = currentAuth.users.find((item) => item.id === req.auth.user.id);
      if (!mutableUser || !verifyPassword(currentPassword, mutableUser.passwordHash)) {
        throw new Error('La contrasena actual es incorrecta.');
      }

      const updatedUser = updateUserIdentity(currentDb, mutableUser.id, { email, displayName });
      revokeUserSessions(currentDb, updatedUser.id);
      const loginUser = registerSuccessfulLogin(currentDb, updatedUser.id) || updatedUser;
      const createdSession = createSession(currentDb, {
        userId: loginUser.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      });

      profilePayload = {
        user: loginUser,
        session: createdSession.session,
        rawToken: createdSession.rawToken,
      };
      return currentDb;
    });

    setSessionCookie(res, profilePayload.rawToken);
    return res.json(buildAuthPayload(profilePayload.user, profilePayload.session, {
      message: 'Usuario de acceso actualizado correctamente.',
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible actualizar el usuario de acceso.' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    if (!req.auth?.user || !req.auth?.session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
    }

    const csrfToken = String(req.headers['x-csrf-token'] || '').trim();
    if (!csrfToken || csrfToken !== req.auth.session.csrfToken) {
      return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const passwordConfirm = String(req.body?.passwordConfirm || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Debes completar la contrasena actual y la nueva contrasena.' });
    }
    if (newPassword !== passwordConfirm) {
      return res.status(400).json({ error: 'La confirmacion de la nueva contrasena no coincide.' });
    }

    let passwordPayload = null;
    withDb((currentDb) => {
      const currentAuth = ensureAuthState(currentDb);
      const mutableUser = currentAuth.users.find((item) => item.id === req.auth.user.id);
      if (!mutableUser || !verifyPassword(currentPassword, mutableUser.passwordHash)) {
        throw new Error('La contrasena actual es incorrecta.');
      }

      const updatedUser = updateUserPassword(currentDb, mutableUser.id, newPassword);
      revokeUserSessions(currentDb, updatedUser.id);
      const loginUser = registerSuccessfulLogin(currentDb, updatedUser.id) || updatedUser;
      const createdSession = createSession(currentDb, {
        userId: loginUser.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      });

      passwordPayload = {
        user: loginUser,
        session: createdSession.session,
        rawToken: createdSession.rawToken,
      };
      return currentDb;
    });

    setSessionCookie(res, passwordPayload.rawToken);
    return res.json(buildAuthPayload(passwordPayload.user, passwordPayload.session, {
      message: 'Contrasena actualizada correctamente.',
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible actualizar la contrasena.' });
  }
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) {
    return next();
  }
  return requireAuthenticatedApi(req, res, next);
});

app.get('/api/meta', (req, res) => {
  res.json({
    pygLines: PYG_LINES,
    message:
      'V3 Sprint 3 local: duplicado de presupuesto, cierre de mes y seguimiento consolidado de acciones.',
  });
});

app.get('/api/companies', (req, res) => {
  const db = readDb();
  const companies = db.companies
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((company) => {
      const companyData = db.dataByCompany[company.id] || { months: {} };
      const monthsWithData = Object.keys(companyData.months || {}).length;
      return {
        ...company,
        monthsWithData,
      };
    });

  res.json({ companies });
});

app.post('/api/companies', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (name.length < 2) {
      return res.status(400).json({ error: 'El nombre de empresa debe tener al menos 2 caracteres.' });
    }

    const db = withDb((current) => {
      const exists = current.companies.some((company) => company.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        throw new Error('Ya existe una empresa con ese nombre.');
      }

      const company = {
        id: `cmp-${crypto.randomUUID().slice(0, 8)}`,
        name,
        createdAt: new Date().toISOString(),
      };

      current.companies.push(company);
      current.dataByCompany[company.id] = defaultCompanyData();
      return current;
    });

    const created = db.companies[db.companies.length - 1];
    return res.status(201).json({ company: created });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible crear la empresa.' });
  }
});

app.delete('/api/companies/:companyId', (req, res) => {
  try {
    const companyId = String(req.params.companyId || '').trim();

    const db = withDb((current) => {
      const company = current.companies.find((item) => item.id === companyId);
      if (!company) {
        throw new Error('Empresa no encontrada.');
      }

      pushAuditLog(current, companyId, {
        companyName: company.name,
        eventType: 'delete_empresa',
        dataType: 'empresa',
        resultStatus: 'exitoso',
        messageSummary: 'Empresa eliminada con su histórico.',
      });

      current.companies = current.companies.filter((company) => company.id !== companyId);
      delete current.dataByCompany[companyId];

      if (current.companies.length === 0) {
        const fallback = {
          id: `cmp-${crypto.randomUUID().slice(0, 8)}`,
          name: 'Empresa principal',
          createdAt: new Date().toISOString(),
        };
        current.companies.push(fallback);
        current.dataByCompany[fallback.id] = defaultCompanyData();
      }

      return current;
    });

    return res.json({ companies: db.companies });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible eliminar la empresa.' });
  }
});

app.get('/api/months', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { companyData } = getCompanyData(db, companyId);
    const months = Object.keys(companyData.months).sort();
    res.json({ companyId, months });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/month-status/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { companyData } = getCompanyData(db, companyId);
    return res.json({ companyId, month, monthStatus: getMonthStatusPayload(companyData, month) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar el estado del mes.' });
  }
});

app.get('/api/actions-overview', (req, res) => {
  try {
    const db = readDb();
    const month = String(req.query.month || '').trim();
    const companyId = String(req.query.companyId || '').trim();

    const selectedCompanies = companyId
      ? [getCompanyData(db, companyId)]
      : db.companies.map((company) => getCompanyData(db, company.id));

    const overview = buildActionsOverview(
      selectedCompanies.map(({ company, companyData }) => ({
        companyName: company.name,
        companyData,
      })),
      { month }
    );

    return res.json({
      companyId: companyId || null,
      month: month || null,
      overview,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar el seguimiento de acciones.' });
  }
});

app.get('/api/settings/lines', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { companyData } = getCompanyData(db, companyId);
    return res.json({ companyId, items: toLineSettingsArray(companyData.lineSettings) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar la configuración de líneas.' });
  }
});

app.put('/api/settings/lines', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const map = {};

    items.forEach((item) => {
      const lineKey = String(item.lineKey || '').trim();
      if (!lineKey) return;
      map[lineKey] = {
        lineKey,
        tolerancePct: Number(item.tolerancePct),
        responsibleSuggested: String(item.responsibleSuggested || '').trim(),
        priority: item.priority,
        active: item.active,
      };
    });

    withDb((current) => {
      const { companyData } = getCompanyData(current, companyId);
      companyData.lineSettings = normalizeLineSettings(map);
      return current;
    });

    refreshCompanyAnalyses(companyId);

    const updated = readDb();
    const { companyData } = getCompanyData(updated, companyId);
    return res.json({ companyId, items: toLineSettingsArray(companyData.lineSettings) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible guardar la configuración de líneas.' });
  }
});

app.get('/api/audit-logs', (req, res) => {
  try {
    const db = readDb();
    const scope = String(req.query.scope || 'company').trim();
    const month = String(req.query.month || '').trim();
    let logs = [];

    if (scope === 'global') {
      logs = db.auditLogsGlobal || [];
    } else {
      const companyId = resolveCompanyId(req, db);
      const { companyData } = getCompanyData(db, companyId);
      logs = companyData.auditLogs || [];
    }

    if (month) {
      logs = logs.filter((item) => String(item.month || '') === month);
    }

    logs = logs
      .slice()
      .sort((a, b) => String(b.dateTime || '').localeCompare(String(a.dateTime || '')))
      .slice(0, 400);

    return res.json({ logs });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar la bitácora.' });
  }
});

app.post('/api/execution/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar un archivo.' });
    }

    const parsed = parseUploadedFile(req.file);
    const fileId = crypto.randomUUID();

    uploadedExecutionFiles.set(fileId, {
      name: req.file.originalname,
      rows: parsed.rows,
      headers: parsed.headers,
      uploadedAt: Date.now(),
    });

    return res.json({
      fileId,
      fileName: req.file.originalname,
      headers: parsed.headers,
      previewRows: parsed.previewRows,
      totalRows: parsed.rows.length,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible leer el archivo.' });
  }
});

app.post('/api/execution/preview', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { company, companyData } = getCompanyData(db, companyId);
    const { fileId, mapping, month } = req.body;
    const normalizedMonth = ensureMonth(month);
    assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar la ejecución del mes');

    if (!fileId || !uploadedExecutionFiles.has(fileId)) {
      return res.status(400).json({ error: 'Archivo no encontrado. Cargalo nuevamente.' });
    }

    const uploaded = uploadedExecutionFiles.get(fileId);
    const validation = validateExecutionRows(uploaded.rows, mapping || {});
    const existingMonthSnapshot = companyData.months?.[normalizedMonth] || null;
    const conflict = Boolean(existingMonthSnapshot?.execution);
    const tempExecution = validation.errors.length
      ? null
      : buildExecutionDataset({ rows: uploaded.rows, mapping, sourceFileName: uploaded.name });

    const preview = buildExecutionPreviewSummary({
      rows: uploaded.rows,
      mapping,
      headers: uploaded.headers,
      validation,
      tempExecution,
      conflict,
      companyName: company.name,
      month: normalizedMonth,
      fileName: uploaded.name,
    });

    return res.json({
      companyId,
      month: normalizedMonth,
      fileId,
      preview,
      canSave: preview.errors.length === 0,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible validar la ejecución.' });
  }
});

app.post('/api/execution/process', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { company, companyData } = getCompanyData(db, companyId);

    const { fileId, mapping, month, forceReplace } = req.body;
    const normalizedMonth = ensureMonth(month);
    assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar la ejecución del mes');

    if (!fileId || !uploadedExecutionFiles.has(fileId)) {
      return res.status(400).json({ error: 'Archivo no encontrado. Cargalo nuevamente.' });
    }

    const currentSnapshot = companyData.months[normalizedMonth] || {};
    if (currentSnapshot.execution && !forceReplace) {
      return res.status(409).json({
        conflict: true,
        error: 'Ya existe ejecución para este mes y empresa. ¿Deseas reemplazarla',
      });
    }

    const uploaded = uploadedExecutionFiles.get(fileId);
    const validation = validateExecutionRows(uploaded.rows, mapping || {});

    if (validation.errors.length) {
      return res.status(400).json({
        error: 'La ejecución tiene errores de validación.',
        validation,
      });
    }

    const execution = buildExecutionDataset({
      rows: uploaded.rows,
      mapping,
      sourceFileName: uploaded.name,
    });

    withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      const snapshot = mutableCompanyData.months[normalizedMonth] || {};

      mutableCompanyData.months[normalizedMonth] = {
        ...snapshot,
        month: normalizedMonth,
        execution,
        executionValidation: validation,
        updatedAt: new Date().toISOString(),
      };

      const loadInfo = upsertLoadRecord(mutableCompanyData, {
        type: 'ejecución',
        month: normalizedMonth,
        fileName: uploaded.name,
      });

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month: normalizedMonth,
        eventType: loadInfo.replacedRecordId ? 'replace_ejecucin' : 'upload_ejecucin',
        dataType: 'ejecución',
        fileName: uploaded.name,
        rowsRead: uploaded.rows.length,
        rowsProcessed: execution.baseRows.length,
        resultStatus: validation.warnings.length ? 'con_alertas' : 'exitoso',
        messageSummary: 'Ejecucion guardada correctamente.',
        alertsDetected: validation.warnings,
        replacedRecordId: loadInfo.replacedRecordId,
      });

      return currentDb;
    });

    const updatedDb = refreshMonthAnalysisIfPossible(companyId, normalizedMonth);
    const updatedSnapshot = updatedDb.dataByCompany[companyId].months[normalizedMonth];

    return res.json({
      companyId,
      month: normalizedMonth,
      execution,
      validation,
      snapshot: updatedSnapshot,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible procesar la ejecución.' });
  }
});

app.get('/api/execution/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { companyData } = getCompanyData(db, companyId);
    const snapshot = companyData.months[month] || null;

    if (!snapshot.execution) {
      return res.status(404).json({ error: 'No hay ejecución cargada para este mes.' });
    }

    return res.json({
      companyId,
      month,
      execution: snapshot.execution,
      validation: snapshot.executionValidation || { errors: [], warnings: [] },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/budget/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar un archivo de presupuesto.' });
    }

    const parsed = parseUploadedFile(req.file);
    const fileId = crypto.randomUUID();

    uploadedBudgetFiles.set(fileId, {
      name: req.file.originalname,
      rows: parsed.rows,
      headers: parsed.headers,
      uploadedAt: Date.now(),
    });

    return res.json({
      fileId,
      fileName: req.file.originalname,
      headers: parsed.headers,
      previewRows: parsed.previewRows,
      totalRows: parsed.rows.length,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible leer el archivo de presupuesto.' });
  }
});

app.post('/api/budget/preview', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { company, companyData } = getCompanyData(db, companyId);
    const { fileId, mapping, month } = req.body;
    const normalizedMonth = ensureMonth(month);
    assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar el presupuesto del mes');

    if (!fileId || !uploadedBudgetFiles.has(fileId)) {
      return res.status(400).json({ error: 'Archivo de presupuesto no encontrado.' });
    }

    const uploaded = uploadedBudgetFiles.get(fileId);
    const rows = parseBudgetRowsFromFile(uploaded.rows, mapping || {});
    const budget = buildBudgetDataset(rows, uploaded.name);
    const validation = validateBudgetRows(budget.rows);
    const existingMonthSnapshot = companyData.months?.[normalizedMonth] || null;
    const conflict = Boolean(existingMonthSnapshot?.budget);

    const preview = buildBudgetPreviewSummary({
      rows: uploaded.rows,
      mapping,
      headers: uploaded.headers,
      validation,
      parsedRows: rows,
      conflict,
      companyName: company.name,
      month: normalizedMonth,
      fileName: uploaded.name,
    });

    return res.json({
      companyId,
      month: normalizedMonth,
      fileId,
      preview,
      canSave: preview.errors.length === 0,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible validar el presupuesto.' });
  }
});

app.post('/api/budget/process', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { company, companyData } = getCompanyData(db, companyId);

    const { fileId, mapping, month, forceReplace } = req.body;
    const normalizedMonth = ensureMonth(month);
    assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar el presupuesto del mes');

    if (!fileId || !uploadedBudgetFiles.has(fileId)) {
      return res.status(400).json({ error: 'Archivo de presupuesto no encontrado.' });
    }

    const currentSnapshot = companyData.months[normalizedMonth] || {};
    if (currentSnapshot.budget && !forceReplace) {
      return res.status(409).json({
        conflict: true,
        error: 'Ya existe presupuesto para este mes y empresa. ?Deseas reemplazarlo',
      });
    }

    const uploaded = uploadedBudgetFiles.get(fileId);
    const rows = parseBudgetRowsFromFile(uploaded.rows, mapping || {});
    const budget = buildBudgetDataset(rows, uploaded.name);
    const validation = validateBudgetRows(budget.rows);

    if (validation.errors.length) {
      return res.status(400).json({ error: 'El presupuesto tiene errores de validaci?n.', validation });
    }

    withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      const snapshot = mutableCompanyData.months[normalizedMonth] || {};

      mutableCompanyData.months[normalizedMonth] = {
        ...snapshot,
        month: normalizedMonth,
        budget: {
          ...budget,
          sourceFileName: uploaded.name,
          uploadedAt: new Date().toISOString(),
        },
        budgetValidation: validation,
        updatedAt: new Date().toISOString(),
      };

      const loadInfo = upsertLoadRecord(mutableCompanyData, {
        type: 'presupuesto',
        month: normalizedMonth,
        fileName: uploaded.name,
      });

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month: normalizedMonth,
        eventType: loadInfo.replacedRecordId ? 'replace_presupuesto' : 'upload_presupuesto',
        dataType: 'presupuesto',
        fileName: uploaded.name,
        rowsRead: uploaded.rows.length,
        rowsProcessed: budget.rows.length,
        resultStatus: validation.warnings.length ? 'con_alertas' : 'exitoso',
        messageSummary: 'Presupuesto guardado correctamente.',
        alertsDetected: validation.warnings,
        replacedRecordId: loadInfo.replacedRecordId,
      });

      return currentDb;
    });

    const updatedDb = refreshMonthAnalysisIfPossible(companyId, normalizedMonth);
    const updatedSnapshot = updatedDb.dataByCompany[companyId].months[normalizedMonth];

    return res.json({
      companyId,
      month: normalizedMonth,
      budget: updatedSnapshot.budget,
      validation,
      snapshot: updatedSnapshot,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible procesar el presupuesto.' });
  }
});

app.post('/api/budget/save', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);

    const { month, items, forceReplace } = req.body;
    const normalizedMonth = ensureMonth(month);

    const { company, companyData } = getCompanyData(db, companyId);
    assertMonthOpen(companyData, normalizedMonth, 'editar el presupuesto del mes');
    const currentSnapshot = companyData.months[normalizedMonth] || {};
    if (currentSnapshot.budget && !forceReplace) {
      return res.status(409).json({
        conflict: true,
        error: 'Ya existe presupuesto para este mes y empresa. ?Deseas reemplazarlo',
      });
    }

    const budget = buildBudgetDataset(items || [], 'manual');
    const validation = validateBudgetRows(budget.rows);

    if (validation.errors.length) {
      return res.status(400).json({ error: 'El presupuesto tiene errores de validaci?n.', validation });
    }

    withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      const snapshot = mutableCompanyData.months[normalizedMonth] || {};

      mutableCompanyData.months[normalizedMonth] = {
        ...snapshot,
        month: normalizedMonth,
        budget: {
          ...budget,
          sourceFileName: 'manual',
          uploadedAt: new Date().toISOString(),
        },
        budgetValidation: validation,
        updatedAt: new Date().toISOString(),
      };

      const loadInfo = upsertLoadRecord(mutableCompanyData, {
        type: 'presupuesto',
        month: normalizedMonth,
        fileName: 'manual',
      });

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month: normalizedMonth,
        eventType: loadInfo.replacedRecordId ? 'replace_presupuesto' : 'upload_presupuesto',
        dataType: 'presupuesto',
        fileName: 'manual',
        rowsRead: budget.rows.length,
        rowsProcessed: budget.rows.length,
        resultStatus: 'exitoso',
        messageSummary: 'Presupuesto manual guardado correctamente.',
        alertsDetected: validation.warnings || [],
        replacedRecordId: loadInfo.replacedRecordId,
      });

      return currentDb;
    });

    const updatedDb = refreshMonthAnalysisIfPossible(companyId, normalizedMonth);
    const updatedSnapshot = updatedDb.dataByCompany[companyId].months[normalizedMonth];

    return res.json({
      companyId,
      month: normalizedMonth,
      budget: updatedSnapshot.budget,
      validation,
      snapshot: updatedSnapshot,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible guardar el presupuesto.' });
  }
});

app.get('/api/budget/template', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.query.month);
    const { company } = getCompanyData(db, companyId);
    const templateRows = buildBudgetTemplate();
    const buffer = createBudgetTemplateWorkbookBuffer({
      companyName: company.name,
      month,
      templateRows,
    });

    const safeCompanyName = company.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-presupuesto-${safeCompanyName}-${month}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible generar la plantilla de presupuesto.' });
  }
});

app.get('/api/budget/template/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { company } = getCompanyData(db, companyId);
    const templateRows = buildBudgetTemplate();
    const buffer = createBudgetTemplateWorkbookBuffer({
      companyName: company.name,
      month,
      templateRows,
    });

    const safeCompanyName = company.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-presupuesto-${safeCompanyName}-${month}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible generar la plantilla de presupuesto.' });
  }
});

app.get('/api/budget/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { companyData } = getCompanyData(db, companyId);
    const snapshot = companyData.months[month] || null;
    const budget = snapshot?.budget?.contable
      ? snapshot.budget
      : buildBudgetDataset(snapshot?.budget?.rows || buildBudgetTemplate(), snapshot?.budget?.sourceFileName || null);

    return res.json({
      companyId,
      month,
      budget,
      validation: snapshot?.budgetValidation || { errors: [], warnings: [] },
      monthStatus: getMonthStatusPayload(companyData, month),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/budget/duplicate', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { month, sourceMonth, forceReplace } = req.body;
    const normalizedMonth = ensureMonth(month);
    const { company, companyData } = getCompanyData(db, companyId);

    assertMonthOpen(companyData, normalizedMonth, 'duplicar el presupuesto del mes');

    const resolvedSourceMonth = sourceMonth
      ? ensureMonth(sourceMonth)
      : findPreviousBudgetMonth(companyData, normalizedMonth);

    if (!resolvedSourceMonth) {
      return res.status(400).json({ error: 'No existe presupuesto previo para duplicar.' });
    }

    if (resolvedSourceMonth === normalizedMonth) {
      return res.status(400).json({ error: 'No puedes duplicar presupuesto desde el mismo mes.' });
    }

    const sourceSnapshot = companyData.months?.[resolvedSourceMonth];
    if (!sourceSnapshot.budget.rows.length) {
      return res.status(400).json({ error: 'No existe presupuesto previo para duplicar.' });
    }

    const currentSnapshot = companyData.months[normalizedMonth] || {};
    if (currentSnapshot.budget && !forceReplace) {
      return res.status(409).json({
        conflict: true,
        error: 'Ya existe presupuesto en el mes destino. ?Deseas reemplazarlo',
      });
    }

    const duplicatedRows = sourceSnapshot.budget.rows.map((row) => ({
      detailKey: row.detailKey,
      lineKey: row.lineKey,
      lineLabel: row.lineLabel,
      subgroup: row.subgroup,
      budget: Number(row.budget || 0),
      comment: String(row.comment || ''),
    }));
    const duplicatedBudget = buildBudgetDataset(duplicatedRows, 'duplicado de ' + resolvedSourceMonth);

    withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      const destinationSnapshot = mutableCompanyData.months[normalizedMonth] || {};

      mutableCompanyData.months[normalizedMonth] = {
        ...destinationSnapshot,
        month: normalizedMonth,
        budget: {
          ...duplicatedBudget,
          sourceFileName: 'duplicado de ' + resolvedSourceMonth,
          uploadedAt: new Date().toISOString(),
          duplicatedFromMonth: resolvedSourceMonth,
        },
        budgetValidation: { errors: [], warnings: [] },
        updatedAt: new Date().toISOString(),
      };

      const loadInfo = upsertLoadRecord(mutableCompanyData, {
        type: 'presupuesto',
        month: normalizedMonth,
        fileName: 'duplicado de ' + resolvedSourceMonth,
      });

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month: normalizedMonth,
        eventType: 'duplicate_budget',
        dataType: 'presupuesto',
        fileName: 'duplicado de ' + resolvedSourceMonth,
        rowsRead: duplicatedRows.length,
        rowsProcessed: duplicatedRows.length,
        resultStatus: 'exitoso',
        messageSummary: 'Presupuesto duplicado correctamente de ' + resolvedSourceMonth + ' a ' + normalizedMonth + '.',
        alertsDetected: [
          'origen:' + resolvedSourceMonth,
          'destino:' + normalizedMonth,
          'reemplazo:' + (loadInfo.replacedRecordId ? 'si' : 'no'),
        ],
        replacedRecordId: loadInfo.replacedRecordId,
      });

      return currentDb;
    });

    const updatedDb = refreshMonthAnalysisIfPossible(companyId, normalizedMonth);
    const updatedSnapshot = updatedDb.dataByCompany[companyId].months[normalizedMonth];

    return res.json({
      companyId,
      sourceMonth: resolvedSourceMonth,
      month: normalizedMonth,
      budget: updatedSnapshot.budget,
      monthStatus: getMonthStatusPayload(updatedDb.dataByCompany[companyId], normalizedMonth),
      message: 'Presupuesto duplicado correctamente de ' + resolvedSourceMonth + ' a ' + normalizedMonth + '.',
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible duplicar el presupuesto.' });
  }
});

app.post('/api/month-status/:month/close', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const managerialComment = String(req.body.managerialComment || '').trim();
    const { company, companyData } = getCompanyData(db, companyId);

    if (!managerialComment) {
      return res.status(400).json({ error: 'Debes ingresar un comentario gerencial antes de cerrar el mes.' });
    }

    const updated = withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      const monthStatus = closeMonth(mutableCompanyData, month, managerialComment);

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month,
        eventType: 'close_month',
        dataType: 'cierre_mes',
        resultStatus: 'exitoso',
        messageSummary: `Mes ${month} cerrado correctamente.`,
        alertsDetected: [managerialComment],
      });

      return currentDb;
    });

    return res.json({
      companyId,
      month,
      monthStatus: getMonthStatusPayload(updated.dataByCompany[companyId], month),
      message: `Mes ${month} cerrado correctamente.`,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cerrar el mes.' });
  }
});

app.post('/api/month-status/:month/reopen', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { company } = getCompanyData(db, companyId);

    const updated = withDb((currentDb) => {
      const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
      reopenMonth(mutableCompanyData, month);

      pushAuditLog(currentDb, companyId, {
        companyName: company.name,
        month,
        eventType: 'reopen_month',
        dataType: 'cierre_mes',
        resultStatus: 'exitoso',
        messageSummary: `Mes ${month} reabierto correctamente.`,
        alertsDetected: [],
      });

      return currentDb;
    });

    return res.json({
      companyId,
      month,
      monthStatus: getMonthStatusPayload(updated.dataByCompany[companyId], month),
      message: `Mes ${month} reabierto correctamente.`,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible reabrir el mes.' });
  }
});

app.get('/api/month-notes/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { companyData } = getCompanyData(db, companyId);
    return res.json({ companyId, month, notes: companyData.monthlyNotes?.[month] || [] });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar observaciones.' });
  }
});

app.post('/api/month-notes/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);

    const id = String(req.body.id || '').trim();
    const author = String(req.body.author || '').trim() || 'Gerencia';
    const textObservation = String(req.body.textObservation || '').trim();
    if (!textObservation) {
      return res.status(400).json({ error: 'La observación no puede estar vacía.' });
    }

    const updated = withDb((current) => {
      const { companyData } = getCompanyData(current, companyId);
      companyData.monthlyNotes = companyData.monthlyNotes || {};
      const notes = Array.isArray(companyData.monthlyNotes[month]) ? companyData.monthlyNotes[month] : [];

      if (id) {
        const idx = notes.findIndex((item) => item.id === id);
        if (idx >= 0) {
          notes[idx] = {
            ...notes[idx],
            author,
            textObservation,
            dateTime: new Date().toISOString(),
          };
        }
      } else {
        notes.unshift({
          id: crypto.randomUUID(),
          companyId,
          month,
          author,
          textObservation,
          dateTime: new Date().toISOString(),
        });
      }

      companyData.monthlyNotes[month] = notes;
      return current;
    });

    return res.json({ companyId, month, notes: updated.dataByCompany[companyId].monthlyNotes[month] || [] });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible guardar la observación.' });
  }
});

app.delete('/api/month-notes/:month/:id', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const noteId = String(req.params.id || '').trim();
    if (!noteId) {
      return res.status(400).json({ error: 'Id de observación inválido.' });
    }

    const updated = withDb((current) => {
      const { company, companyData } = getCompanyData(current, companyId);
      companyData.monthlyNotes = companyData.monthlyNotes || {};
      const notes = Array.isArray(companyData.monthlyNotes[month]) ? companyData.monthlyNotes[month] : [];
      const idx = notes.findIndex((item) => String(item.id || '').trim() === noteId);
      if (idx < 0) {
        throw new Error('Observación no encontrada.');
      }

      notes.splice(idx, 1);
      companyData.monthlyNotes[month] = notes;

      pushAuditLog(current, companyId, {
        companyName: company.name,
        month,
        eventType: 'delete_month_note',
        dataType: 'observación',
        fileName: null,
        rowsRead: 1,
        rowsProcessed: 1,
        resultStatus: 'exitoso',
        messageSummary: `Observación eliminada: ${noteId}`,
        alertsDetected: [noteId],
      });

      return current;
    });

    return res.json({ companyId, month, notes: updated.dataByCompany[companyId].monthlyNotes[month] || [] });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible eliminar la observación.' });
  }
});

app.get('/api/month-actions/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { companyData } = getCompanyData(db, companyId);
    return res.json({ companyId, month, actions: companyData.monthlyActions?.[month] || [] });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar acciones.' });
  }
});

app.post('/api/month-actions/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);

    const payload = {
      id: String(req.body.id || '').trim(),
      linePyg: String(req.body.linePyg || '').trim(),
      problemDetected: String(req.body.problemDetected || '').trim(),
      actionDefined: String(req.body.actionDefined || '').trim(),
      responsible: String(req.body.responsible || '').trim(),
      priority: ['Alta', 'Media', 'Baja'].includes(req.body.priority) ? req.body.priority : 'Media',
      dueDate: String(req.body.dueDate || '').trim(),
      status: ['pendiente', 'en_proceso', 'cerrada'].includes(req.body.status) ? req.body.status : 'pendiente',
    };

    if (!payload.linePyg || !payload.problemDetected || !payload.actionDefined || !payload.responsible) {
      return res.status(400).json({ error: 'Completa línea P&G, problema, acción y responsable.' });
    }

    let updatedExisting = false;
    const updated = withDb((current) => {
      const { companyData } = getCompanyData(current, companyId);
      companyData.monthlyActions = companyData.monthlyActions || {};
      const actions = Array.isArray(companyData.monthlyActions[month]) ? companyData.monthlyActions[month] : [];

      if (payload.id) {
        const idx = actions.findIndex((item) => item.id === payload.id);
        if (idx >= 0) {
          updatedExisting = true;
          actions[idx] = {
            ...actions[idx],
            ...payload,
            dateTime: new Date().toISOString(),
          };
        } else {
          throw new Error('Acción no encontrada para actualizar.');
        }
      } else {
        const { id, ...createPayload } = payload;
        actions.unshift({
          id: crypto.randomUUID(),
          companyId,
          month,
          ...createPayload,
          dateTime: new Date().toISOString(),
        });
      }

      companyData.monthlyActions[month] = actions;
      return current;
    });

    return res.json({
      companyId,
      month,
      updatedExisting,
      actions: updated.dataByCompany[companyId].monthlyActions[month] || [],
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible guardar la acción.' });
  }
});

app.delete('/api/month-actions/:month/:id', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const actionId = String(req.params.id || '').trim();
    if (!actionId) {
      return res.status(400).json({ error: 'Id de acción inválido.' });
    }

    const updated = withDb((current) => {
      const { company, companyData } = getCompanyData(current, companyId);
      companyData.monthlyActions = companyData.monthlyActions || {};
      const actions = Array.isArray(companyData.monthlyActions[month]) ? companyData.monthlyActions[month] : [];
      const idx = actions.findIndex((item) => String(item.id || '').trim() === actionId);
      if (idx < 0) {
        throw new Error('Acción no encontrada.');
      }

      actions.splice(idx, 1);
      companyData.monthlyActions[month] = actions;

      pushAuditLog(current, companyId, {
        companyName: company.name,
        month,
        eventType: 'delete_month_action',
        dataType: 'acción',
        fileName: null,
        rowsRead: 1,
        rowsProcessed: 1,
        resultStatus: 'exitoso',
        messageSummary: `Acción eliminada: ${actionId}`,
        alertsDetected: [actionId],
      });

      return current;
    });

    return res.json({ companyId, month, actions: updated.dataByCompany[companyId].monthlyActions[month] || [] });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible eliminar la acción.' });
  }
});

app.get('/api/analysis/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);

    const updatedDb = buildOrRefreshAnalysis(companyId, month);
    const { companyData } = getCompanyData(updatedDb, companyId);
    const snapshot = companyData.months[month];

    return res.json({
      companyId,
      month,
      execution: snapshot.execution,
      budget: snapshot.budget || { rows: buildBudgetTemplate(), sourceFileName: null },
      comparison: snapshot.comparison,
      analysis: snapshot.analysis,
      lineSettings: toLineSettingsArray(companyData.lineSettings),
      notes: companyData.monthlyNotes?.[month] || [],
      actions: companyData.monthlyActions?.[month] || [],
      monthStatus: getMonthStatusPayload(companyData, month),
      validations: {
        execution: snapshot.executionValidation || { errors: [], warnings: [] },
        budget: snapshot.budgetValidation || { errors: [], warnings: [] },
      },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible generar análisis mensual.' });
  }
});

app.get('/api/executive/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);

    const refreshedDb = buildOrRefreshAnalysis(companyId, month);
    const { company, companyData } = getCompanyData(refreshedDb, companyId);
    const snapshot = companyData.months[month];

    if (!snapshot.comparison) {
      return res.status(404).json({ error: 'No hay comparativo disponible para el tablero ejecutivo.' });
    }

    const trend = buildTrendForCompany(companyData);
    const board = buildExecutiveBoard(company.name, month, snapshot, trend);

    return res.json({ companyId, month, board });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible cargar el tablero ejecutivo.' });
  }
});

app.get('/api/history/trend', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { companyData } = getCompanyData(db, companyId);
    const trend = buildTrendForCompany(companyData);

    return res.json({ companyId, trend });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No fue posible cargar histórico.' });
  }
});

app.delete('/api/data', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const { company } = getCompanyData(db, companyId);
    const month = ensureMonth(req.query.month || req.body.month);
    const type = String(req.query.type || req.body.type || '').trim();

    if (!['ejecución', 'presupuesto', 'all'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de borrado inválido. Usa ejecución, presupuesto o all.' });
    }

    const { companyData: validationCompanyData } = getCompanyData(db, companyId);
    assertMonthOpen(validationCompanyData, month, 'modificar la información base del mes');

    const updatedDb = withDb((currentDb) => {
      const { companyData } = getCompanyData(currentDb, companyId);
      const snapshot = companyData.months[month];
      if (!snapshot) {
        throw new Error('No existe información para ese mes en la empresa seleccionada.');
      }

      if (type === 'all' || type === 'ejecución') {
        if (snapshot.execution) {
          pushAuditLog(currentDb, companyId, {
            companyName: company.name,
            month,
            eventType: 'delete_ejecución',
            dataType: 'ejecución',
            fileName: snapshot.execution.sourceFileName || null,
            rowsRead: snapshot.execution.baseRows.length || 0,
            rowsProcessed: 0,
            resultStatus: 'exitoso',
            messageSummary: 'Ejecucion eliminada.',
            alertsDetected: [],
          });
        }
        delete snapshot.execution;
        delete snapshot.executionValidation;
      }

      if (type === 'all' || type === 'presupuesto') {
        if (snapshot.budget) {
          pushAuditLog(currentDb, companyId, {
            companyName: company.name,
            month,
            eventType: 'delete_presupuesto',
            dataType: 'presupuesto',
            fileName: snapshot.budget.sourceFileName || null,
            rowsRead: snapshot.budget.rows.length || 0,
            rowsProcessed: 0,
            resultStatus: 'exitoso',
            messageSummary: 'Presupuesto eliminado.',
            alertsDetected: [],
          });
        }
        delete snapshot.budget;
        delete snapshot.budgetValidation;
      }

      delete snapshot.comparison;
      delete snapshot.analysis;

      if (type === 'all') {
        companyData.loads = companyData.loads.filter((item) => item.month !== month);
      } else {
        companyData.loads = companyData.loads.filter((item) => !(item.month === month && item.type === type));
      }

      if (!snapshot.execution && !snapshot.budget) {
        delete companyData.months[month];
      }

      return currentDb;
    });

    const stillExists = updatedDb.dataByCompany[companyId].months?.[month];
    if (stillExists?.execution) {
      buildOrRefreshAnalysis(companyId, month);
    }

    return res.json({ companyId, month, type, ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible borrar la información.' });
  }
});

app.get('/api/export/:month', (req, res) => {
  try {
    const db = readDb();
    const companyId = resolveCompanyId(req, db);
    const month = ensureMonth(req.params.month);
    const { company } = getCompanyData(db, companyId);
    const snapshot = getMonthSnapshot(companyId, month);

    if (!snapshot.execution || !snapshot.comparison || !snapshot.analysis) {
      return res.status(404).json({ error: 'No hay información suficiente para exportar ese mes.' });
    }

    const workbookBuffer = createWorkbookBuffer(snapshot);
    const safeCompanyName = company.name.replace(/[^a-zA-Z0-9-_]/g, '_');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="control-presupuestal-${safeCompanyName}-${month}.xlsx"`);
    return res.send(workbookBuffer);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No fue posible exportar el reporte.' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`P&G Control V2 disponible en http://localhost:${PORT}`);
});



