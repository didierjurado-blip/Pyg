const fs = require('fs');
const path = require('path');
const { buildDefaultLineSettingsMap, normalizeLineSettings } = require('./line-settings-service');
const { normalizeUserRole } = require('./auth-service');

/**
 * Persistencia en JSON: esquema y migraciones
 *
 * - readDb() siempre devuelve datos pasados por ensureStructure().
 * - migrateLegacyDb(): convierte bases antiguas (p. ej. sin companies/dataByCompany) al
 *   shape actual; añade aquí pasos cuando existan archivos en producción con un formato viejo.
 * - ensureStructure(): normaliza arrays/objetos faltantes y defaults por empresa; incrementa
 *   compatibilidad sin subir meta.version obligatoriamente.
 * - writeDb() fija meta.version (p. ej. 6) y updatedAt; si cambias el modelo de forma incompatible,
 *   sube la versión, documenta el cambio y extiende migrateLegacyDb o ensureStructure según
 *   haga falta reescribir datos existentes.
 */
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

function createCompany(name = 'Empresa principal') {
  const now = new Date().toISOString();
  const id = `cmp-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    name,
    createdAt: now,
  };
}

function defaultCompanyData() {
  return {
    months: {},
    loads: [],
    auditLogs: [],
    lineSettings: buildDefaultLineSettingsMap(),
    monthlyNotes: {},
    monthlyActions: {},
    monthClosures: {},
  };
}

function defaultDb() {
  const company = createCompany('Empresa principal');
  return {
    meta: {
      version: 6,
      updatedAt: new Date().toISOString(),
    },
    companies: [company],
    companyGroups: [],
    consolidationEliminations: [],
    auditLogsGlobal: [],
    auth: {
      users: [],
      sessions: [],
    },
    dataByCompany: {
      [company.id]: defaultCompanyData(),
    },
  };
}

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), 'utf8');
  }
}

function migrateLegacyDb(parsed) {
  if (parsed.companies && parsed.dataByCompany) {
    return parsed;
  }

  const company = createCompany('Empresa principal');
  const legacyMonths = parsed.months || {};

  return {
    meta: {
      version: 6,
      updatedAt: new Date().toISOString(),
    },
    companies: [company],
    companyGroups: [],
    consolidationEliminations: [],
    auditLogsGlobal: [],
    auth: {
      users: [],
      sessions: [],
    },
    dataByCompany: {
      [company.id]: {
        ...defaultCompanyData(),
        months: legacyMonths,
      },
    },
  };
}

function ensureStructure(db) {
  let next = migrateLegacyDb(db || {});

  if (!Array.isArray(next.companies) || next.companies.length === 0) {
    const company = createCompany('Empresa principal');
    next.companies = [company];
    next.dataByCompany = {
      [company.id]: defaultCompanyData(),
    };
  }

  if (!Array.isArray(next.auditLogsGlobal)) {
    next.auditLogsGlobal = [];
  }

  if (!Array.isArray(next.companyGroups)) {
    next.companyGroups = [];
  }

  if (!Array.isArray(next.consolidationEliminations)) {
    next.consolidationEliminations = [];
  }

  next.companyGroups = next.companyGroups
    .filter((group) => group && typeof group === 'object')
    .map((group) => ({
      id: String(group.id || `grp-${Math.random().toString(36).slice(2, 10)}`),
      name: String(group.name || 'Grupo empresarial').trim() || 'Grupo empresarial',
      companyIds: Array.isArray(group.companyIds) ? Array.from(new Set(group.companyIds.map((item) => String(item || '').trim()).filter(Boolean))) : [],
      createdAt: group.createdAt || new Date().toISOString(),
      updatedAt: group.updatedAt || group.createdAt || new Date().toISOString(),
    }));

  next.consolidationEliminations = next.consolidationEliminations
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || `elim-${Math.random().toString(36).slice(2, 10)}`),
      scopeType: item.scopeType === 'group' ? 'group' : 'adhoc',
      scopeKey: String(item.scopeKey || '').trim(),
      groupId: String(item.groupId || '').trim() || null,
      companyIds: Array.isArray(item.companyIds) ? Array.from(new Set(item.companyIds.map((v) => String(v || '').trim()).filter(Boolean))) : [],
      month: String(item.month || '').trim(),
      sourceCompanyId: String(item.sourceCompanyId || '').trim() || null,
      targetCompanyId: String(item.targetCompanyId || '').trim() || null,
      lineKey: String(item.lineKey || '').trim(),
      description: String(item.description || '').trim(),
      value: Number(item.value || 0),
      eliminationType: String(item.eliminationType || 'otra_eliminacion').trim() || 'otra_eliminacion',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    }));

  if (!next.auth || typeof next.auth !== 'object') {
    next.auth = { users: [], sessions: [] };
  }

  if (!Array.isArray(next.auth.users)) {
    next.auth.users = [];
  }

  if (!Array.isArray(next.auth.sessions)) {
    next.auth.sessions = [];
  }

  next.auth.users.forEach((user) => {
    if (!user || typeof user !== 'object') {
      return;
    }
    user.role = normalizeUserRole(user.role);
    if (user.mfaEnabled === undefined) {
      user.mfaEnabled = false;
    }
    if (user.mfaSecret === undefined) {
      user.mfaSecret = null;
    }
    if (user.mfaTempSecret === undefined) {
      user.mfaTempSecret = null;
    }
  });

  next.companies.forEach((company) => {
    if (!next.dataByCompany[company.id]) {
      next.dataByCompany[company.id] = defaultCompanyData();
    }

    const companyData = next.dataByCompany[company.id];

    if (!companyData.months || typeof companyData.months !== 'object') {
      companyData.months = {};
    }

    if (!Array.isArray(companyData.loads)) {
      companyData.loads = [];
    }

    if (!Array.isArray(companyData.auditLogs)) {
      companyData.auditLogs = [];
    }

    if (!companyData.monthlyNotes || typeof companyData.monthlyNotes !== 'object') {
      companyData.monthlyNotes = {};
    }

    if (!companyData.monthlyActions || typeof companyData.monthlyActions !== 'object') {
      companyData.monthlyActions = {};
    }

    if (!companyData.monthClosures || typeof companyData.monthClosures !== 'object') {
      companyData.monthClosures = {};
    }

    Object.keys(companyData.monthlyActions).forEach((monthKey) => {
      const rows = Array.isArray(companyData.monthlyActions[monthKey]) ? companyData.monthlyActions[monthKey] : [];
      const seen = new Set();
      companyData.monthlyActions[monthKey] = rows.map((action) => {
        const baseId = String(action?.id || '').trim();
        const safeId = baseId && !seen.has(baseId)
          ? baseId
          : 'act-' + Math.random().toString(36).slice(2, 10);
        seen.add(safeId);
        return {
          ...action,
          id: safeId,
        };
      });
    });

    companyData.lineSettings = normalizeLineSettings(companyData.lineSettings);
  });

  return next;
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return ensureStructure(parsed);
}

function writeDb(nextDb) {
  ensureDbFile();
  const normalized = ensureStructure(nextDb);
  const payload = {
    ...normalized,
    meta: {
      ...(normalized.meta || {}),
      version: 6,
      updatedAt: new Date().toISOString(),
    },
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function withDb(mutator) {
  const db = readDb();
  const updated = mutator(db) || db;
  return writeDb(updated);
}

function getCompanyData(db, companyId) {
  const company = db.companies.find((item) => item.id === companyId);
  if (!company) {
    throw new Error('Empresa no encontrada.');
  }

  const companyData = db.dataByCompany[companyId] || defaultCompanyData();
  return { company, companyData };
}

module.exports = {
  DB_PATH,
  readDb,
  writeDb,
  withDb,
  getCompanyData,
  defaultCompanyData,
};
