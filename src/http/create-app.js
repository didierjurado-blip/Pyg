const path = require('path');
const express = require('express');
const multer = require('multer');
const { TRUST_PROXY } = require('./env');
const { securityHeaders } = require('./security-middleware');
const { requestLogMiddleware } = require('./request-log');
const { attachAuthContext, bootstrapInitialAdminFromEnv } = require('./auth-http');
const { registerMetaAuthRoutes } = require('../routes/meta-and-auth');
const { registerCompanyRoutes } = require('../routes/companies');
const { registerExecutionRoutes } = require('../routes/execution');
const { registerBudgetRoutes } = require('../routes/budget');
const { registerMonthCrudRoutes } = require('../routes/month-crud');
const { registerAnalysisExportRoutes } = require('../routes/analysis-export');

function createApp() {
  const app = express();

  if (TRUST_PROXY) {
    app.set('trust proxy', TRUST_PROXY === 'true' ? 1 : TRUST_PROXY);
  }

  app.use(securityHeaders);
  app.use(requestLogMiddleware);
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', attachAuthContext);
  app.use(
    express.static(path.join(__dirname, '..', '..', 'public'), {
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

  registerMetaAuthRoutes(app);
  registerCompanyRoutes(app);

  const upload = multer({ storage: multer.memoryStorage() });
  registerExecutionRoutes(app, upload);
  registerBudgetRoutes(app, upload);
  registerMonthCrudRoutes(app);
  registerAnalysisExportRoutes(app);

  return app;
}

module.exports = { createApp };
