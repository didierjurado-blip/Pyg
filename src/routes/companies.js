const crypto = require('crypto');
const { readDb, withDb, getCompanyData, defaultCompanyData } = require('../services/storage-service');
const {
  pushAuditLog,
  resolveCompanyId,
  normalizeCompanyGroupPayload,
  refreshCompanyAnalyses,
  getMonthStatusPayload,
} = require('../http/route-helpers');
const { buildActionsOverview } = require('../services/month-service');
const { ensureMonth } = require('../utils/date-utils');
const { toLineSettingsArray, normalizeLineSettings } = require('../services/line-settings-service');
const { requireMinRole } = require('../http/auth-http');

function registerCompanyRoutes(app) {
  app.get('/api/meta', (req, res) => {
    const { PYG_LINES } = require('../config/pyg-lines');
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

  app.post('/api/companies', requireMinRole('admin'), (req, res) => {
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

  app.delete('/api/companies/:companyId', requireMinRole('admin'), (req, res) => {
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

        current.companies = current.companies.filter((c) => c.id !== companyId);
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

  app.get('/api/company-groups', (req, res) => {
    const db = readDb();
    res.json({ groups: db.companyGroups || [] });
  });

  app.post('/api/company-groups', requireMinRole('admin'), (req, res) => {
    try {
      const db = withDb((current) => {
        const normalized = normalizeCompanyGroupPayload(req.body, current.companies.map((company) => company.id));
        const id = String(req.body?.id || '').trim();
        const now = new Date().toISOString();

        if (id) {
          const idx = current.companyGroups.findIndex((group) => group.id === id);
          if (idx < 0) {
            throw new Error('Grupo no encontrado.');
          }
          current.companyGroups[idx] = {
            ...current.companyGroups[idx],
            ...normalized,
            updatedAt: now,
          };
        } else {
          current.companyGroups.push({
            id: `grp-${crypto.randomUUID().slice(0, 8)}`,
            ...normalized,
            createdAt: now,
            updatedAt: now,
          });
        }

        return current;
      });

      return res.status(201).json({ groups: db.companyGroups || [] });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible guardar el grupo empresarial.' });
    }
  });

  app.delete('/api/company-groups/:groupId', requireMinRole('admin'), (req, res) => {
    try {
      const groupId = String(req.params.groupId || '').trim();
      const db = withDb((current) => {
        const exists = current.companyGroups.some((group) => group.id === groupId);
        if (!exists) {
          throw new Error('Grupo no encontrado.');
        }
        current.companyGroups = current.companyGroups.filter((group) => group.id !== groupId);
        return current;
      });

      return res.json({ groups: db.companyGroups || [] });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible eliminar el grupo empresarial.' });
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

  app.put('/api/settings/lines', requireMinRole('editor'), (req, res) => {
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
}

module.exports = { registerCompanyRoutes };
