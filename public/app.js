const state = {
  month: '',
  meta: null,
  companies: [],
  activeCompanyId: '',
  executionUpload: null,
  budgetUpload: null,
  analysis: null,
  trend: [],
  lineSettings: [],
  notes: [],
  actions: [],
  monthStatus: null,
  actionsOverview: null,
  pendingExecutionProcess: null,
  pendingBudgetProcess: null,
  activeView: 'dashboard',
  availableMonths: [],
  workspaceBooted: false,
  auth: {
    authenticated: false,
    user: null,
    csrfToken: '',
    setupRequired: false,
    setupMode: 'disabled',
    setupTokenConfigured: false,
  },
};

const executionMappingFields = ['account', 'accountName', 'balance', 'debit', 'credit'];
const budgetMappingFields = ['line', 'budget', 'comment'];
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const numberFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const authScreen = document.getElementById('auth-screen');
const authTitle = document.getElementById('auth-title');
const authMessage = document.getElementById('auth-message');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const setupForm = document.getElementById('setup-form');
const setupTokenInput = document.getElementById('setup-token');
const setupDisplayName = document.getElementById('setup-display-name');
const setupEmail = document.getElementById('setup-email');
const setupPassword = document.getElementById('setup-password');
const setupPasswordConfirm = document.getElementById('setup-password-confirm');

const monthInput = document.getElementById('month-input');
if (monthInput) {
  monthInput.min = '2000-01';
  monthInput.max = '2100-12';
}
const btnRefresh = document.getElementById('btn-refresh');
const globalMessage = document.getElementById('global-message');
const workspaceTitle = document.getElementById('workspace-title');
const topbarCompanyName = document.getElementById('topbar-company-name');
const authUserLabel = document.getElementById('auth-user-label');
const btnLogout = document.getElementById('btn-logout');

const companyTabs = document.getElementById('company-tabs');
const activeCompanyLabel = document.getElementById('active-company-label');
const btnAddCompany = document.getElementById('btn-add-company');
const btnDeleteCompany = document.getElementById('btn-delete-company');

const executionUploadForm = document.getElementById('execution-upload-form');
const executionProcessForm = document.getElementById('execution-process-form');
const executionFile = document.getElementById('execution-file');
const executionActivePeriod = document.getElementById('execution-active-period');
const executionUploadMsg = document.getElementById('execution-upload-msg');
const executionPreview = document.getElementById('execution-preview');
const btnDeleteExecution = document.getElementById('btn-delete-execution');
const btnProcessExecution = executionProcessForm.querySelector('button[type="submit"]');

const budgetUploadForm = document.getElementById('budget-upload-form');
const budgetProcessForm = document.getElementById('budget-process-form');
const budgetFile = document.getElementById('budget-file');
const budgetActivePeriod = document.getElementById('budget-active-period');
const budgetUploadMsg = document.getElementById('budget-upload-msg');
const budgetDuplicateMsg = document.getElementById('budget-duplicate-msg');
const budgetAssumptions = document.getElementById('budget-assumptions');
const manualBudget = document.getElementById('manual-budget');
const btnSaveBudget = document.getElementById('btn-save-budget');
const btnDeleteBudget = document.getElementById('btn-delete-budget');
const btnDuplicateBudget = document.getElementById('btn-duplicate-budget');
const btnProcessBudget = budgetProcessForm.querySelector('button[type="submit"]');
const budgetTemplateLink = document.getElementById('budget-template-link');
const executionPreviewPanel = document.getElementById('execution-preview-panel');
const budgetPreviewPanel = document.getElementById('budget-preview-panel');

const monthStatusBadge = document.getElementById('month-status-badge');
const monthStatusPanel = document.getElementById('month-status-panel');

const lineSettingsContainer = document.getElementById('line-settings');
const btnSaveLineSettings = document.getElementById('btn-save-line-settings');
const executiveBoard = document.getElementById('executive-board');

const auditMonthFilter = document.getElementById('audit-month-filter');
const btnLoadAudit = document.getElementById('btn-load-audit');
const auditLogTable = document.getElementById('audit-log-table');

const noteAuthorInput = document.getElementById('note-author');
const noteTextInput = document.getElementById('note-text');
const btnSaveNote = document.getElementById('btn-save-note');
const notesList = document.getElementById('notes-list');

const actionLine = document.getElementById('action-line');
const actionProblem = document.getElementById('action-problem');
const actionDefined = document.getElementById('action-defined');
const actionResponsible = document.getElementById('action-responsible');
const actionPriority = document.getElementById('action-priority');
const actionDueDate = document.getElementById('action-due-date');
const btnSaveAction = document.getElementById('btn-save-action');
const actionsList = document.getElementById('actions-list');
const actionsOverviewScope = document.getElementById('actions-overview-scope');
const btnRefreshActionsOverview = document.getElementById('btn-refresh-actions-overview');
const actionsOverviewSummary = document.getElementById('actions-overview-summary');
const actionsOverviewSections = document.getElementById('actions-overview-sections');

const kpiCards = document.getElementById('kpi-cards');
const pygContable = document.getElementById('pyg-contable');
const pygGerencial = document.getElementById('pyg-gerencial');
const comparisonTable = document.getElementById('comparison-table');

const insightsKpis = document.getElementById('insights-kpis');
const executiveSummary = document.getElementById('executive-summary');
const topDeviations = document.getElementById('top-deviations');
const insightsDetails = document.getElementById('insights-details');
const actionPlan = document.getElementById('action-plan');
const analysisStandard = document.getElementById('analysis-standard');
const analysisDetailed = document.getElementById('analysis-detailed');
const analysisAdjustments = document.getElementById('analysis-adjustments');
const analysisMapping = document.getElementById('analysis-mapping');
const exportLink = document.getElementById('export-link');

const trendChart = document.getElementById('trend-chart');
const trendTable = document.getElementById('trend-table');
const navButtons = Array.from(document.querySelectorAll('[data-nav-view]'));
const appViews = Array.from(document.querySelectorAll('[data-app-view]'));
const changeProfileForm = document.getElementById('change-profile-form');
const profileDisplayNameInput = document.getElementById('profile-display-name');
const profileEmailInput = document.getElementById('profile-email');
const profileCurrentPasswordInput = document.getElementById('profile-current-password');
const changeProfileMessage = document.getElementById('change-profile-message');
const changePasswordForm = document.getElementById('change-password-form');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const newPasswordConfirmInput = document.getElementById('new-password-confirm');
const changePasswordMessage = document.getElementById('change-password-message');

const viewTitles = {
  dashboard: 'Dashboard',
  empresas: 'Empresas',
  ejecucion: 'Ejecución',
  presupuesto: 'Presupuesto',
  analisis: 'Análisis mensual',
  historico: 'Histórico',
  acciones: 'Acciones',
  bitacora: 'Bitácora',
  configuracion: 'Configuración',
};

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function getActiveCompany() {
  return (state.companies || []).find((company) => company.id === state.activeCompanyId) || null;
}

function parseLocalizedNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw.replace(/\s/g, '').replace(/\$/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) {
    return 0;
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    const parts = cleaned.split(',');
    normalized = parts.length === 2 && parts[1].length <= 2
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    normalized = parts.length === 2 && parts[1].length <= 2
      ? cleaned
      : cleaned.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setGlobalMessage(text, isError = false) {
  globalMessage.textContent = text;
  globalMessage.style.color = isError ? '#c83737' : '#5b677a';
}

function setChangeProfileMessage(text, isError = false) {
  if (!changeProfileMessage) return;
  changeProfileMessage.textContent = text || '';
  changeProfileMessage.classList.toggle('error-text', Boolean(isError));
}

function setChangePasswordMessage(text, isError = false) {
  if (!changePasswordMessage) return;
  changePasswordMessage.textContent = text || '';
  changePasswordMessage.classList.toggle('error-text', Boolean(isError));
}

function setAuthMessage(text, isError = false) {
  if (!authMessage) return;
  authMessage.textContent = text || '';
  authMessage.classList.toggle('error-text', Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAuthUser() {
  if (!authUserLabel) return;
  const user = state.auth.user;
  authUserLabel.textContent = user ? ((user.displayName || user.email) + ' · ' + user.email) : 'Sin sesión';
  if (btnLogout) {
    btnLogout.disabled = !state.auth.authenticated;
  }
}

function syncSecurityForms() {
  if (profileDisplayNameInput) {
    profileDisplayNameInput.value = state.auth.user?.displayName || '';
  }
  if (profileEmailInput) {
    profileEmailInput.value = state.auth.user?.email || '';
  }
}

function resetAuthForms() {
  if (loginForm) loginForm.reset();
  if (setupForm) setupForm.reset();
  if (changeProfileForm) changeProfileForm.reset();
  if (changePasswordForm) changePasswordForm.reset();
  setChangeProfileMessage('');
  setChangePasswordMessage('');
  syncSecurityForms();
}

function lockWorkspaceForAuth() {
  document.body.classList.add('auth-locked');
  if (authScreen) {
    authScreen.classList.remove('hidden');
  }
}

function setAuthMode() {
  if (!authTitle || !authMessage || !loginForm || !setupForm) {
    return;
  }

  if (state.auth.authenticated) {
    document.body.classList.remove('auth-locked');
    authScreen.classList.add('hidden');
    return;
  }

  lockWorkspaceForAuth();

  const setupRequired = Boolean(state.auth.setupRequired);
  loginForm.classList.toggle('hidden', setupRequired);
  setupForm.classList.toggle('hidden', !setupRequired);

  if (!setupRequired) {
    authTitle.textContent = 'Iniciar sesión';
    if (!authMessage.textContent.trim()) {
      setAuthMessage('Ingresa con tu cuenta de administrador para usar la aplicación.');
    }
    return;
  }

  authTitle.textContent = 'Configurar administrador';
  if (state.auth.setupMode === 'local') {
    setAuthMessage('No hay usuarios aún. Crea el administrador inicial desde este equipo local.');
  } else if (state.auth.setupMode === 'token') {
    setAuthMessage('No hay usuarios aún. Ingresa el token de configuración y crea el administrador inicial.');
  } else {
    setAuthMessage('No hay usuarios configurados. Define AUTH_INITIAL_EMAIL/AUTH_INITIAL_PASSWORD o AUTH_SETUP_TOKEN en el servidor.', true);
  }

  if (setupTokenInput) {
    setupTokenInput.disabled = state.auth.setupMode !== 'token';
    setupTokenInput.required = state.auth.setupMode === 'token';
  }
}

function applyAuthPayload(payload = {}) {
  state.auth = {
    authenticated: Boolean(payload.authenticated),
    user: payload.user || null,
    csrfToken: payload.csrfToken || '',
    setupRequired: Boolean(payload.setupRequired),
    setupMode: payload.setupMode || 'disabled',
    setupTokenConfigured: Boolean(payload.setupTokenConfigured),
  };

  renderAuthUser();
  syncSecurityForms();
  setAuthMode();

  if (state.auth.authenticated) {
    document.body.classList.remove('auth-locked');
    if (authScreen) {
      authScreen.classList.add('hidden');
    }
  }
}

function isMonthClosed() {
  return Boolean(state.monthStatus && state.monthStatus.closed);
}

function ensureMonthEditableClient(actionLabel) {
  if (isMonthClosed()) {
    setGlobalMessage('El mes ' + selectedMonth() + ' está cerrado. Reábrelo antes de ' + actionLabel + '.', true);
    return false;
  }
  return true;
}

function currentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function selectedMonth() {
  const value = String(monthInput.value || '').trim();
  if (value) {
    return value;
  }
  return state.month || currentMonth();
}

function companyQuery(url) {
  if (!state.activeCompanyId) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return url + separator + 'companyId=' + encodeURIComponent(state.activeCompanyId);
}

async function requestJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!SAFE_HTTP_METHODS.has(method) && state.auth.authenticated && state.auth.csrfToken && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', state.auth.csrfToken);
  }

  let res;
  try {
    res = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
    });
  } catch (error) {
    const detail = error.message ? ' Detalle tecnico: ' + error.message + '.' : '';
    throw new Error('No se pudo conectar con el backend (' + method + ' ' + url + '). Verifica que la app esté activa y que la ruta /api responda.' + detail);
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().then((raw) => ({ raw })).catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !String(url).startsWith('/api/auth/')) {
      applyAuthPayload({ authenticated: false, user: null, csrfToken: '', setupRequired: false, setupMode: 'disabled' });
      setAuthMessage('La sesión expiró. Ingresa nuevamente para continuar.', true);
      setGlobalMessage('La sesión expiró. Vuelve a iniciar sesión.', true);
    }

    const details = data.error || (typeof data.raw === 'string' ? data.raw.slice(0, 180) : '');
    const err = new Error(details || 'Error de servidor (' + res.status + ') en ' + method + ' ' + url);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

async function loadAuthSession() {
  const payload = await requestJson('/api/auth/session', { handleAuthErrors: false });
  applyAuthPayload(payload || {});
  return payload;
}

async function api(url, options = {}) {
  return requestJson(url, options);
}

function buildSelectOptions(headers, selected = '') {
  return ['<option value="">No usar</option>', ...headers.map((h) => `<option value="${h}" ${h === selected ? 'selected' : ''}>${h}</option>`)].join('');
}

function autoSelect(headers, field) {
  const candidates = {
    account: ['cuenta', 'codigo'],
    accountName: ['nombre cuenta', 'descripcion'],
    balance: ['saldo', 'valor', 'monto', 'total', '1'],
    debit: ['debito'],
    credit: ['credito'],
    line: ['linea', 'concepto', 'rubro', 'linea pyg'],
    budget: ['presupuesto', 'budget', 'meta'],
    comment: ['comentario', 'nota', 'observacion'],
  };

  const normalized = headers.map((h) => ({
    raw: h,
    norm: String(h).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  }));

  const found = normalized.find((h) => (candidates[field] || []).some((c) => h.norm.includes(c)));
  return found ? found.raw : '';
}

function renderPreview(targetTable, headers, rows) {
  if (!headers.length) {
    targetTable.innerHTML = '';
    return;
  }

  const head = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body = rows
    .map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`)
    .join('');
  targetTable.innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderTable(target, rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const head = `<thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>`;
  const body = safeRows
    .map((row) => {
      const cells = columns
        .map((col) => {
          let value = row[col.key];
          if (col.currency) value = formatCurrency(value);
          if (col.number) value = formatNumber(value);
          if (col.percent && value !== null && value !== undefined) value = `${formatNumber(value)}%`;
          if (col.boolean) value = value ? 'S' : 'No';
          if (col.badge) value = `<span class="badge ${value}">${value}</span>`;
          if (value === null || value === undefined) value = '';
          return `<td>${value}</td>`;
        })
        .join('');
      const isTotalRow = typeof row.month === 'string' && row.month.startsWith('TOTAL ');
      return `<tr${isTotalRow ? ' class="total-row"' : ''}>${cells}</tr>`;
    })
    .join('');

  target.innerHTML = `<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
}

function applyMoneyInputBehavior(container) {
  const inputs = Array.from(container.querySelectorAll('input.money-input'));

  inputs.forEach((input) => {
    const initial = parseLocalizedNumber(input.value);
    input.dataset.raw = String(initial);
    input.value = formatNumber(initial);

    input.addEventListener('focus', () => {
      const numeric = parseLocalizedNumber(input.value);
      input.value = String(numeric).replace('.', ',');
      input.select();
    });

    input.addEventListener('blur', () => {
      const numeric = parseLocalizedNumber(input.value);
      input.dataset.raw = String(numeric);
      input.value = formatNumber(numeric);
    });

    input.addEventListener('input', () => {
      const numeric = parseLocalizedNumber(input.value);
      input.dataset.raw = String(numeric);
    });
  });
}

function renderManualBudgetRows(rows) {
  manualBudget.innerHTML =     '<div class="table-wrap">' +
      '<table>' +
        '<thead><tr><th>Secci?n</th><th>Subgrupo</th><th>Presupuesto</th><th>Comentario</th></tr></thead>' +
        '<tbody>' +
          rows.map((row) =>
            '<tr data-line="' + (row.lineKey || '') + '" data-detail="' + (row.detailKey || row.lineKey || '') + '">' +
              '<td>' + escapeHtml(row.lineLabel || '-') + '</td>' +
              '<td>' + escapeHtml(row.subgroup || row.lineLabel || '-') + '</td>' +
              '<td><input type="text" class="money-input" value="' + formatNumber(row.budget || 0) + '" data-field="budget" /></td>' +
              '<td><input type="text" value="' + escapeHtml(row.comment || '') + '" data-field="comment" /></td>' +
            '</tr>'
          ).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';

  applyMoneyInputBehavior(manualBudget);
}

function collectManualBudget() {
  const rows = Array.from(manualBudget.querySelectorAll('tbody tr'));
  return rows.map((tr) => ({
    detailKey: tr.getAttribute('data-detail'),
    lineKey: tr.getAttribute('data-line'),
    budget: parseLocalizedNumber(tr.querySelector('[data-field="budget"]').value || 0),
    comment: tr.querySelector('[data-field="comment"]').value || '',
  }));
}

function renderBudgetModule(budget) {
  const rows = budget?.rows || [];
  renderManualBudgetRows(rows);

  if (budgetAssumptions) {
    const notes = budget?.notes || budget?.assumptions || [];
    budgetAssumptions.innerHTML = notes.length
      ? '<ul class="detail-list">' + notes.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
      : '<p class="muted">Sin supuestos gerenciales visibles para este presupuesto.</p>';
  }
}

function renderCompanyTabs() {
  companyTabs.innerHTML = state.companies
    .map((company) => {
      const activeClass = company.id === state.activeCompanyId ? 'active' : '';
      return `<button class="tab-btn ${activeClass}" data-company-id="${company.id}"><span>${company.name}</span><small class="tab-badge">${company.monthsWithData || 0} meses</small></button>`;
    })
    .join('');

  Array.from(companyTabs.querySelectorAll('.tab-btn')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const companyId = btn.getAttribute('data-company-id');
      if (companyId === state.activeCompanyId) return;
      state.activeCompanyId = companyId;
      renderCompanyTabs();
      updateActiveCompanyLabel();
      await loadAvailableMonths().catch(() => { state.availableMonths = []; });
      monthInput.value = resolveInitialMonth();
      state.month = selectedMonth();
      updateBudgetTemplateLink();
      await loadMonthData();
    });
  });
}

function renderActiveView() {
  appViews.forEach((view) => {
    const isActive = view.getAttribute('data-app-view') === state.activeView;
    view.classList.toggle('is-active', isActive);
  });

  navButtons.forEach((button) => {
    const isActive = button.getAttribute('data-nav-view') === state.activeView;
    button.classList.toggle('active', isActive);
  });

  if (workspaceTitle) {
    workspaceTitle.textContent = viewTitles[state.activeView] || 'Dashboard';
  }
}

function setActiveView(viewName, syncHash = true) {
  if (!viewTitles[viewName]) {
    return;
  }

  state.activeView = viewName;
  renderActiveView();

  if (syncHash && window.location.hash !== '#' + viewName) {
    window.location.hash = viewName;
  }
}

function bindNavigation() {
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.getAttribute('data-nav-view');
      setActiveView(nextView);
    });
  });

  window.addEventListener('hashchange', () => {
    const hashView = window.location.hash.replace('#', '').trim();
    if (viewTitles[hashView] && hashView !== state.activeView) {
      setActiveView(hashView, false);
    }
  });
}

function updateTopbarContext() {
  const activeCompany = getActiveCompany();

  if (topbarCompanyName) {
    topbarCompanyName.textContent = activeCompany ? activeCompany.name : 'Sin empresa activa';
  }
}

function updateActiveCompanyLabel() {
  const activeCompany = getActiveCompany();
  activeCompanyLabel.textContent = activeCompany
    ? `Empresa activa: ${activeCompany.name}`
    : 'Sin empresa activa.';
  updateTopbarContext();
}
function updateActivePeriodHints() {
  const month = selectedMonth();
  const activeCompany = getActiveCompany();
  const companyName = activeCompany?.name || 'Sin empresa activa';
  const hint = `Mes activo en operación: ${month} | Empresa: ${companyName}`;

  updateTopbarContext();

  if (executionActivePeriod) {
    executionActivePeriod.textContent = hint;
  }
  if (budgetActivePeriod) {
    budgetActivePeriod.textContent = hint;
  }
  updateProcessButtonsState();
}



function updateProcessButtonsState() {
  const hasCompany = Boolean(state.activeCompanyId);
  const hasExplicitMonth = Boolean(String(monthInput.value || '').trim());
  const enabled = hasCompany && hasExplicitMonth;

  if (btnProcessExecution) {
    btnProcessExecution.disabled = !enabled;
  }
  if (btnProcessBudget) {
    btnProcessBudget.disabled = !enabled;
  }
}

function updateBudgetTemplateLink() {
  if (!budgetTemplateLink) return;

  if (!state.activeCompanyId) {
    budgetTemplateLink.href = '#';
    budgetTemplateLink.classList.add('disabled');
    return;
  }

  const month = selectedMonth();
  budgetTemplateLink.href = companyQuery('/api/budget/template/' + month);
  budgetTemplateLink.classList.remove('disabled');
}


async function loadAvailableMonths() {
  if (!state.activeCompanyId) {
    state.availableMonths = [];
    return [];
  }

  const payload = await api(companyQuery('/api/months'));
  state.availableMonths = Array.isArray(payload.months) ? payload.months : [];
  return state.availableMonths;
}

function resolveInitialMonth() {
  const available = Array.isArray(state.availableMonths) ? state.availableMonths : [];
  return available.length ? available[available.length - 1] : currentMonth();
}

async function loadCompanies(preserveActive = true) {
  const payload = await api('/api/companies');
  state.companies = payload.companies || [];

  if (!state.companies.length) {
    state.activeCompanyId = '';
  } else if (!preserveActive || !state.companies.some((company) => company.id === state.activeCompanyId)) {
    state.activeCompanyId = state.companies[0].id;
  }

  renderCompanyTabs();
  updateActiveCompanyLabel();
  await loadAvailableMonths().catch(() => { state.availableMonths = []; });
  updateActivePeriodHints();
  updateBudgetTemplateLink();
  updateProcessButtonsState();
}

function renderKpis(comparison, summary) {
  if (!comparison || !summary) {
    kpiCards.innerHTML = '<p class="muted">Aún no hay análisis para este mes.</p>';
    return;
  }

  const cards = [
    { label: 'Cumplidas', value: formatNumber(comparison.kpis.cumplidas) },
    { label: 'Alertas', value: formatNumber(comparison.kpis.alertas) },
    { label: 'Incumplidas', value: formatNumber(comparison.kpis.incumplidas) },
    { label: 'Utilidad neta real', value: formatCurrency(comparison.kpis.utilidadNetaReal) },
    { label: 'Utilidad neta presupuesto', value: formatCurrency(comparison.kpis.utilidadNetaPresupuesto) },
    { label: 'Meta mes', value: summary.metBudget ? 'Cumplida' : 'No cumplida' },
  ];

  kpiCards.innerHTML = cards
    .map((card) => `<article class="kpi"><small>${card.label}</small><strong>${card.value}</strong></article>`)
    .join('');
}

function buildSeverityTone(row) {
  const pct = Math.abs(Number(row.variationPct || 0));
  if (pct > 10) return 'danger';
  if (pct > 5) return 'warn';
  return 'ok';
}

function truncateText(value, maxLength = 88) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text || '-';
  }
  return text.slice(0, maxLength).trimEnd() + '...';
}

function renderInsightsSummary(summary, findingsList, topDeviation, firstAction) {
  if (!summary) {
    executiveSummary.innerHTML = '<p class="muted">Sin resumen ejecutivo.</p>';
    return;
  }

  const blocks = [
    {
      label: 'Qué pasó',
      text: summary.mainMessage || 'Sin lectura ejecutiva disponible.',
    },
    {
      label: 'Qué explica el resultado',
      text: (summary.highlights || [])[0] || findingsList[0] || 'Sin hallazgo principal disponible.',
    },
    {
      label: 'Qué hacer esta semana',
      text: firstAction?.action || topDeviation?.actionSuggested || 'Sin acción inmediata sugerida.',
    },
  ];

  executiveSummary.innerHTML = blocks.map((block) => `
    <article class="summary-block">
      <span class="summary-label">${escapeHtml(block.label)}</span>
      <p>${escapeHtml(block.text)}</p>
    </article>
  `).join('');
}

function renderInsightsKpis(comparison, summary, topDeviation) {
  if (!insightsKpis || !comparison || !summary) {
    if (insightsKpis) insightsKpis.innerHTML = '<p class="muted">Sin indicadores ejecutivos para este mes.</p>';
    return;
  }

  const cards = [
    {
      label: 'Cumplimiento general',
      value: summary.metBudget ? 'Cumplido' : 'En riesgo',
      tone: summary.metBudget ? 'ok' : 'danger',
      detail: `${formatNumber(comparison.kpis.cumplidas || 0)} líneas cumplidas`,
    },
    {
      label: 'Líneas en incumplimiento',
      value: formatNumber(comparison.kpis.incumplidas || 0),
      tone: Number(comparison.kpis.incumplidas || 0) > 0 ? 'danger' : 'ok',
      detail: `${formatNumber(comparison.rows?.length || 0)} líneas evaluadas`,
    },
    {
      label: 'Mayor desvío',
      value: topDeviation ? `${formatNumber(Math.abs(topDeviation.variationPct || 0))}%` : '0%',
      tone: topDeviation ? buildSeverityTone(topDeviation) : 'ok',
      detail: topDeviation?.lineLabel || 'Sin desvíos relevantes',
    },
    {
      label: 'Impacto en utilidad',
      value: formatCurrency(summary.rentabilityImpact || 0),
      tone: Number(summary.rentabilityImpact || 0) >= 0 ? 'ok' : 'danger',
      detail: `Mes ${escapeHtml(summary.month || selectedMonth())}`,
    },
  ];

  insightsKpis.innerHTML = cards.map((card) => `
    <article class="insight-kpi insight-kpi-${card.tone}">
      <small>${escapeHtml(card.label)}</small>
      <strong>${escapeHtml(card.value)}</strong>
      <span>${escapeHtml(card.detail)}</span>
    </article>
  `).join('');
}

function renderTopDeviations(rows) {
  if (!topDeviations) return;
  if (!rows.length) {
    topDeviations.innerHTML = '<p class="muted">Sin desvíos relevantes.</p>';
    return;
  }

  topDeviations.innerHTML = `<div class="deviation-list">${rows.map((row, index) => `
    <article class="deviation-item">
      <div class="deviation-rank">${index + 1}</div>
      <div class="deviation-body">
        <div class="deviation-topline">
          <strong>${escapeHtml(row.lineLabel || row.line || 'Sin línea')}</strong>
          <span class="priority-badge priority-${buildSeverityTone(row)}">${escapeHtml(row.priority || row.status || 'Media')}</span>
        </div>
        <div class="deviation-meta">
          <span>${formatCurrency(row.variation || 0)}</span>
          <span>${formatNumber(Math.abs(row.variationPct || 0))}%</span>
          <span>${escapeHtml(row.status || 'Seguimiento')}</span>
        </div>
      </div>
    </article>
  `).join('')}</div>`;
}

function renderActionPlanExecutive(rows) {
  if (!actionPlan) return;
  if (!rows.length) {
    actionPlan.innerHTML = '<p class="muted">Sin acciones sugeridas para este mes.</p>';
    return;
  }

  actionPlan.innerHTML = `
    <div class="table-wrap action-plan-wrap">
      <table class="action-plan-table">
        <thead>
          <tr>
            <th>Línea</th>
            <th>Desvío</th>
            <th>Impacto</th>
            <th>Responsable</th>
            <th>Acción inmediata</th>
            <th>Prioridad</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.line || '-')}</strong>
              </td>
              <td>
                <span class="metric-pill">${escapeHtml(truncateText(row.problem, 46))}</span>
              </td>
              <td title="${escapeHtml(row.possibleCause || '')}">${escapeHtml(truncateText(row.possibleCause, 54))}</td>
              <td>${escapeHtml(row.responsibleSuggested || '-')}</td>
              <td title="${escapeHtml(row.action || '')}">${escapeHtml(truncateText(row.action, 64))}</td>
              <td><span class="priority-badge priority-${String(row.priority || 'Media').toLowerCase()}">${escapeHtml(row.priority || 'Media')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStandardPygTables(execution) {
  if (!analysisStandard) return;
  const contableRows = execution?.contable?.standardTable || execution?.contable?.pygTable || [];
  const gerencialRows = execution?.gerencial?.standardTable || execution?.gerencial?.pygTable || [];

  if (!contableRows.length && !gerencialRows.length) {
    analysisStandard.innerHTML = '<p class="muted">Sin P&G est?ndar disponible.</p>';
    return;
  }

  const makeRows = (rows) => rows.map((row) =>
    '<tr>' +
      '<td>' + escapeHtml(row.lineLabel || '-') + '</td>' +
      '<td>' + (row.value === null || row.value === undefined ? '-' : formatCurrency(row.value)) + '</td>' +
    '</tr>'
  ).join('');

  analysisStandard.innerHTML =
    '<div class="analysis-standard-grid">' +
      '<section>' +
        '<h4>Contable</h4>' +
        '<div class="table-wrap compact-table"><table><thead><tr><th>L?nea</th><th>Valor</th></tr></thead><tbody>' + makeRows(contableRows) + '</tbody></table></div>' +
      '</section>' +
      '<section>' +
        '<h4>Gerencial ajustado</h4>' +
        '<div class="table-wrap compact-table"><table><thead><tr><th>L?nea</th><th>Valor</th></tr></thead><tbody>' + makeRows(gerencialRows) + '</tbody></table></div>' +
      '</section>' +
    '</div>';
}

function renderDetailedPyg(execution) {
  if (!analysisDetailed) return;
  const rows = execution?.contable?.detailedTable || [];
  if (!rows.length) {
    analysisDetailed.innerHTML = '<p class="muted">Sin detalle por subrubros disponible.</p>';
    return;
  }

  renderTable(analysisDetailed, rows, [
    { key: 'sectionLabel', label: 'Secci?n P&G' },
    { key: 'subgroup', label: 'Subgrupo' },
    { key: 'value', label: 'Valor', currency: true },
    { key: 'accountCount', label: 'Cuentas', number: true },
  ]);
}

function renderManagerialAdjustments(execution) {
  if (!analysisAdjustments) return;
  const rows = execution?.managerialAdjustments || [];
  const totals = execution?.gerencial?.totals || {};
  const contableTotals = execution?.contable?.totals || {};

  if (!rows.length) {
    analysisAdjustments.innerHTML =
      '<div class="note-stack">' +
        '<p class="muted">No se identificaron exclusiones gerenciales autom?ticas para este mes.</p>' +
        '<div class="metric-card-inline"><span>Utilidad contable antes impuestos</span><strong>' + formatCurrency(contableTotals.utilidad_antes_impuestos || 0) + '</strong></div>' +
        '<div class="metric-card-inline"><span>ICA estimado gerencial</span><strong>' + formatCurrency(totals.ica_estimado_gerencial || 0) + '</strong></div>' +
        '<div class="metric-card-inline"><span>Utilidad gerencial ajustada</span><strong>' + formatCurrency(totals.utilidad_gerencial_ajustada || totals.utilidad_antes_impuestos || 0) + '</strong></div>' +
      '</div>';
    return;
  }

  const totalExcluded = rows.reduce((sum, row) => sum + Number(row.excludedValue || 0), 0);
  analysisAdjustments.innerHTML =
    '<div class="adjustment-summary">' +
      '<article class="metric-card-inline"><span>Valor excluido sugerido</span><strong>' + formatCurrency(totalExcluded) + '</strong></article>' +
      '<article class="metric-card-inline"><span>Utilidad contable antes impuestos</span><strong>' + formatCurrency(contableTotals.utilidad_antes_impuestos || 0) + '</strong></article>' +
      '<article class="metric-card-inline"><span>ICA estimado gerencial</span><strong>' + formatCurrency(totals.ica_estimado_gerencial || 0) + '</strong></article>' +
      '<article class="metric-card-inline"><span>Utilidad gerencial ajustada</span><strong>' + formatCurrency(totals.utilidad_gerencial_ajustada || totals.utilidad_antes_impuestos || 0) + '</strong></article>' +
    '</div>' +
    '<div class="table-wrap compact-table"><table><thead><tr><th>Cuenta</th><th>Secci?n</th><th>Subgrupo</th><th>Valor excluido</th><th>Raz?n</th></tr></thead><tbody>' +
    rows.map((row) =>
      '<tr>' +
        '<td><strong>' + escapeHtml(row.account) + '</strong><br><span class="muted-inline">' + escapeHtml(row.accountName) + '</span></td>' +
        '<td>' + escapeHtml(row.sectionLabel || '-') + '</td>' +
        '<td>' + escapeHtml(row.subgroup || '-') + '</td>' +
        '<td>' + formatCurrency(row.excludedValue || 0) + '</td>' +
        '<td>' + escapeHtml(row.reason || '-') + '</td>' +
      '</tr>'
    ).join('') +
    '</tbody></table></div>';
}

function renderAccountMapping(execution) {
  if (!analysisMapping) return;
  const rows = execution?.accountMapping || [];
  if (!rows.length) {
    analysisMapping.innerHTML = '<p class="muted">Sin mapeo de cuentas disponible.</p>';
    return;
  }

  renderTable(analysisMapping, rows, [
    { key: 'account', label: 'Cuenta' },
    { key: 'accountName', label: 'Nombre cuenta' },
    { key: 'saldoOriginal', label: 'Saldo original', currency: true },
    { key: 'valorPyg', label: 'Valor P&G', currency: true },
    { key: 'seccionPyg', label: 'Secci?n P&G' },
    { key: 'subgrupo', label: 'Subgrupo' },
    { key: 'observacion', label: 'Observaci?n' },
  ]);
}

function renderInsightsDetails(findingsList, qualityList, execution) {
  if (!insightsDetails) return;

  const automaticNotes = execution?.automaticNotes || {};
  const sections = [
    { title: 'Hallazgos extendidos', rows: findingsList || [] },
    { title: 'Calidad de dato', rows: qualityList || [] },
    { title: 'Exclusiones sugeridas', rows: automaticNotes.exclusionsSuggested || [] },
    { title: 'Reclasificaciones sugeridas', rows: automaticNotes.reclassificationsSuggested || [] },
    { title: 'Cuentas sin descripci?n', rows: automaticNotes.missingDescriptions || [] },
    { title: 'Notas t?cnicas', rows: automaticNotes.technicalNotes || [] },
  ];

  insightsDetails.innerHTML =
    '<div class="insight-details-grid">' +
    sections.map((section) =>
      '<div>' +
        '<h4>' + escapeHtml(section.title) + '</h4>' +
        (section.rows.length
          ? '<ul class="detail-list">' + section.rows.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
          : '<p class="muted">Sin elementos en esta secci?n.</p>') +
      '</div>'
    ).join('') +
    '</div>';
}

function renderTrendChart(points) {
  trendChart.innerHTML = '';
  if (!points.length) {
    trendChart.innerHTML = '<text x="20" y="30" fill="#5b677a">Sin histórico disponible.</text>';
    return;
  }

  const padding = 36;
  const w = 900;
  const h = 260;

  const values = points.flatMap((p) => [p.utilidad_neta, p.utilidad_neta_presupuesto]);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 1);
  const span = maxV - minV || 1;

  const x = (idx) => padding + (idx * (w - padding * 2)) / Math.max(points.length - 1, 1);
  const y = (v) => h - padding - ((v - minV) * (h - padding * 2)) / span;

  const realPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.utilidad_neta)}`).join(' ');
  const budgetPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.utilidad_neta_presupuesto)}`).join(' ');

  const axis = `
    <line x1="${padding}" y1="${h - padding}" x2="${w - padding}" y2="${h - padding}" stroke="#c7d2df" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${h - padding}" stroke="#c7d2df" />
  `;

  const labels = points
    .map((p, i) => `<text x="${x(i)}" y="${h - 12}" font-size="11" text-anchor="middle" fill="#637387">${p.month}</text>`)
    .join('');

  trendChart.innerHTML = `
    ${axis}
    <path d="${budgetPath}" fill="none" stroke="#f59e0b" stroke-width="2" />
    <path d="${realPath}" fill="none" stroke="#0ea5a4" stroke-width="3" />
    <text x="${w - 190}" y="20" fill="#0ea5a4" font-size="12">Utilidad neta real</text>
    <text x="${w - 190}" y="38" fill="#f59e0b" font-size="12">Utilidad neta presupuesto</text>
    ${labels}
  `;
}

function renderAnalysis(payload) {
  state.analysis = payload;
  state.lineSettings = payload.lineSettings || state.lineSettings || [];
  state.notes = payload.notes || state.notes || [];
  state.actions = payload.actions || state.actions || [];
  state.monthStatus = payload.monthStatus || state.monthStatus || null;
  renderMonthStatusPanel();

  renderKpis(payload.comparison, payload.analysis.executiveSummary);
  renderTable(pygContable, payload.execution.contable.standardTable || payload.execution.contable.pygTable, [
    { key: 'lineLabel', label: 'L?nea' },
    { key: 'value', label: 'Valor', currency: true },
  ]);

  renderTable(pygGerencial, payload.execution.gerencial.standardTable || payload.execution.gerencial.pygTable, [
    { key: 'lineLabel', label: 'L?nea' },
    { key: 'value', label: 'Valor', currency: true },
  ]);

  renderTable(comparisonTable, payload.comparison?.rows || [], [
    { key: 'lineLabel', label: 'L?nea' },
    { key: 'budget', label: 'Presupuesto', currency: true },
    { key: 'real', label: 'Real', currency: true },
    { key: 'variation', label: 'Variaci?n $', currency: true },
    { key: 'variationPct', label: 'Variaci?n %', percent: true },
    { key: 'favorable', label: 'Favorable', boolean: true },
    { key: 'status', label: 'Estado', badge: true },
    { key: 'priority', label: 'Prioridad' },
    { key: 'comment', label: 'Comentario' },
    { key: 'actionSuggested', label: 'Acci?n sugerida' },
    { key: 'responsibleSuggested', label: 'Responsable sugerido' },
  ]);

  const comparisonRows = payload.comparison?.rows || [];
  const topDeviationRows = comparisonRows
    .filter((row) => Number.isFinite(Number(row.variationPct)))
    .sort((a, b) => Math.abs(Number(b.variationPct || 0)) - Math.abs(Number(a.variationPct || 0)))
    .slice(0, 5);
  const findingsList = payload.analysis.findings || [];
  const qualityList = payload.analysis.dataQualityAlerts || [];
  const actionRows = payload.analysis.actionPlan || [];

  renderInsightsKpis(payload.comparison, payload.analysis.executiveSummary, topDeviationRows[0] || null);
  renderInsightsSummary(payload.analysis.executiveSummary, findingsList, topDeviationRows[0] || null, actionRows[0] || null);
  renderTopDeviations(topDeviationRows);
  renderActionPlanExecutive(actionRows);
  renderStandardPygTables(payload.execution);
  renderDetailedPyg(payload.execution);
  renderManagerialAdjustments(payload.execution);
  renderAccountMapping(payload.execution);
  renderInsightsDetails(findingsList, qualityList, payload.execution);

  renderLineSettingsSprint2(state.lineSettings);
  renderNotesSprint2(state.notes);
  renderActionsSprint2(state.actions);

  exportLink.href = companyQuery(`/api/export/${state.month}`);
  exportLink.classList.remove('disabled');

  renderBudgetModule(payload.budget);
}

async function loadBudgetOnly() {
  const payload = await api(companyQuery(`/api/budget/${state.month}`));
  state.monthStatus = payload.monthStatus || state.monthStatus || null;
  renderMonthStatusPanel();
  renderBudgetModule(payload.budget);
}

async function loadTrend() {
  const payload = await api(companyQuery('/api/history/trend'));
  state.trend = payload.trend || [];
  renderTrendChart(state.trend);

  const activeYear = String(selectedMonth()).slice(0, 4);
  const yearlyRows = state.trend.filter((row) => String(row.month || '').startsWith(activeYear + '-'));

  const trendRowsWithTotal = [...state.trend];
  if (yearlyRows.length) {
    const annualTotal = yearlyRows.reduce(
      (acc, row) => ({
        ingresos_operacionales: acc.ingresos_operacionales + Number(row.ingresos_operacionales || 0),
        utilidad_operacional: acc.utilidad_operacional + Number(row.utilidad_operacional || 0),
        utilidad_neta: acc.utilidad_neta + Number(row.utilidad_neta || 0),
        utilidad_neta_presupuesto: acc.utilidad_neta_presupuesto + Number(row.utilidad_neta_presupuesto || 0),
      }),
      {
        ingresos_operacionales: 0,
        utilidad_operacional: 0,
        utilidad_neta: 0,
        utilidad_neta_presupuesto: 0,
      }
    );

    trendRowsWithTotal.push({
      month: 'TOTAL ' + activeYear,
      ...annualTotal,
    });
  }

  renderTable(trendTable, trendRowsWithTotal, [
    { key: 'month', label: 'Mes' },
    { key: 'ingresos_operacionales', label: 'Ingresos', currency: true },
    { key: 'utilidad_operacional', label: 'Utilidad operacional', currency: true },
    { key: 'utilidad_neta', label: 'Utilidad neta real', currency: true },
    { key: 'utilidad_neta_presupuesto', label: 'Utilidad neta presupuesto', currency: true },
  ]);
}
async function loadMonthData() {
  if (!state.activeCompanyId) {
    setGlobalMessage('Crea una empresa para comenzar.', true);
    return;
  }

  try {
    state.month = selectedMonth();
    updateActivePeriodHints();
    setGlobalMessage(`Cargando datos de ${state.month} para la empresa activa...`);

    let analysisLoaded = false;
    try {
      const payload = await api(companyQuery(`/api/analysis/${state.month}`));
      renderAnalysis(payload);
      analysisLoaded = true;
    } catch (_error) {
      analysisLoaded = false;
    }

    if (!analysisLoaded) {
      await loadBudgetOnly();
      kpiCards.innerHTML = '<p class="muted">Aún no hay ejecución procesada para este mes en esta empresa.</p>';
      pygContable.innerHTML = '';
      pygGerencial.innerHTML = '';
      comparisonTable.innerHTML = '';
      insightsKpis.innerHTML = '<p class="muted">Sin indicadores ejecutivos para este mes.</p>';
      executiveSummary.innerHTML = '<p class="muted">Sin resumen ejecutivo para este mes.</p>';
      topDeviations.innerHTML = '<p class="muted">Sin desvíos relevantes.</p>';
      insightsDetails.innerHTML = '';
      actionPlan.innerHTML = '<p class="muted">Sin acciones sugeridas para este mes.</p>';
      exportLink.classList.add('disabled');
    }

    await loadTrend();
    await loadSprint2Panels().catch(() => {});
    await loadActionsOverview().catch(() => {});
    const activeCompany = getActiveCompany();
    setGlobalMessage(`Mes ${state.month} listo para ${activeCompany?.name || 'empresa activa'}.`);
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
}

async function processWithConflict(handler, buildPayload, messageTarget, replacePrompt) {
  try {
    await handler(false);
  } catch (error) {
    if (error.status === 409) {
      const confirmReplace = window.confirm(replacePrompt);
      if (!confirmReplace) {
        messageTarget.textContent = 'Operación cancelada por el usuario.';
        return;
      }

      await handler(true);
      return;
    }

    throw error;
  }
}

executionUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!ensureMonthEditableClient('cargar o reemplazar la ejecución del mes')) {
    return;
  }

  const file = executionFile.files[0];
  if (!file) {
    executionUploadMsg.textContent = 'Selecciona un archivo primero.';
    return;
  }

  try {
    executionUploadMsg.textContent = 'Subiendo ejecución...';
    const formData = new FormData();
    formData.append('file', file);

    const payload = await api('/api/execution/upload', { method: 'POST', body: formData });
    state.executionUpload = payload;
    executionUploadMsg.textContent = `Archivo cargado (${payload.totalRows} filas).`;

    executionMappingFields.forEach((field) => {
      const select = executionProcessForm.elements[field];
      select.innerHTML = buildSelectOptions(payload.headers, autoSelect(payload.headers, field));
    });

    renderPreview(executionPreview, payload.headers, payload.previewRows || []);
  } catch (error) {
    executionUploadMsg.textContent = error.message;
  }
});

executionProcessForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.executionUpload.fileId) {
    executionUploadMsg.textContent = 'Primero sube archivo de ejecución.';
    return;
  }

  executionUploadMsg.textContent = 'Procesando ejecución...';

  try {
    state.month = selectedMonth();
    const mapping = Object.fromEntries(new FormData(executionProcessForm).entries());

    await processWithConflict(
      async (forceReplace) => {
        await api('/api/execution/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: state.activeCompanyId,
            fileId: state.executionUpload.fileId,
            mapping,
            month: state.month,
            forceReplace,
          }),
        });
      },
      () => ({}),
      executionUploadMsg,
      `Ya existe ejecución para ${state.month} en esta empresa. ¿Deseas reemplazarla?`
    );

    executionUploadMsg.textContent = 'Ejecucion procesada correctamente.';
    await loadMonthData();
  } catch (error) {
    executionUploadMsg.textContent = error.message;
  }
});

budgetUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!ensureMonthEditableClient('cargar o reemplazar el presupuesto del mes')) {
    return;
  }

  const file = budgetFile.files[0];
  if (!file) {
    budgetUploadMsg.textContent = 'Selecciona archivo de presupuesto.';
    return;
  }

  try {
    budgetUploadMsg.textContent = 'Subiendo presupuesto...';
    const formData = new FormData();
    formData.append('file', file);

    const payload = await api('/api/budget/upload', { method: 'POST', body: formData });
    state.budgetUpload = payload;
    budgetUploadMsg.textContent = `Archivo presupuesto cargado (${payload.totalRows} filas).`;

    budgetMappingFields.forEach((field) => {
      const select = budgetProcessForm.elements[field];
      select.innerHTML = buildSelectOptions(payload.headers, autoSelect(payload.headers, field));
    });
  } catch (error) {
    budgetUploadMsg.textContent = error.message;
  }
});

budgetProcessForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.budgetUpload.fileId) {
    budgetUploadMsg.textContent = 'Primero sube archivo de presupuesto.';
    return;
  }

  budgetUploadMsg.textContent = 'Procesando presupuesto...';

  try {
    state.month = selectedMonth();
    const mapping = Object.fromEntries(new FormData(budgetProcessForm).entries());

    await processWithConflict(
      async (forceReplace) => {
        await api('/api/budget/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: state.activeCompanyId,
            fileId: state.budgetUpload.fileId,
            mapping,
            month: state.month,
            forceReplace,
          }),
        });
      },
      () => ({}),
      budgetUploadMsg,
      `Ya existe presupuesto para ${state.month} en esta empresa. ¿Deseas reemplazarlo?`
    );

    budgetUploadMsg.textContent = 'Presupuesto procesado correctamente.';
    await loadMonthData();
  } catch (error) {
    budgetUploadMsg.textContent = error.message;
  }
});

btnSaveBudget.addEventListener('click', async () => {
  try {
    state.month = selectedMonth();
    const items = collectManualBudget();

    await processWithConflict(
      async (forceReplace) => {
        await api('/api/budget/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: state.activeCompanyId,
            month: state.month,
            items,
            forceReplace,
          }),
        });
      },
      () => ({}),
      globalMessage,
      `Ya existe presupuesto para ${state.month} en esta empresa. ¿Deseas reemplazarlo con la edición manual?`
    );

    setGlobalMessage('Presupuesto manual guardado.');
    await loadMonthData();
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
});

btnDeleteExecution.addEventListener('click', async () => {
  if (!state.activeCompanyId) return;
  state.month = selectedMonth();

  const companyName = getActiveCompany()?.name || 'empresa activa';
  const confirmed = window.confirm(`Vas a borrar la EJECUCIÓN de ${state.month} para ${companyName}. Esta acción no se puede deshacer. ¿Continuar?`);
  if (!confirmed) return;

  try {
    await api(companyQuery(`/api/data?month=${encodeURIComponent(state.month)}&type=ejecución`), {
      method: 'DELETE',
    });
    setGlobalMessage('Ejecucion borrada correctamente.');
    await loadMonthData();
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
});

btnDeleteBudget.addEventListener('click', async () => {
  if (!state.activeCompanyId) return;
  state.month = selectedMonth();

  const companyName = getActiveCompany()?.name || 'empresa activa';
  const confirmed = window.confirm(`Vas a borrar el PRESUPUESTO de ${state.month} para ${companyName}. Esta acción no se puede deshacer. ¿Continuar?`);
  if (!confirmed) return;

  try {
    await api(companyQuery(`/api/data?month=${encodeURIComponent(state.month)}&type=presupuesto`), {
      method: 'DELETE',
    });
    setGlobalMessage('Presupuesto borrado correctamente.');
    await loadMonthData();
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
});

btnAddCompany.addEventListener('click', async () => {
  const name = window.prompt('Nombre de la nueva empresa:');
  if (name === null) return;

  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) {
    setGlobalMessage('Nombre invalido. Debe tener al menos 2 caracteres.', true);
    return;
  }

  try {
    const payload = await api('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName }),
    });

    await loadCompanies(false);
    state.activeCompanyId = payload.company?.id || state.activeCompanyId;
    renderCompanyTabs();
    updateActiveCompanyLabel();
    await loadAvailableMonths().catch(() => { state.availableMonths = []; });
    monthInput.value = resolveInitialMonth();
    state.month = selectedMonth();
    updateBudgetTemplateLink();
    await loadMonthData();
    setGlobalMessage(`Empresa '${cleanName}' creada y activada.`);
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
});

btnDeleteCompany.addEventListener('click', async () => {
  if (!state.activeCompanyId) return;

  const company = getActiveCompany();
  const companyName = company?.name || 'empresa activa';

  const confirmed = window.confirm(
    `Vas a eliminar COMPLETAMENTE la empresa '${companyName}' con todo su histórico. Esta acción no se puede deshacer. ¿Continuar?`
  );
  if (!confirmed) return;

  try {
    await api(`/api/companies/${encodeURIComponent(state.activeCompanyId)}`, { method: 'DELETE' });
    await loadCompanies(false);
    await loadMonthData();
    setGlobalMessage(`Empresa '${companyName}' eliminada correctamente.`);
  } catch (error) {
    setGlobalMessage(error.message, true);
  }
});

btnRefresh.addEventListener('click', loadMonthData);
monthInput.addEventListener('change', () => {
  state.month = selectedMonth();
  updateActivePeriodHints();
  updateBudgetTemplateLink();
  updateProcessButtonsState();
});

function initializeWorkspaceShell() {
  if (state.workspaceBooted) {
    return;
  }

  bindNavigation();
  const initialView = window.location.hash.replace('#', '').trim();
  if (viewTitles[initialView]) {
    state.activeView = initialView;
  }
  renderActiveView();
  state.workspaceBooted = true;
}

async function bootWorkspace() {
  initializeWorkspaceShell();
  state.meta = await api('/api/meta');
  await loadCompanies(false);
  monthInput.value = resolveInitialMonth();
  state.month = selectedMonth();
  updateActivePeriodHints();
  updateBudgetTemplateLink();

  if (!state.activeCompanyId) {
    setGlobalMessage('No hay empresa activa. Crea una nueva empresa.', true);
    return;
  }

  await loadMonthData();
}

async function handleAuthenticatedEntry(payload, successMessage = '') {
  applyAuthPayload(payload || {});
  resetAuthForms();
  await bootWorkspace();
  if (successMessage) {
    setGlobalMessage(successMessage);
  }
}

async function boot() {
  initializeWorkspaceShell();
  const payload = await loadAuthSession();
  if (!payload?.authenticated) {
    if (!payload?.setupRequired) {
      setAuthMessage('Ingresa con tu cuenta de administrador para usar la aplicación.');
    }
    return;
  }

  await bootWorkspace();
}

boot().catch((error) => {
  lockWorkspaceForAuth();
  setAuthMessage(error.message || 'No fue posible iniciar la aplicación.', true);
  setGlobalMessage(error.message || 'No fue posible iniciar la aplicación.', true);
});

function renderLineSettingsSprint2(items) {
  if (!lineSettingsContainer) return;
  const rows = Array.isArray(items) ? items : [];
  lineSettingsContainer.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Línea</th><th>Tipo</th><th>Tolerancia %</th><th>Responsable</th><th>Prioridad</th><th>Activa</th></tr></thead><tbody>' + rows.map((row) => '<tr data-line-key="' + row.lineKey + '"><td>' + row.lineLabel + '</td><td>' + row.typeLine + '</td><td><input type="number" min="0" step="0.1" data-field="tolerancePct" value="' + Number(row.tolerancePct || 0) + '" /></td><td><input type="text" data-field="responsibleSuggested" value="' + (row.responsibleSuggested || '') + '" /></td><td><select data-field="priority"><option ' + (row.priority === 'Alta' ? 'selected' : '') + '>Alta</option><option ' + (row.priority === 'Media' ? 'selected' : '') + '>Media</option><option ' + (row.priority === 'Baja' ? 'selected' : '') + '>Baja</option></select></td><td><input type="checkbox" data-field="active" ' + (row.active !== false ? 'checked' : '') + ' /></td></tr>').join('') + '</tbody></table></div>';
}

function collectLineSettingsSprint2() {
  if (!lineSettingsContainer) return [];
  return Array.from(lineSettingsContainer.querySelectorAll('tbody tr')).map((tr) => ({
    lineKey: tr.getAttribute('data-line-key'),
    tolerancePct: Number(tr.querySelector('[data-field="tolerancePct"]').value || 0),
    responsibleSuggested: tr.querySelector('[data-field="responsibleSuggested"]').value || '',
    priority: tr.querySelector('[data-field="priority"]').value || 'Media',
    active: tr.querySelector('[data-field="active"]').checked,
  }));
}

function renderExecutiveBoardSprint2(board) {
  if (!executiveBoard) return;
  if (!board) {
    executiveBoard.innerHTML = '<p class="muted">Sin tablero ejecutivo para este mes.</p>';
    return;
  }
  executiveBoard.innerHTML = '<div class="kpi-grid"><article class="kpi"><small>Empresa</small><strong>' + board.companyName + '</strong></article><article class="kpi"><small>Mes</small><strong>' + board.month + '</strong></article><article class="kpi"><small>Cumplimiento general</small><strong>' + formatNumber(board.compliancePct || 0) + '%</strong></article><article class="kpi"><small>Utilidad presupuesto</small><strong>' + formatCurrency(board.utilityBudget || 0) + '</strong></article><article class="kpi"><small>Utilidad real</small><strong>' + formatCurrency(board.utilityReal || 0) + '</strong></article></div>' +
    '<div class="grid-2"><div><h3>Top 5 desvíos desfavorables</h3><ul>' + ((board.topUnfavorable || []).map((x) => '<li>' + x.lineLabel + ': ' + formatNumber(Math.abs(x.variationPct || 0)) + '%</li>').join('') || '<li>Sin desvíos.</li>') + '</ul></div><div><h3>Top 5 favorables</h3><ul>' + ((board.topFavorable || []).map((x) => '<li>' + x.lineLabel + ': ' + formatNumber(Math.abs(x.variationPct || 0)) + '%</li>').join('') || '<li>Sin favorables.</li>') + '</ul></div></div>' +
    '<div class="grid-2"><div><h3>Líneas en incumplimiento</h3><ul>' + ((board.incumplidas || []).map((x) => '<li>' + x.lineLabel + '</li>').join('') || '<li>Ninguna.</li>') + '</ul></div><div><h3>Alertas de calidad de dato</h3><ul>' + ((board.dataQualityAlerts || []).map((x) => '<li>' + x + '</li>').join('') || '<li>Sin alertas.</li>') + '</ul></div></div>'; 
}

function renderMonthStatusPanel() {
  const status = state.monthStatus || {
    month: selectedMonth(),
    closed: false,
    closedAt: null,
    managerialComment: '',
    reopenedAt: null,
  };

  if (monthStatusBadge) {
    monthStatusBadge.textContent = status.closed ? 'Cerrado' : 'Abierto';
    monthStatusBadge.classList.toggle('closed', Boolean(status.closed));
  }

  if (!monthStatusPanel) {
    updateProcessButtonsState();
    return;
  }

  monthStatusPanel.innerHTML = `
    <div class="month-status-card ${status.closed ? 'soft-disabled' : ''}">
      ${status.closed ? `<div class="lock-message"><strong>Mes bloqueado para cambios base.</strong><br />Puedes seguir consultando reportes, histórico, observaciones y acciones.</div>` : '<p class="muted">El mes está abierto. Puedes cargar, editar y borrar información base.</p>'}
      <div class="info-grid">
        <div class="info-card"><small>Mes activo</small><strong>${escapeHtml(status.month || selectedMonth())}</strong></div>
        <div class="info-card"><small>Fecha cierre</small><strong>${escapeHtml(status.closedAt || 'Sin cierre')}</strong></div>
        <div class="info-card"><small>Fecha reapertura</small><strong>${escapeHtml(status.reopenedAt || 'Sin reapertura')}</strong></div>
      </div>
      <label>Comentario gerencial final
        <textarea id="month-close-comment" rows="4" placeholder="Resumen gerencial obligatorio para cerrar el mes">${escapeHtml(status.managerialComment || '')}</textarea>
      </label>
      <div class="actions-inline wrap-actions">
        <button id="btn-close-month" class="btn" ${status.closed ? 'disabled' : ''}>Cerrar mes</button>
        <button id="btn-reopen-month" class="btn btn-secondary" ${status.closed ? '' : 'disabled'}>Reabrir mes</button>
      </div>
    </div>
  `;

  const commentInput = document.getElementById('month-close-comment');
  const btnCloseMonth = document.getElementById('btn-close-month');
  const btnReopenMonth = document.getElementById('btn-reopen-month');

  if (commentInput) {
    commentInput.disabled = Boolean(status.closed);
  }

  btnCloseMonth.addEventListener('click', async () => {
    const managerialComment = String(commentInput.value || '').trim();
    if (!managerialComment) {
      setGlobalMessage('Debes ingresar un comentario gerencial antes de cerrar el mes.', true);
      return;
    }
    const confirmed = window.confirm(`Vas a cerrar el mes ${selectedMonth()}. Se bloquearán los cambios base. \u00bfContinuar?`);
    if (!confirmed) return;

    const payload = await api(companyQuery(`/api/month-status/${selectedMonth()}/close`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerialComment }),
    });
    state.monthStatus = payload.monthStatus || null;
    renderMonthStatusPanel();
    setGlobalMessage(payload.message || `Mes ${selectedMonth()} cerrado correctamente.`);
    await loadActionsOverview().catch(() => {});
  });

  btnReopenMonth.addEventListener('click', async () => {
    const confirmed = window.confirm(`Vas a reabrir el mes ${selectedMonth()}. ¿Continuar?`);
    if (!confirmed) return;

    const payload = await api(companyQuery(`/api/month-status/${selectedMonth()}/reopen`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    state.monthStatus = payload.monthStatus || null;
    renderMonthStatusPanel();
    setGlobalMessage(payload.message || `Mes ${selectedMonth()} reabierto correctamente.`);
    await loadActionsOverview().catch(() => {});
  });

  updateProcessButtonsState();
}

function renderAuditLogsSprint2(logs) {
  renderTable(auditLogTable, logs || [], [
    { key: 'dateTime', label: 'Fecha' },
    { key: 'eventType', label: 'Evento' },
    { key: 'dataType', label: 'Dato' },
    { key: 'month', label: 'Mes' },
    { key: 'fileName', label: 'Archivo' },
    { key: 'rowsRead', label: 'Filas leidas', number: true },
    { key: 'rowsProcessed', label: 'Filas procesadas', number: true },
    { key: 'resultStatus', label: 'Estado' },
    { key: 'messageSummary', label: 'Resumen' },
  ]);
}

function renderNotesSprint2(notes) {
  if (!notesList) return;
  const rows = Array.isArray(notes) ? notes : [];
  notesList.innerHTML = rows.length
    ? '<ul>' + rows.map((n) => '<li data-id="' + n.id + '"><strong>' + (n.author || 'Gerencia') + '</strong> (' + (n.dateTime || '') + '): ' + n.textObservation + ' <button class="btn btn-delete-note" data-id="' + n.id + '">Eliminar</button></li>').join('') + '</ul>'
    : '<p class="muted">Sin observaciones registradas.</p>';

  Array.from(notesList.querySelectorAll('.btn-delete-note')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const noteId = btn.getAttribute('data-id');
      if (!noteId) return;

      const confirmed = window.confirm('Vas a eliminar esta observación. ¿Continuar?');
      if (!confirmed) return;

      btn.disabled = true;
      try {
        const payload = await api(companyQuery('/api/month-notes/' + selectedMonth() + '/' + encodeURIComponent(noteId)), {
          method: 'DELETE',
        });
        state.notes = payload.notes || [];
        renderNotesSprint2(state.notes);
        setGlobalMessage('Observación eliminada correctamente');
        await loadMonthData();
        await loadSprint2Panels().catch(() => {});
      } catch (error) {
        setGlobalMessage(error.message || 'No fue posible eliminar la observación.', true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderActionsSprint2(actions) {
  if (!actionsList) return;
  const rows = Array.isArray(actions) ? actions : [];
  actionsList.innerHTML = rows.length ? '<div class="table-wrap"><table><thead><tr><th>Línea</th><th>Problema</th><th>Acción</th><th>Responsable</th><th>Prioridad</th><th>Compromiso</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' + rows.map((a) => '<tr data-id="' + a.id + '"><td>' + (a.linePyg || '') + '</td><td>' + (a.problemDetected || '') + '</td><td>' + (a.actionDefined || '') + '</td><td>' + (a.responsible || '') + '</td><td>' + (a.priority || '') + '</td><td>' + (a.dueDate || '') + '</td><td><select data-field="status"><option value="pendiente" ' + (a.status === 'pendiente' ? 'selected' : '') + '>pendiente</option><option value="en_proceso" ' + (a.status === 'en_proceso' ? 'selected' : '') + '>en_proceso</option><option value="cerrada" ' + (a.status === 'cerrada' ? 'selected' : '') + '>cerrada</option></select></td><td><button class="btn btn-save-action-state" data-id="' + a.id + '">Guardar</button> <button class="btn btn-danger btn-delete-action" data-id="' + a.id + '">Eliminar</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Sin acciones registradas.</p>'; 

  Array.from(actionsList.querySelectorAll('.btn-save-action-state')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = (state.actions || []).find((x) => x.id === id);
      if (!action) return;
      const tr = actionsList.querySelector('tr[data-id="' + id + '"]');
      const status = tr.querySelector('[data-field="status"]').value || action.status;
      const payload = await api(companyQuery('/api/month-actions/' + selectedMonth()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...action, status }),
      });
      state.actions = payload.actions || [];
      renderActionsSprint2(state.actions);
      setGlobalMessage('Acción actualizada correctamente');
    });
  });

  Array.from(actionsList.querySelectorAll('.btn-delete-action')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const actionId = btn.getAttribute('data-id');
      if (!actionId) return;

      const confirmed = window.confirm('Vas a eliminar esta acción. ¿Continuar?');
      if (!confirmed) return;

      btn.disabled = true;
      try {
        const payload = await api(companyQuery('/api/month-actions/' + selectedMonth() + '/' + encodeURIComponent(actionId)), {
          method: 'DELETE',
        });
        state.actions = payload.actions || [];
        renderActionsSprint2(state.actions);
        setGlobalMessage('Acción eliminada correctamente');
        await loadMonthData();
        await loadSprint2Panels().catch(() => {});
      } catch (error) {
        setGlobalMessage(error.message || 'No fue posible eliminar la acción.', true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}


async function loadSprint2Panels() {
  if (!state.activeCompanyId) return;

  const month = selectedMonth();
  const [settingsRes, execRes, auditRes, notesRes, actionsRes, monthStatusRes] = await Promise.all([
    api(companyQuery('/api/settings/lines')),
    api(companyQuery('/api/executive/' + month)).catch(() => ({ board: null })),
    api(companyQuery('/api/audit-logs' + (((auditMonthFilter?.value || '').trim()) ? ('?month=' + encodeURIComponent(auditMonthFilter.value.trim())) : ''))).catch(() => ({ logs: [] })),
    api(companyQuery('/api/month-notes/' + month)).catch(() => ({ notes: [] })),
    api(companyQuery('/api/month-actions/' + month)).catch(() => ({ actions: [] })),
    api(companyQuery('/api/month-status/' + month)).catch(() => ({ monthStatus: null })),
  ]);

  state.lineSettings = settingsRes.items || [];
  state.notes = notesRes.notes || [];
  state.actions = actionsRes.actions || [];
  state.monthStatus = monthStatusRes.monthStatus || state.monthStatus || null;

  renderLineSettingsSprint2(state.lineSettings);
  renderExecutiveBoardSprint2(execRes.board || null);
  renderAuditLogsSprint2(auditRes.logs || []);
  renderNotesSprint2(state.notes);
  renderActionsSprint2(state.actions);
  renderMonthStatusPanel();

  if (actionLine && state.meta.pygLines) {
    actionLine.innerHTML = state.meta.pygLines.map((line) => '<option value="' + line.key + '">' + line.label + '</option>').join('');
  }
}

async function loadActionsOverview() {
  if (!state.activeCompanyId) return;
  const scope = actionsOverviewScope.value || 'month';
  const month = selectedMonth();
  const query = scope === 'all' ? '/api/actions-overview' : '/api/actions-overview?month=' + encodeURIComponent(month);
  const payload = await api(companyQuery(query));
  state.actionsOverview = payload.overview || null;
  renderActionsOverview();
}

function renderActionsOverview() {
  const overview = state.actionsOverview;
  if (!overview) {
    if (actionsOverviewSummary) actionsOverviewSummary.innerHTML = '<p class="muted">Sin seguimiento disponible.</p>';
    if (actionsOverviewSections) actionsOverviewSections.innerHTML = '';
    return;
  }

  const cards = [
    { label: 'Vencidas', value: overview.summary.overdue || 0 },
    { label: 'Por vencer', value: overview.summary.dueSoon || 0 },
    { label: 'Pendientes', value: overview.summary.pending || 0 },
    { label: 'En proceso', value: overview.summary.inProgress || 0 },
    { label: 'Incompletas', value: overview.summary.incomplete || 0 },
  ];

  if (actionsOverviewSummary) {
    actionsOverviewSummary.innerHTML = cards
      .map((card) => `<article class="kpi"><small>${card.label}</small><strong>${formatNumber(card.value)}</strong></article>`)
      .join('');
  }

  const sections = [
    { key: 'overdue', label: 'Acciones vencidas', tag: 'overdue' },
    { key: 'dueSoon', label: 'Acciones por vencer', tag: 'dueSoon' },
    { key: 'incomplete', label: 'Acciones incompletas', tag: 'incomplete' },
    { key: 'pending', label: 'Pendientes', tag: '' },
    { key: 'inProgress', label: 'En proceso', tag: '' },
  ];

  if (actionsOverviewSections) {
    actionsOverviewSections.innerHTML = sections.map((section) => {
      const rows = overview.sections?.[section.key] || [];
      const content = rows.length
        ? `<div class="action-track-list">${rows.map((item) => `
          <article class="action-track-item">
            <div class="action-track-top">
              <div>
                <strong>${escapeHtml(item.actionDefined)}</strong>
                <p class="muted">${escapeHtml(item.problemDetected)}</p>
              </div>
              <span class="section-tag ${section.tag}">${escapeHtml(item.status)}</span>
            </div>
            <div class="action-track-meta">
              <span class="meta-chip">Empresa: ${escapeHtml(item.companyName)}</span>
              <span class="meta-chip">Mes: ${escapeHtml(item.month)}</span>
              <span class="meta-chip">Línea: ${escapeHtml(item.linePyg)}</span>
              <span class="meta-chip">Responsable: ${escapeHtml(item.responsible)}</span>
              <span class="meta-chip">Prioridad: ${escapeHtml(item.priority)}</span>
              <span class="meta-chip ${item.missingDueDate ? 'alert' : ''}">Compromiso: ${escapeHtml(item.dueDateLabel)}</span>
            </div>
          </article>
        `).join('')}</div>`
        : '<p class="muted">Sin acciones en esta sección.</p>';

      return `<section class="overview-section"><div class="overview-header"><h3>${section.label}</h3><span class="section-tag ${section.tag}">${formatNumber(rows.length)}</span></div>${content}</section>`;
    }).join('');
  }
}

function renderPreviewCardSprint2(target, preview, onConfirm, onCancel) {
  if (!target) return;
  if (!preview) {
    target.innerHTML = '';
    return;
  }

  const destination = preview.destination || {};
  target.innerHTML = '<div class="preview-box"><h3>Vista previa de validación</h3>' +
    '<p class="muted">Empresa: ' + (destination.companyName || 'Sin empresa') + ' | Mes: ' + (destination.month || '-') + ' | Tipo: ' + (destination.dataType || '-') + '</p>' +
    '<p class="muted">Archivo: ' + (preview.fileName || '-') + '</p>' +
    '<p class="muted">Filas: ' + formatNumber(preview.totalRows || 0) + ' | Vacías: ' + formatNumber(preview.emptyRows || 0) + ' | Duplicados: ' + formatNumber(preview.duplicateCount || 0) + '</p>' +
    '<p class="muted">Filas procesables: ' + formatNumber(preview.rowsProcessed || 0) + ' | Conflicto: ' + (preview.conflict ? 'Sí' : 'No') + '</p>' +
    '<div class="actions-inline"><button class="btn" id="btn-preview-confirm">Confirmar guardado</button><button class="btn btn-danger" id="btn-preview-cancel">Cancelar</button></div></div>';

  target.querySelector('#btn-preview-confirm').addEventListener('click', onConfirm);
  target.querySelector('#btn-preview-cancel').addEventListener('click', onCancel);
}

executionProcessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (!state.activeCompanyId || !String(monthInput.value || '').trim()) {
      executionUploadMsg.textContent = 'Selecciona empresa activa y mes antes de procesar.';
      return;
    }
    if (!state.executionUpload.fileId) {
      executionUploadMsg.textContent = 'Primero sube archivo de ejecución.';
      return;
    }

    state.month = selectedMonth();
    const mapping = Object.fromEntries(new FormData(executionProcessForm).entries());
    const previewResp = await api('/api/execution/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: state.activeCompanyId, fileId: state.executionUpload.fileId, mapping, month: state.month }),
    });

    state.pendingExecutionProcess = { mapping, month: state.month };
    const previewMsg = 'Vista previa generada. Aún no se ha guardado nada. Debes confirmar guardado.';
    executionUploadMsg.textContent = previewMsg;
    setGlobalMessage(previewMsg);

    renderPreviewCardSprint2(executionPreviewPanel, previewResp.preview, async () => {
      try {
        await processWithConflict(
          async (forceReplace) => {
            await api('/api/execution/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: state.activeCompanyId,
                fileId: state.executionUpload.fileId,
                mapping: state.pendingExecutionProcess.mapping,
                month: state.pendingExecutionProcess.month,
                forceReplace,
              }),
            });
          },
          () => ({}),
          executionUploadMsg,
          'Ya existe ejecución para este mes y empresa. ¿Deseas reemplazarla?'
        );
        const successMsg = 'Guardado correctamente en ' + (getActiveCompany()?.name || 'empresa activa') + ' - ' + state.pendingExecutionProcess.month;
        executionUploadMsg.textContent = successMsg;
        setGlobalMessage(successMsg);
        state.pendingExecutionProcess = null;
        renderPreviewCardSprint2(executionPreviewPanel, null, null, null);
        await loadMonthData();
        await loadTrend();
        await loadSprint2Panels().catch(() => {});
      } catch (error) {
        executionUploadMsg.textContent = error.message;
      }
    }, () => {
      state.pendingExecutionProcess = null;
      executionUploadMsg.textContent = 'Carga cancelada. No se guardó información.';
      setGlobalMessage('Carga cancelada. No se guardó información.');
      renderPreviewCardSprint2(executionPreviewPanel, null, null, null);
    });
  } catch (error) {
    executionUploadMsg.textContent = error.message || 'No fue posible generar la vista previa.';
  }
}, true);

budgetProcessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (!state.activeCompanyId || !String(monthInput.value || '').trim()) {
      budgetUploadMsg.textContent = 'Selecciona empresa activa y mes antes de procesar.';
      return;
    }
    if (!state.budgetUpload.fileId) {
      budgetUploadMsg.textContent = 'Primero sube archivo de presupuesto.';
      return;
    }

    state.month = selectedMonth();
    const mapping = Object.fromEntries(new FormData(budgetProcessForm).entries());
    const previewResp = await api('/api/budget/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: state.activeCompanyId, fileId: state.budgetUpload.fileId, mapping, month: state.month }),
    });

    state.pendingBudgetProcess = { mapping, month: state.month };
    const previewMsg = 'Vista previa generada. Aún no se ha guardado nada. Debes confirmar guardado.';
    budgetUploadMsg.textContent = previewMsg;
    setGlobalMessage(previewMsg);

    renderPreviewCardSprint2(budgetPreviewPanel, previewResp.preview, async () => {
      try {
        await processWithConflict(
          async (forceReplace) => {
            await api('/api/budget/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: state.activeCompanyId,
                fileId: state.budgetUpload.fileId,
                mapping: state.pendingBudgetProcess.mapping,
                month: state.pendingBudgetProcess.month,
                forceReplace,
              }),
            });
          },
          () => ({}),
          budgetUploadMsg,
          'Ya existe presupuesto para este mes y empresa. ¿Deseas reemplazarlo?'
        );
        const successMsg = 'Guardado correctamente en ' + (getActiveCompany()?.name || 'empresa activa') + ' - ' + state.pendingBudgetProcess.month;
        budgetUploadMsg.textContent = successMsg;
        setGlobalMessage(successMsg);
        state.pendingBudgetProcess = null;
        renderPreviewCardSprint2(budgetPreviewPanel, null, null, null);
        await loadMonthData();
        await loadTrend();
        await loadSprint2Panels().catch(() => {});
      } catch (error) {
        budgetUploadMsg.textContent = error.message;
      }
    }, () => {
      state.pendingBudgetProcess = null;
      budgetUploadMsg.textContent = 'Carga cancelada. No se guardó información.';
      setGlobalMessage('Carga cancelada. No se guardó información.');
      renderPreviewCardSprint2(budgetPreviewPanel, null, null, null);
    });
  } catch (error) {
    budgetUploadMsg.textContent = error.message || 'No fue posible generar la vista previa.';
  }
}, true);

btnDuplicateBudget.addEventListener('click', async () => {
  if (!ensureMonthEditableClient('duplicar el presupuesto del mes')) {
    return;
  }

  try {
    state.month = selectedMonth();
    await processWithConflict(
      async (forceReplace) => {
        const payload = await api('/api/budget/duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: state.activeCompanyId,
            month: state.month,
            forceReplace,
          }),
        });
        if (budgetDuplicateMsg) {
          budgetDuplicateMsg.textContent = payload.message || '';
        }
      },
      () => ({}),
      budgetDuplicateMsg || globalMessage,
      'Ya existe presupuesto en el mes destino. ¿Deseas reemplazarlo?'
    );
    await loadMonthData();
  } catch (error) {
    if (budgetDuplicateMsg) {
      budgetDuplicateMsg.textContent = error.message;
    }
    setGlobalMessage(error.message, true);
  }
});

btnSaveLineSettings.addEventListener('click', async () => {
  const items = collectLineSettingsSprint2();
  const payload = await api(companyQuery('/api/settings/lines'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: state.activeCompanyId, items }),
  });
  state.lineSettings = payload.items || [];
  renderLineSettingsSprint2(state.lineSettings);
  setGlobalMessage('Configuración de líneas guardada.');
  await loadMonthData();
});

btnLoadAudit.addEventListener('click', async () => {
  const month = (auditMonthFilter.value || '').trim();
  const payload = await api(companyQuery('/api/audit-logs' + (month ? ('?month=' + encodeURIComponent(month)) : '')));
  renderAuditLogsSprint2(payload.logs || []);
});

btnRefreshActionsOverview.addEventListener('click', async () => {
  await loadActionsOverview().catch((error) => setGlobalMessage(error.message, true));
});

actionsOverviewScope.addEventListener('change', () => {
  loadActionsOverview().catch((error) => setGlobalMessage(error.message, true));
});

btnSaveNote.addEventListener('click', async () => {
  const textObservation = String(noteTextInput.value || '').trim();
  if (!textObservation) {
    setGlobalMessage('Escribe una observación antes de guardar.', true);
    return;
  }
  const payload = await api(companyQuery('/api/month-notes/' + selectedMonth()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: noteAuthorInput.value || 'Gerencia', textObservation }),
  });
  state.notes = payload.notes || [];
  noteTextInput.value = '';
  renderNotesSprint2(state.notes);
});

btnSaveAction.addEventListener('click', async () => {
  const body = {
    linePyg: actionLine.value || '',
    problemDetected: actionProblem.value || '',
    actionDefined: actionDefined.value || '',
    responsible: actionResponsible.value || '',
    priority: actionPriority.value || 'Media',
    dueDate: actionDueDate.value || '',
    status: 'pendiente',
  };
  const payload = await api(companyQuery('/api/month-actions/' + selectedMonth()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  state.actions = payload.actions || [];
  if (actionProblem) actionProblem.value = '';
  if (actionDefined) actionDefined.value = '';
  if (actionResponsible) actionResponsible.value = '';
  renderActionsSprint2(state.actions);
});

































if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAuthMessage('Validando credenciales...');

    try {
      const payload = await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail?.value || '',
          password: loginPassword?.value || '',
        }),
      });
      await handleAuthenticatedEntry(payload, payload.message || 'Sesión iniciada correctamente.');
    } catch (error) {
      setAuthMessage(error.message || 'No fue posible iniciar sesión.', true);
    }
  });
}

if (setupForm) {
  setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (state.auth.setupMode === 'disabled') {
      setAuthMessage('La configuración inicial no está habilitada en este entorno.', true);
      return;
    }

    const password = String(setupPassword?.value || '');
    const passwordConfirm = String(setupPasswordConfirm?.value || '');
    if (password !== passwordConfirm) {
      setAuthMessage('La confirmación de contraseña no coincide.', true);
      return;
    }

    setAuthMessage('Creando administrador inicial...');

    try {
      const payload = await requestJson('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: setupTokenInput?.value || '',
          displayName: setupDisplayName?.value || 'Administrador',
          email: setupEmail?.value || '',
          password,
          passwordConfirm,
        }),
      });
      await handleAuthenticatedEntry(payload, payload.message || 'Administrador inicial creado correctamente.');
    } catch (error) {
      setAuthMessage(error.message || 'No fue posible crear el administrador inicial.', true);
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    btnLogout.disabled = true;
    try {
      await requestJson('/api/auth/logout', { method: 'POST' });
    } catch (_error) {
      // no-op: limpiamos estado local aunque el backend ya no responda
    } finally {
      btnLogout.disabled = false;
    }

    state.auth = {
      authenticated: false,
      user: null,
      csrfToken: '',
      setupRequired: false,
      setupMode: 'disabled',
      setupTokenConfigured: false,
    };
    renderAuthUser();
    resetAuthForms();
    await loadAuthSession().catch(() => {
      lockWorkspaceForAuth();
      setAuthMessage('La sesión se cerró. Inicia nuevamente para continuar.');
    });
    setGlobalMessage('Sesión cerrada correctamente.');
  });
}

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = String(currentPasswordInput?.value || '');
    const newPassword = String(newPasswordInput?.value || '');
    const passwordConfirm = String(newPasswordConfirmInput?.value || '');

    if (!currentPassword || !newPassword || !passwordConfirm) {
      setChangePasswordMessage('Completa los tres campos para actualizar la contraseña.', true);
      return;
    }

    if (newPassword !== passwordConfirm) {
      setChangePasswordMessage('La confirmación de la nueva contraseña no coincide.', true);
      return;
    }

    setChangePasswordMessage('Actualizando contraseña...');

    try {
      const payload = await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          passwordConfirm,
        }),
      });
      applyAuthPayload(payload || {});
      changePasswordForm.reset();
      setChangePasswordMessage(payload.message || 'Contraseña actualizada correctamente.');
      setGlobalMessage(payload.message || 'Contraseña actualizada correctamente.');
    } catch (error) {
      setChangePasswordMessage(error.message || 'No fue posible actualizar la contraseña.', true);
    }
  });
}


if (changeProfileForm) {
  changeProfileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = String(profileDisplayNameInput?.value || '').trim();
    const email = String(profileEmailInput?.value || '').trim();
    const currentPassword = String(profileCurrentPasswordInput?.value || '');

    if (!displayName || !email || !currentPassword) {
      setChangeProfileMessage('Completa nombre, usuario y contrasena actual.', true);
      return;
    }

    setChangeProfileMessage('Actualizando usuario de acceso...');

    try {
      const payload = await api('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email,
          currentPassword,
        }),
      });
      applyAuthPayload(payload || {});
      if (changeProfileForm) changeProfileForm.reset();
      syncSecurityForms();
      setChangeProfileMessage(payload.message || 'Usuario de acceso actualizado correctamente.');
      setGlobalMessage(payload.message || 'Usuario de acceso actualizado correctamente.');
    } catch (error) {
      setChangeProfileMessage(error.message || 'No fue posible actualizar el usuario de acceso.', true);
    }
  });
}
