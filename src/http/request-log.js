const crypto = require('crypto');
const { LOG_HTTP } = require('./env');

function logLine(payload) {
  if (!LOG_HTTP) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function requestLogMiddleware(req, res, next) {
  req.requestId = crypto.randomUUID();
  const start = Date.now();
  res.on('finish', () => {
    logLine({
      level: 'http',
      requestId: req.requestId,
      method: req.method,
      path: String(req.originalUrl || req.url || '').split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 120),
    });
  });
  next();
}

module.exports = { requestLogMiddleware, logLine };
