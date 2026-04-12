const { parseUploadedFile } = require('../services/file-parser');
const { buildExecutionDataset } = require('../services/execution-service');
const {
  validateExecutionRows,
  buildExecutionPreviewSummary,
} = require('../services/validation-service');
const { readDb, withDb, getCompanyData } = require('../services/storage-service');
const { ensureMonth } = require('../utils/date-utils');
const { assertMonthOpen } = require('../services/month-service');
const { uploadedExecutionFiles } = require('../http/upload-stores');
const {
  resolveCompanyId,
  upsertLoadRecord,
  pushAuditLog,
  refreshMonthAnalysisIfPossible,
} = require('../http/route-helpers');
const { requireMinRole } = require('../http/auth-http');
const { createJob, updateJob, getJob } = require('../services/in-memory-jobs');

function runExecutionProcess(req) {
  const db = readDb();
  const companyId = resolveCompanyId(req, db);
  const { company, companyData } = getCompanyData(db, companyId);

  const { fileId, mapping, month, forceReplace } = req.body;
  const normalizedMonth = ensureMonth(month);
  assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar la ejecución del mes');

  if (!fileId || !uploadedExecutionFiles.has(fileId)) {
    const err = new Error('Archivo no encontrado. Cargalo nuevamente.');
    err.statusCode = 400;
    throw err;
  }

  const currentSnapshot = companyData.months[normalizedMonth] || {};
  if (currentSnapshot.execution && !forceReplace) {
    const err = new Error('Ya existe ejecución para este mes y empresa. ¿Deseas reemplazarla');
    err.statusCode = 409;
    err.conflict = true;
    throw err;
  }

  const uploaded = uploadedExecutionFiles.get(fileId);
  const validation = validateExecutionRows(uploaded.rows, mapping || {});

  if (validation.errors.length) {
    const err = new Error('La ejecución tiene errores de validación.');
    err.statusCode = 400;
    err.validation = validation;
    throw err;
  }

  const execution = buildExecutionDataset({
    rows: uploaded.rows,
    mapping,
    sourceFileName: uploaded.name,
  });

  withDb((currentDb) => {
    const { companyData: mutableCompanyData } = getCompanyData(currentDb, companyId);
    const snapshot = mutableCompanyData.months[normalizedMonth] || {};

    mutableCompanyData.months[normalizedMonth] = {
      ...snapshot,
      month: normalizedMonth,
      execution,
      executionValidation: validation,
      updatedAt: new Date().toISOString(),
    };

    const loadInfo = upsertLoadRecord(mutableCompanyData, {
      type: 'ejecución',
      month: normalizedMonth,
      fileName: uploaded.name,
    });

    pushAuditLog(currentDb, companyId, {
      companyName: company.name,
      month: normalizedMonth,
      eventType: loadInfo.replacedRecordId ? 'replace_ejecucin' : 'upload_ejecucin',
      dataType: 'ejecución',
      fileName: uploaded.name,
      rowsRead: uploaded.rows.length,
      rowsProcessed: execution.baseRows.length,
      resultStatus: validation.warnings.length ? 'con_alertas' : 'exitoso',
      messageSummary: 'Ejecucion guardada correctamente.',
      alertsDetected: validation.warnings,
      replacedRecordId: loadInfo.replacedRecordId,
    });

    return currentDb;
  });

  const updatedDb = refreshMonthAnalysisIfPossible(companyId, normalizedMonth);
  const updatedSnapshot = updatedDb.dataByCompany[companyId].months[normalizedMonth];

  return {
    companyId,
    month: normalizedMonth,
    execution,
    validation,
    snapshot: updatedSnapshot,
  };
}

function registerExecutionRoutes(app, upload) {
  app.post('/api/execution/upload', requireMinRole('editor'), upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Debes seleccionar un archivo.' });
      }

      const parsed = parseUploadedFile(req.file);
      const crypto = require('crypto');
      const fileId = crypto.randomUUID();

      uploadedExecutionFiles.set(fileId, {
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
      return res.status(400).json({ error: error.message || 'No fue posible leer el archivo.' });
    }
  });

  app.post('/api/execution/preview', requireMinRole('editor'), (req, res) => {
    try {
      const db = readDb();
      const companyId = resolveCompanyId(req, db);
      const { company, companyData } = getCompanyData(db, companyId);
      const { fileId, mapping, month } = req.body;
      const normalizedMonth = ensureMonth(month);
      assertMonthOpen(companyData, normalizedMonth, 'cargar o reemplazar la ejecución del mes');

      if (!fileId || !uploadedExecutionFiles.has(fileId)) {
        return res.status(400).json({ error: 'Archivo no encontrado. Cargalo nuevamente.' });
      }

      const uploaded = uploadedExecutionFiles.get(fileId);
      const validation = validateExecutionRows(uploaded.rows, mapping || {});
      const existingMonthSnapshot = companyData.months?.[normalizedMonth] || null;
      const conflict = Boolean(existingMonthSnapshot?.execution);
      const tempExecution = validation.errors.length
        ? null
        : buildExecutionDataset({ rows: uploaded.rows, mapping, sourceFileName: uploaded.name });

      const preview = buildExecutionPreviewSummary({
        rows: uploaded.rows,
        mapping,
        headers: uploaded.headers,
        validation,
        tempExecution,
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
      return res.status(400).json({ error: error.message || 'No fue posible validar la ejecución.' });
    }
  });

  app.post('/api/execution/process', requireMinRole('editor'), (req, res) => {
    try {
      const payload = runExecutionProcess(req);
      return res.json(payload);
    } catch (error) {
      if (error.statusCode === 409) {
        return res.status(409).json({
          conflict: Boolean(error.conflict),
          error: error.message,
          validation: error.validation,
        });
      }
      if (error.statusCode === 400 && error.validation) {
        return res.status(400).json({
          error: error.message,
          validation: error.validation,
        });
      }
      return res.status(error.statusCode || 400).json({ error: error.message || 'No fue posible procesar la ejecución.' });
    }
  });

  app.post('/api/execution/process-async', requireMinRole('editor'), (req, res) => {
    const jobId = createJob();
    const fakeReq = {
      body: { ...req.body },
      query: { ...req.query },
    };
    updateJob(jobId, { state: 'running' });
    setImmediate(() => {
      try {
        const payload = runExecutionProcess(fakeReq);
        updateJob(jobId, { state: 'done', result: payload, error: null });
      } catch (error) {
        updateJob(jobId, {
          state: 'failed',
          error: error.message || 'error',
          statusCode: error.statusCode || 400,
          conflict: Boolean(error.conflict),
          validation: error.validation || null,
        });
      }
    });
    return res.status(202).json({ jobId, message: 'Procesamiento en segundo plano iniciado.' });
  });

  app.get('/api/jobs/:jobId', requireMinRole('editor'), (req, res) => {
    const row = getJob(String(req.params.jobId || '').trim());
    if (!row) {
      return res.status(404).json({ error: 'Trabajo no encontrado.' });
    }
    return res.json(row);
  });

  app.get('/api/execution/:month', (req, res) => {
    try {
      const db = readDb();
      const companyId = resolveCompanyId(req, db);
      const month = ensureMonth(req.params.month);
      const { companyData } = getCompanyData(db, companyId);
      const snapshot = companyData.months[month] || null;

      if (!snapshot.execution) {
        return res.status(404).json({ error: 'No hay ejecución cargada para este mes.' });
      }

      return res.json({
        companyId,
        month,
        execution: snapshot.execution,
        validation: snapshot.executionValidation || { errors: [], warnings: [] },
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });
}

module.exports = { registerExecutionRoutes, runExecutionProcess };
