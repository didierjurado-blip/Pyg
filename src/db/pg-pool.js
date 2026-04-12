const { DATABASE_URL } = require('../http/env');

let pool;

function getPgPool() {
  if (!DATABASE_URL) {
    return null;
  }
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 8,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

async function pgHealthCheck() {
  if (!DATABASE_URL) {
    return { ok: true, configured: false };
  }
  const client = getPgPool();
  if (!client) {
    return { ok: false, configured: true, error: 'pool_unavailable' };
  }
  try {
    const r = await client.query('select 1 as v');
    return { ok: r.rows[0]?.v === 1, configured: true };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

module.exports = { getPgPool, pgHealthCheck };
