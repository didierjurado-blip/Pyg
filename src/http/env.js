const TRUST_PROXY = String(process.env.TRUST_PROXY || '').trim();
const AUTH_COOKIE_SECURE = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true';
const AUTH_COOKIE_NAME = AUTH_COOKIE_SECURE ? '__Host-pgc_session' : 'pgc_session';
const AUTH_SETUP_TOKEN = String(process.env.AUTH_SETUP_TOKEN || '').trim();
const SAFE_API_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOG_HTTP = String(process.env.LOG_HTTP || 'true').trim().toLowerCase() !== 'false';
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const AUTH_SESSION_SLIDE_MINUTES = Math.max(1, Number(process.env.AUTH_SESSION_SLIDE_MINUTES || 5));

module.exports = {
  TRUST_PROXY,
  AUTH_COOKIE_SECURE,
  AUTH_COOKIE_NAME,
  AUTH_SETUP_TOKEN,
  SAFE_API_METHODS,
  LOG_HTTP,
  DATABASE_URL,
  AUTH_SESSION_SLIDE_MINUTES,
};
