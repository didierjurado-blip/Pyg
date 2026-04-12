const crypto = require('crypto');
const { buildBudgetTemplate } = require('../services/budget-service');
const {
  createWorkbookBuffer,
  createAccumulatedWorkbookBuffer,
  createConsolidatedWorkbookBuffer,
} = require('../services/export-service');
const { readDb, withDb, getCompanyData } = require('../services/storage-service');
const { ensureMonth } = require('../utils/date-utils');
const { toLineSettingsArray } = require('../services/line-settings-service');
const { buildConsolidatedDataset, buildConsolidatedYtdDataset, buildEliminationScopeKey } = require('../services/consolidation-service');
const { assertMonthOpen } = require('../services/month-service');
const {
  resolveCompanyId,
  pushAuditLog,
  getMonthSnapshot,
  getAccumulatedSnapshot,
  normalizeEliminationPayload,
  buildTrendForCompany,
  buildExecutiveBoard,
  buildOrRefreshAnalysis,
  getMonthStatusPayload,
} = require('../http/route-helpers');
const { requireMinRole } = require('../http/auth-http');

function registerAnalysisExportRoutes(app) {
  app.get('/api/analysis/:month', (req, res) => {
    try {
      const companyId = resolveCompanyId(req, readDb());
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

  app.get('/api/accumulated/:month', (req, res) => {
    try {
      const db = readDb();
      const companyId = resolveCompanyId(req, db);
      const month = ensureMonth(req.params.month);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const dataset = getAccumulatedSnapshot(companyId, month, includeBudget);

      return res.json(dataset);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible generar el acumulado.' });
    }
  });

  app.get('/api/consolidated/ytd/:cutoffMonth', (req, res) => {
    try {
      const db = readDb();
      const cutoffMonth = ensureMonth(req.params.cutoffMonth);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const view = ['contable', 'gerencial'].includes(String(req.query.view || '').trim()) ? String(req.query.view).trim() : 'gerencial';
      const groupId = String(req.query.groupId || '').trim();
      const companyIds = String(req.query.companyIds || '').split(',').map((item) => item.trim()).filter(Boolean);

      let resolvedCompanyIds = companyIds;
      if (groupId) {
        const group = (db.companyGroups || []).find((item) => item.id === groupId);
        if (!group) {
          return res.status(404).json({ error: 'Grupo empresarial no encontrado.' });
        }
        resolvedCompanyIds = group.companyIds;
      }

      const dataset = buildConsolidatedYtdDataset({
        db,
        companyIds: resolvedCompanyIds,
        cutoffMonth,
        includeBudget,
        view,
        groupId: groupId || null,
      });

      return res.json({
        ...dataset,
        groupId: groupId || null,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible generar el consolidado YTD.' });
    }
  });

  app.get('/api/consolidated/:month', (req, res) => {
    try {
      const db = readDb();
      const month = ensureMonth(req.params.month);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const view = ['contable', 'gerencial'].includes(String(req.query.view || '').trim()) ? String(req.query.view).trim() : 'gerencial';
      const groupId = String(req.query.groupId || '').trim();
      const companyIds = String(req.query.companyIds || '').split(',').map((item) => item.trim()).filter(Boolean);

      let resolvedCompanyIds = companyIds;
      if (groupId) {
        const group = (db.companyGroups || []).find((item) => item.id === groupId);
        if (!group) {
          return res.status(404).json({ error: 'Grupo empresarial no encontrado.' });
        }
        resolvedCompanyIds = group.companyIds;
      }

      const dataset = buildConsolidatedDataset({
        db,
        companyIds: resolvedCompanyIds,
        month,
        includeBudget,
        view,
        groupId: groupId || null,
      });

      return res.json({
        ...dataset,
        groupId: groupId || null,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible generar el consolidado.' });
    }
  });

  app.get('/api/consolidation-eliminations/:month', (req, res) => {
    try {
      const db = readDb();
      const month = ensureMonth(req.params.month);
      const groupId = String(req.query.groupId || '').trim() || null;
      const companyIds = String(req.query.companyIds || '').split(',').map((item) => item.trim()).filter(Boolean);
      const scopeKey = buildEliminationScopeKey({ groupId, companyIds });
      const items = (db.consolidationEliminations || []).filter((item) => item.month === month && item.scopeKey === scopeKey);
      return res.json({ month, scopeKey, items });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible cargar las eliminaciones.' });
    }
  });

  app.post('/api/consolidation-eliminations', requireMinRole('editor'), (req, res) => {
    try {
      const db = withDb((current) => {
        const payload = normalizeEliminationPayload(req.body, current);
        const id = String(req.body?.id || '').trim();
        const now = new Date().toISOString();

        if (id) {
          const idx = current.consolidationEliminations.findIndex((item) => item.id === id);
          if (idx < 0) {
            throw new Error('Eliminación no encontrada.');
          }
          current.consolidationEliminations[idx] = {
            ...current.consolidationEliminations[idx],
            ...payload,
            updatedAt: now,
          };
        } else {
          current.consolidationEliminations.push({
            id: `elim-${crypto.randomUUID().slice(0, 8)}`,
            ...payload,
            createdAt: now,
            updatedAt: now,
          });
        }

        return current;
      });

      return res.status(201).json({ items: db.consolidationEliminations || [] });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible guardar la eliminación.' });
    }
  });

  app.delete('/api/consolidation-eliminations/:id', requireMinRole('editor'), (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const db = withDb((current) => {
        const exists = current.consolidationEliminations.some((item) => item.id === id);
        if (!exists) {
          throw new Error('Eliminación no encontrada.');
        }
        current.consolidationEliminations = current.consolidationEliminations.filter((item) => item.id !== id);
        return current;
      });

      return res.json({ items: db.consolidationEliminations || [] });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible eliminar la eliminación.' });
    }
  });

  app.delete('/api/data', requireMinRole('admin'), (req, res) => {
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

  app.get('/api/export-accumulated/:month', (req, res) => {
    try {
      const db = readDb();
      const companyId = resolveCompanyId(req, db);
      const month = ensureMonth(req.params.month);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const { company } = getCompanyData(db, companyId);
      const dataset = getAccumulatedSnapshot(companyId, month, includeBudget);
      const workbookBuffer = createAccumulatedWorkbookBuffer(dataset);
      const safeCompanyName = company.name.replace(/[^a-zA-Z0-9-_]/g, '_');

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="acumulado-${safeCompanyName}-${month}.xlsx"`);
      return res.send(workbookBuffer);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible exportar el acumulado.' });
    }
  });

  app.get('/api/export-consolidated/:month', (req, res) => {
    try {
      const db = readDb();
      const month = ensureMonth(req.params.month);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const view = ['contable', 'gerencial'].includes(String(req.query.view || '').trim()) ? String(req.query.view).trim() : 'gerencial';
      const groupId = String(req.query.groupId || '').trim();
      const companyIds = String(req.query.companyIds || '').split(',').map((item) => item.trim()).filter(Boolean);

      let resolvedCompanyIds = companyIds;
      let exportName = 'seleccion';
      if (groupId) {
        const group = (db.companyGroups || []).find((item) => item.id === groupId);
        if (!group) {
          return res.status(404).json({ error: 'Grupo empresarial no encontrado.' });
        }
        resolvedCompanyIds = group.companyIds;
        exportName = group.name.replace(/[^a-zA-Z0-9-_]/g, '_');
      }

      const dataset = buildConsolidatedDataset({
        db,
        companyIds: resolvedCompanyIds,
        month,
        includeBudget,
        view,
        groupId: groupId || null,
      });
      const workbookBuffer = createConsolidatedWorkbookBuffer(dataset);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="consolidado-${exportName}-${month}.xlsx"`);
      return res.send(workbookBuffer);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible exportar el consolidado.' });
    }
  });

  app.get('/api/export-consolidated-ytd/:cutoffMonth', (req, res) => {
    try {
      const db = readDb();
      const cutoffMonth = ensureMonth(req.params.cutoffMonth);
      const includeBudget = String(req.query.includeBudget || 'true').trim().toLowerCase() !== 'false';
      const view = ['contable', 'gerencial'].includes(String(req.query.view || '').trim()) ? String(req.query.view).trim() : 'gerencial';
      const groupId = String(req.query.groupId || '').trim();
      const companyIds = String(req.query.companyIds || '').split(',').map((item) => item.trim()).filter(Boolean);

      let resolvedCompanyIds = companyIds;
      let exportName = 'seleccion';
      if (groupId) {
        const group = (db.companyGroups || []).find((item) => item.id === groupId);
        if (!group) {
          return res.status(404).json({ error: 'Grupo empresarial no encontrado.' });
        }
        resolvedCompanyIds = group.companyIds;
        exportName = group.name.replace(/[^a-zA-Z0-9-_]/g, '_');
      }

      const dataset = buildConsolidatedYtdDataset({
        db,
        companyIds: resolvedCompanyIds,
        cutoffMonth,
        includeBudget,
        view,
        groupId: groupId || null,
      });
      const workbookBuffer = createConsolidatedWorkbookBuffer(dataset);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="consolidado-ytd-${exportName}-${cutoffMonth}.xlsx"`);
      return res.send(workbookBuffer);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No fue posible exportar el consolidado YTD.' });
    }
  });
}

module.exports = { registerAnalysisExportRoutes };
