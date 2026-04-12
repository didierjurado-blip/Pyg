const crypto = require('crypto');
const { compareBudgetVsReal } = require('../services/comparison-service');
const { buildExecutiveSummary, buildFindings, buildActionPlan } = require('../services/analysis-service');
const { buildDataQualityAlerts } = require('../services/validation-service');
const { buildBudgetTemplate } = require('../services/budget-service');
const { readDb, withDb, getCompanyData } = require('../services/storage-service');
const { getMonthClosure } = require('../services/month-service');
const { buildAccumulatedDataset } = require('../services/accumulated-service');
const { buildEliminationScopeKey } = require('../services/consolidation-service');

function resolveCompanyId(req, db) {
  const fromQuery = String(req.query?.companyId || '').trim();
  const fromBody = String(req.body?.companyId || '').trim();
  const candidate = fromQuery || fromBody || db.companies[0]?.id;

  if (!candidate) {
    throw new Error('No hay empresa disponible. Crea una empresa primero.');
  }

  const company = db.companies.find((item) => item.id === candidate);
  if (!company) {
    throw new Error('Empresa no encontrada.');
  }

  return company.id;
}

function upsertLoadRecord(companyData, { type, month, fileName }) {
  const previous = (companyData.loads || []).find((item) => item.type === type && item.month === month) || null;
  companyData.loads = (companyData.loads || []).filter((item) => !(item.type === type && item.month === month));
  const newRecord = {
    id: crypto.randomUUID(),
    type,
    month,
    fileName,
    createdAt: new Date().toISOString(),
  };
  companyData.loads.push(newRecord);
  return {
    newRecord,
    replacedRecordId: previous?.id || null,
  };
}

function pushAuditLog(db, companyId, event) {
  const payload = {
    id: event.id || crypto.randomUUID(),
    companyId,
    companyName: event.companyName || 'N/A',
    month: event.month || null,
    eventType: event.eventType || 'evento',
    dataType: event.dataType || 'general',
    fileName: event.fileName || null,
    dateTime: event.dateTime || new Date().toISOString(),
    rowsRead: Number(event.rowsRead || 0),
    rowsProcessed: Number(event.rowsProcessed || 0),
    resultStatus: event.resultStatus || 'exitoso',
    messageSummary: event.messageSummary || '',
    alertsDetected: Array.isArray(event.alertsDetected) ? event.alertsDetected : [],
    replacedRecordId: event.replacedRecordId || null,
  };

  db.auditLogsGlobal = Array.isArray(db.auditLogsGlobal) ? db.auditLogsGlobal : [];
  db.auditLogsGlobal.unshift(payload);
  db.auditLogsGlobal = db.auditLogsGlobal.slice(0, 5000);

  if (companyId && db.dataByCompany?.[companyId]) {
    const companyData = db.dataByCompany[companyId];
    companyData.auditLogs = Array.isArray(companyData.auditLogs) ? companyData.auditLogs : [];
    companyData.auditLogs.unshift(payload);
    companyData.auditLogs = companyData.auditLogs.slice(0, 2000);
  }

  return payload;
}

function getMonthSnapshot(companyId, month) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  return companyData.months[month] || null;
}

function getMonthStatusPayload(companyData, month) {
  const status = getMonthClosure(companyData, month);
  return {
    ...status,
    blockedActions: [
      'cargar ejecución',
      'reemplazar ejecución',
      'cargar presupuesto',
      'reemplazar presupuesto',
      'editar presupuesto',
      'borrar ejecución',
      'borrar presupuesto',
    ],
    allowedActions: [
      'ver reportes',
      'exportar',
      'consultar histórico',
      'consultar observaciones',
      'consultar acciones',
    ],
  };
}

function refreshMonthAnalysisIfPossible(companyId, month) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  if (!companyData.months?.[month]?.execution) {
    return db;
  }
  return buildOrRefreshAnalysis(companyId, month);
}

function getAccumulatedSnapshot(companyId, month, includeBudget = true) {
  const db = readDb();
  const { company, companyData } = getCompanyData(db, companyId);
  return buildAccumulatedDataset({
    company,
    companyData,
    cutoffMonth: month,
    includeBudget,
  });
}

function normalizeCompanyGroupPayload(payload, availableCompanyIds = []) {
  const name = String(payload?.name || '').trim();
  const companyIds = Array.isArray(payload?.companyIds)
    ? payload.companyIds.map((item) => String(item || '').trim()).filter((id) => availableCompanyIds.includes(id))
    : [];

  if (name.length < 2) {
    throw new Error('El grupo debe tener un nombre válido.');
  }

  if (!companyIds.length) {
    throw new Error('Selecciona al menos una empresa para el grupo.');
  }

  return {
    name,
    companyIds: Array.from(new Set(companyIds)),
  };
}

function normalizeEliminationPayload(payload, db) {
  const { ensureMonth } = require('../utils/date-utils');
  const month = ensureMonth(payload?.month);
  const companyIds = Array.isArray(payload?.companyIds)
    ? payload.companyIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const sourceCompanyId = String(payload?.sourceCompanyId || '').trim();
  const targetCompanyId = String(payload?.targetCompanyId || '').trim();
  const lineKey = String(payload?.lineKey || '').trim();
  const description = String(payload?.description || '').trim();
  const value = Number(payload?.value || 0);
  const eliminationType = ['ingreso_intercompania', 'costo_intercompania', 'gasto_intercompania', 'otra_eliminacion'].includes(String(payload?.eliminationType || '').trim())
    ? String(payload.eliminationType).trim()
    : 'otra_eliminacion';
  const groupId = String(payload?.groupId || '').trim() || null;

  if (!companyIds.length && !groupId) {
    throw new Error('Debes definir el alcance del consolidado para registrar la eliminación.');
  }

  if (!lineKey) {
    throw new Error('Debes seleccionar la línea P&G afectada.');
  }

  if (!description) {
    throw new Error('Debes ingresar una descripción de la eliminación.');
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('El valor de la eliminación debe ser mayor a cero.');
  }

  return {
    month,
    groupId,
    companyIds,
    sourceCompanyId: sourceCompanyId || null,
    targetCompanyId: targetCompanyId || null,
    lineKey,
    description,
    value,
    eliminationType,
    scopeType: groupId ? 'group' : 'adhoc',
    scopeKey: buildEliminationScopeKey({ groupId, companyIds }),
  };
}

function buildTrendForCompany(companyData) {
  const months = Object.keys(companyData.months || {}).sort();
  return months.map((m) => {
    const snapshot = companyData.months[m];
    const rows = snapshot.comparison?.rows || [];
    const byKey = new Map(rows.map((row) => [row.lineKey, row]));
    return {
      month: m,
      ingresos_operacionales: byKey.get('ingresos_operacionales')?.real || 0,
      utilidad_operacional: byKey.get('utilidad_operacional')?.real || 0,
      utilidad_neta: byKey.get('utilidad_neta')?.real || 0,
      utilidad_neta_presupuesto: byKey.get('utilidad_neta')?.budget || 0,
    };
  });
}

function buildExecutiveBoard(companyName, month, snapshot, trend) {
  const rows = snapshot.comparison?.rows || [];
  const utilityRow = rows.find((row) => row.lineKey === 'utilidad_neta') || { real: 0, budget: 0 };
  const totalLines = rows.length || 1;
  const cumplidas = rows.filter((row) => row.status === 'Cumplido').length;

  const topUnfavorable = rows
    .filter((row) => !row.favorable)
    .sort((a, b) => Math.abs(b.variationPct || 0) - Math.abs(a.variationPct || 0))
    .slice(0, 5);

  const topFavorable = rows
    .filter((row) => row.favorable)
    .sort((a, b) => Math.abs(b.variationPct || 0) - Math.abs(a.variationPct || 0))
    .slice(0, 5);

  return {
    companyName,
    month,
    compliancePct: Math.round((cumplidas / totalLines) * 100),
    utilityBudget: utilityRow.budget || 0,
    utilityReal: utilityRow.real || 0,
    topUnfavorable,
    topFavorable,
    incumplidas: rows.filter((row) => row.status === 'Incumplido'),
    dataQualityAlerts: snapshot.analysis?.dataQualityAlerts || [],
    actionSummary: (snapshot.analysis?.actionPlan || []).slice(0, 3),
    recentTrend: (trend || []).slice(-6),
  };
}

function refreshCompanyAnalyses(companyId) {
  const db = readDb();
  const { companyData } = getCompanyData(db, companyId);
  const months = Object.keys(companyData.months || {}).sort();
  months.forEach((m) => {
    if (companyData.months[m]?.execution) {
      try {
        buildOrRefreshAnalysis(companyId, m);
      } catch (_error) {
        // no-op
      }
    }
  });
}

function buildOrRefreshAnalysis(companyId, month) {
  return withDb((db) => {
    const { company, companyData } = getCompanyData(db, companyId);
    const snapshot = companyData.months[month] || {};

    if (!snapshot.execution) {
      throw new Error('No hay ejecución cargada para este mes.');
    }

    const budgetRows = snapshot.budget?.rows || buildBudgetTemplate();
    const comparison = compareBudgetVsReal({
      budgetRows: snapshot.budget?.gerencial?.standardTable || snapshot.budget?.contable?.standardTable || budgetRows,
      realPygTable: snapshot.execution.gerencial?.standardTable || snapshot.execution.gerencial?.pygTable || snapshot.execution.contable.pygTable,
      lineSettings: companyData.lineSettings,
    });

    const dataQualityAlerts = buildDataQualityAlerts({
      comparisonRows: comparison.rows,
      execution: snapshot.execution,
    });

    const executiveSummary = buildExecutiveSummary({
      month,
      comparison,
      contable: snapshot.execution.contable,
      gerencial: snapshot.execution.gerencial,
      dataQualityAlerts,
      execution: snapshot.execution,
    });

    const findings = buildFindings({ comparison, execution: snapshot.execution });
    const actionPlan = buildActionPlan(comparison.rows);

    companyData.months[month] = {
      ...snapshot,
      month,
      comparison,
      analysis: {
        executiveSummary,
        findings,
        actionPlan,
        dataQualityAlerts,
        generatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    return db;
  });
}

module.exports = {
  resolveCompanyId,
  upsertLoadRecord,
  pushAuditLog,
  getMonthSnapshot,
  getMonthStatusPayload,
  refreshMonthAnalysisIfPossible,
  getAccumulatedSnapshot,
  normalizeCompanyGroupPayload,
  normalizeEliminationPayload,
  buildTrendForCompany,
  buildExecutiveBoard,
  refreshCompanyAnalyses,
  buildOrRefreshAnalysis,
};
