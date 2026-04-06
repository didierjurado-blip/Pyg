const { PYG_LINES, RESPONSIBLE_BY_LINE } = require('../config/pyg-lines');
const { DEFAULT_TOLERANCES } = require('../config/tolerances');

function typeFromDirection(direction) {
  return direction === 'higher_better' ? 'ingreso_utilidad' : 'costo_gasto';
}

function buildDefaultLineSettingsArray() {
  const defaultTolerance = Number(DEFAULT_TOLERANCES.cumplido_max_desfavorable_pct || 5);

  return PYG_LINES
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((line) => ({
      lineKey: line.key,
      lineLabel: line.label,
      typeLine: typeFromDirection(line.direction),
      tolerancePct: defaultTolerance,
      responsibleSuggested: RESPONSIBLE_BY_LINE[line.key] || 'Direccion financiera',
      priority: line.key === 'utilidad_neta' || line.key === 'utilidad_operacional' ? 'Alta' : 'Media',
      active: true,
    }));
}

function buildDefaultLineSettingsMap() {
  const map = {};
  buildDefaultLineSettingsArray().forEach((item) => {
    map[item.lineKey] = item;
  });
  return map;
}

function normalizeLineSettings(input) {
  const baseMap = buildDefaultLineSettingsMap();

  if (!input || typeof input !== 'object') {
    return baseMap;
  }

  Object.keys(baseMap).forEach((lineKey) => {
    const incoming = input[lineKey] || {};
    const toleranceRaw = Number(incoming.tolerancePct);

    baseMap[lineKey] = {
      ...baseMap[lineKey],
      lineKey,
      tolerancePct: Number.isFinite(toleranceRaw) && toleranceRaw >= 0 ? toleranceRaw : baseMap[lineKey].tolerancePct,
      responsibleSuggested: String(incoming.responsibleSuggested || baseMap[lineKey].responsibleSuggested || '').trim() || 'Direccion financiera',
      priority: ['Alta', 'Media', 'Baja'].includes(incoming.priority) ? incoming.priority : baseMap[lineKey].priority,
      active: incoming.active === undefined ? true : Boolean(incoming.active),
    };
  });

  return baseMap;
}

function toLineSettingsArray(lineSettingsMap) {
  const normalized = normalizeLineSettings(lineSettingsMap);
  return buildDefaultLineSettingsArray().map((line) => normalized[line.lineKey]);
}

module.exports = {
  buildDefaultLineSettingsArray,
  buildDefaultLineSettingsMap,
  normalizeLineSettings,
  toLineSettingsArray,
};
