const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  readDb,
  withDb,
} = require('../services/storage-service');
const {
  ensureAuthState,
  normalizeEmail,
  verifyPassword,
  createAdminUser,
  updateUserIdentity,
  updateUserPassword,
  createSession,
  revokeSessionByToken,
  revokeUserSessions,
  registerSuccessfulLogin,
  verifyTotpCode,
  startMfaEnrollment,
  confirmMfaEnrollment,
  cancelMfaEnrollment,
  disableMfaWithCode,
} = require('../services/auth-service');
const { recordSecurityAudit } = require('../services/security-audit-pg');
const { pgHealthCheck } = require('../db/pg-pool');
const { AUTH_SETUP_TOKEN, DATABASE_URL } = require('../http/env');
const {
  getSessionTokenFromRequest,
  setSessionCookie,
  clearSessionCookie,
  getClientIp,
  safeCompareText,
  resolveSetupMode,
  authThrottle,
  buildAuthPayload,
  requireAuthenticatedApi,
  isPublicApiPath,
} = require('../http/auth-http');

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const mfaChallenges = new Map();

function pruneMfaChallenges() {
  const now = Date.now();
  for (const [id, row] of mfaChallenges.entries()) {
    if (row.expiresAt < now) {
      mfaChallenges.delete(id);
    }
  }
}

function createMfaChallenge(userId) {
  pruneMfaChallenges();
  const id = crypto.randomBytes(24).toString('hex');
  mfaChallenges.set(id, { userId, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS });
  return id;
}

function peekMfaChallenge(id) {
  pruneMfaChallenges();
  const row = mfaChallenges.get(String(id || '').trim());
  if (!row || row.expiresAt < Date.now()) {
    return null;
  }
  return row;
}

function takeMfaChallenge(id) {
  const row = peekMfaChallenge(id);
  if (row) {
    mfaChallenges.delete(String(id || '').trim());
  }
  return row;
}

function verifyCsrfForSession(req) {
  const csrfToken = String(req.headers['x-csrf-token'] || '').trim();
  return Boolean(req.auth?.session?.csrfToken && csrfToken === req.auth.session.csrfToken);
}

function registerMetaAuthRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'pg-control-v2',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.get('/api/ready', async (req, res) => {
    try {
      readDb();
      const pg = await pgHealthCheck();
      if (DATABASE_URL && pg.configured && !pg.ok) {
        return res.status(503).json({
          ok: false,
          jsonDb: true,
          postgres: { ok: false, detail: pg.error || 'unavailable' },
        });
      }
      return res.json({
        ok: true,
        jsonDb: true,
        postgres: pg.configured
          ? { ok: pg.ok, detail: pg.error || null }
          : { ok: null, detail: 'not_configured' },
      });
    } catch (error) {
      return res.status(503).json({ ok: false, error: error.message || 'not_ready' });
    }
  });

  app.get('/api/openapi.json', (req, res) => {
    const specPath = path.join(__dirname, '..', '..', 'openapi.json');
    if (!fs.existsSync(specPath)) {
      return res.status(404).json({ error: 'OpenAPI spec no encontrada.' });
    }
    res.type('application/json').send(fs.readFileSync(specPath, 'utf8'));
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

      recordSecurityAudit({
        eventType: 'initial_setup_complete',
        actorUserId: setupPayload.user.id,
        actorEmail: setupPayload.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
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
        recordSecurityAudit({
          eventType: 'login_failed',
          actorEmail: email || null,
          ipAddress: getClientIp(req),
          metadata: { reason: 'bad_credentials' },
        });
        return res.status(401).json({ error: 'Credenciales invalidas.' });
      }

      if (user.mfaEnabled) {
        const mfaChallengeId = createMfaChallenge(user.id);
        recordSecurityAudit({
          eventType: 'login_mfa_challenge',
          actorUserId: user.id,
          actorEmail: user.email,
          ipAddress: getClientIp(req),
          metadata: {},
        });
        return res.json({
          mfaRequired: true,
          mfaChallengeId,
          message: 'Ingresa el codigo de tu aplicacion de autenticacion.',
        });
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

      recordSecurityAudit({
        eventType: 'login_success',
        actorUserId: loginPayload.user.id,
        actorEmail: loginPayload.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
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

  app.post('/api/auth/mfa/verify-login', authThrottle, (req, res) => {
    try {
      const mfaChallengeId = String(req.body?.mfaChallengeId || '').trim();
      const code = String(req.body?.code || '').trim();
      const challenge = peekMfaChallenge(mfaChallengeId);
      if (!challenge) {
        return res.status(400).json({ error: 'El desafio MFA expiro. Inicia sesion de nuevo.' });
      }

      const db = readDb();
      const authState = ensureAuthState(db);
      const user = authState.users.find((item) => item.id === challenge.userId) || null;
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        takeMfaChallenge(mfaChallengeId);
        return res.status(400).json({ error: 'Cuenta MFA invalida.' });
      }

      if (!verifyTotpCode(user.mfaSecret, code)) {
        recordSecurityAudit({
          eventType: 'mfa_verify_failed',
          actorUserId: user.id,
          actorEmail: user.email,
          ipAddress: getClientIp(req),
          metadata: {},
        });
        return res.status(401).json({ error: 'Codigo MFA incorrecto.' });
      }

      takeMfaChallenge(mfaChallengeId);

      let loginPayload = null;
      withDb((currentDb) => {
        const currentAuth = ensureAuthState(currentDb);
        const mutableUser = currentAuth.users.find((item) => item.id === user.id);
        if (!mutableUser || !mutableUser.mfaEnabled) {
          throw new Error('Cuenta MFA invalida.');
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

      recordSecurityAudit({
        eventType: 'login_success_mfa',
        actorUserId: loginPayload.user.id,
        actorEmail: loginPayload.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
      });

      setSessionCookie(res, loginPayload.rawToken);
      return res.json(buildAuthPayload(loginPayload.user, loginPayload.session, {
        message: 'Sesion iniciada correctamente.',
        setupRequired: false,
        setupMode: 'disabled',
      }));
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible validar MFA.' });
    }
  });

  app.post('/api/auth/mfa/begin-setup', (req, res) => {
    try {
      if (!req.auth?.user || !req.auth?.session) {
        return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
      }
      if (!verifyCsrfForSession(req)) {
        return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
      }

      let payload = null;
      withDb((currentDb) => {
        const data = startMfaEnrollment(currentDb, req.auth.user.id);
        payload = data;
        return currentDb;
      });

      return res.json({
        secret: payload.secret,
        otpauthUrl: payload.otpauthUrl,
        message: 'Escanea el codigo QR o ingresa el secreto en tu app de autenticacion.',
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible iniciar MFA.' });
    }
  });

  app.post('/api/auth/mfa/complete-setup', (req, res) => {
    try {
      if (!req.auth?.user || !req.auth?.session) {
        return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
      }
      if (!verifyCsrfForSession(req)) {
        return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
      }

      const code = String(req.body?.code || '').trim();
      if (!code) {
        return res.status(400).json({ error: 'Debes ingresar el codigo de verificacion.' });
      }

      withDb((currentDb) => {
        confirmMfaEnrollment(currentDb, req.auth.user.id, code);
        return currentDb;
      });

      recordSecurityAudit({
        eventType: 'mfa_enabled',
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
      });

      return res.json({ ok: true, message: 'MFA activado correctamente.' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible activar MFA.' });
    }
  });

  app.post('/api/auth/mfa/cancel-setup', (req, res) => {
    try {
      if (!req.auth?.user || !req.auth?.session) {
        return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
      }
      if (!verifyCsrfForSession(req)) {
        return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
      }

      withDb((currentDb) => {
        cancelMfaEnrollment(currentDb, req.auth.user.id);
        return currentDb;
      });

      return res.json({ ok: true, message: 'Configuracion MFA cancelada.' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible cancelar MFA.' });
    }
  });

  app.post('/api/auth/mfa/disable', (req, res) => {
    try {
      if (!req.auth?.user || !req.auth?.session) {
        return res.status(401).json({ error: 'Debes iniciar sesion para continuar.' });
      }
      if (!verifyCsrfForSession(req)) {
        return res.status(403).json({ error: 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.' });
      }

      const currentPassword = String(req.body?.currentPassword || '');
      const code = String(req.body?.code || '').trim();
      if (!currentPassword || !code) {
        return res.status(400).json({ error: 'Debes indicar contrasena actual y codigo MFA.' });
      }

      withDb((currentDb) => {
        const currentAuth = ensureAuthState(currentDb);
        const mutableUser = currentAuth.users.find((item) => item.id === req.auth.user.id);
        if (!mutableUser || !verifyPassword(currentPassword, mutableUser.passwordHash)) {
          throw new Error('La contrasena actual es incorrecta.');
        }
        disableMfaWithCode(currentDb, req.auth.user.id, code);
        return currentDb;
      });

      recordSecurityAudit({
        eventType: 'mfa_disabled',
        actorUserId: req.auth.user.id,
        actorEmail: req.auth.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
      });

      return res.json({ ok: true, message: 'MFA desactivado.' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible desactivar MFA.' });
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

      recordSecurityAudit({
        eventType: 'profile_updated',
        actorUserId: profilePayload.user.id,
        actorEmail: profilePayload.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
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

      recordSecurityAudit({
        eventType: 'password_changed',
        actorUserId: passwordPayload.user.id,
        actorEmail: passwordPayload.user.email,
        ipAddress: getClientIp(req),
        metadata: {},
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
    if (isPublicApiPath(req)) {
      return next();
    }
    return requireAuthenticatedApi(req, res, next);
  });
}

module.exports = {
  registerMetaAuthRoutes,
};
