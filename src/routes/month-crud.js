const crypto = require('crypto');
const { readDb, withDb, getCompanyData } = require('../services/storage-service');
const { ensureMonth } = require('../utils/date-utils');
const { closeMonth, reopenMonth } = require('../services/month-service');
const {
  resolveCompanyId,
  pushAuditLog,
  getMonthStatusPayload,
} = require('../http/route-helpers');
const { requireMinRole } = require('../http/auth-http');

function registerMonthCrudRoutes(app) {
  app.post('/api/month-status/:month/close', requireMinRole('editor'), (req, res) => {
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
        closeMonth(mutableCompanyData, month, managerialComment);

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

  app.post('/api/month-status/:month/reopen', requireMinRole('editor'), (req, res) => {
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

  app.post('/api/month-notes/:month', requireMinRole('editor'), (req, res) => {
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

  app.delete('/api/month-notes/:month/:id', requireMinRole('editor'), (req, res) => {
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

  app.post('/api/month-actions/:month', requireMinRole('editor'), (req, res) => {
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

  app.delete('/api/month-actions/:month/:id', requireMinRole('editor'), (req, res) => {
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
}

module.exports = { registerMonthCrudRoutes };
