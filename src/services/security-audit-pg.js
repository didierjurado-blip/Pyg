const crypto = require('crypto');
const { getPgPool } = require('../db/pg-pool');

function recordSecurityAudit(event) {
  const pool = getPgPool();
  if (!pool) {
    return;
  }
  const row = {
    id: event.id || crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    event_type: String(event.eventType || 'event').slice(0, 120),
    actor_user_id: event.actorUserId ? String(event.actorUserId).slice(0, 80) : null,
    actor_email: event.actorEmail ? String(event.actorEmail).slice(0, 200) : null,
    ip_address: event.ipAddress ? String(event.ipAddress).slice(0, 120) : null,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
  };

  pool
    .query(
      `insert into security_audit (id, occurred_at, event_type, actor_user_id, actor_email, ip_address, metadata)
       values ($1, $2::timestamptz, $3, $4, $5, $6, $7::jsonb)`,
      [
        row.id,
        row.occurred_at,
        row.event_type,
        row.actor_user_id,
        row.actor_email,
        row.ip_address,
        JSON.stringify(row.metadata),
      ]
    )
    .catch(() => {
      /* evita tumbar peticiones HTTP si falla auditoría en PG */
    });
}

module.exports = { recordSecurityAudit };
