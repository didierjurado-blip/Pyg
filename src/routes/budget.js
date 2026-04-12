const crypto = require('crypto');
const {
  buildBudgetTemplate,
  buildBudgetDataset,
  parseBudgetRowsFromFile,
} = require('../services/budget-service');
const { validateBudgetRows, buildBudgetPreviewSummary } = require('../services/validation-service');
const {
  createBudgetTemplateWorkbookBuffer,
} = require('../services/export-service');
const { readDb, withDb, getCompanyData } = require('../services/storage-service');
const { ensureMonth } = require('../utils/date-utils');
const {
  assertMonthOpen,
  findPreviousBudgetMonth,
} = require('../services/month-service');
const { uploadedBudgetFiles } = require('../http/upload-stores');
const {
  resolveCompanyId,
  upsertLoadRecord,
  pushAuditLog,
  refreshMonthAnalysisIfPossible,
  getMonthStatusPayload,
} = require('../http/route-helpers');
const { requireMinRole } = require('../http/auth-http');

function registerBudgetRoutes(app, upload) {
  app.post('/api/budget/upload', requireMinRole('editor'), upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Debes seleccionar un archivo de presupuesto.' });
      }

      const { parseUploadedFile } = require('../services/file-parser');
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

  app.post('/api/budget/preview', requireMinRole('editor'), (req, res) => {
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

  app.post('/api/budget/process', requireMinRole('editor'), (req, res) => {
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

  app.post('/api/budget/save', requireMinRole('editor'), (req, res) => {
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

  app.post('/api/budget/duplicate', requireMinRole('editor'), (req, res) => {
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
      if (!sourceSnapshot?.budget?.rows?.length) {
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
}

module.exports = { registerBudgetRoutes };
