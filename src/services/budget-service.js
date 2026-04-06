const { PYG_LINES } = require('../config/pyg-lines');
const { parseMoney, round2, normalizeText } = require('../utils/number-utils');

function buildBudgetTemplate() {
  return PYG_LINES.map((line) => ({
    lineKey: line.key,
    lineLabel: line.label,
    budget: 0,
    comment: '',
  }));
}

function normalizeBudgetInput(items = []) {
  const templateMap = new Map(buildBudgetTemplate().map((row) => [row.lineKey, row]));

  items.forEach((item) => {
    const key = String(item.lineKey || '').trim();
    if (!key || !templateMap.has(key)) {
      return;
    }

    templateMap.set(key, {
      lineKey: key,
      lineLabel: templateMap.get(key).lineLabel,
      budget: round2(parseMoney(item.budget)),
      comment: String(item.comment || '').trim(),
    });
  });

  return Array.from(templateMap.values()).sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, 'es'));
}

function parseBudgetRowsFromFile(rows, mapping) {
  const lineField = mapping.line || 'Linea';
  const budgetField = mapping.budget || 'Presupuesto';
  const commentField = mapping.comment || '';

  const parsed = rows
    .map((row) => {
      const lineText = String(row[lineField] || '').trim();
      const normalizedLine = normalizeText(lineText);
      const line = PYG_LINES.find((item) => normalizeText(item.label) === normalizedLine || normalizeText(item.key) === normalizedLine);
      if (!line) {
        return null;
      }
      return {
        lineKey: line.key,
        budget: round2(parseMoney(row[budgetField])),
        comment: commentField ? String(row[commentField] || '').trim() : '',
      };
    })
    .filter(Boolean);

  return normalizeBudgetInput(parsed);
}

function toBudgetMap(budgetRows = []) {
  const map = new Map();
  budgetRows.forEach((row) => {
    map.set(row.lineKey, round2(parseMoney(row.budget)));
  });
  return map;
}

module.exports = {
  buildBudgetTemplate,
  normalizeBudgetInput,
  parseBudgetRowsFromFile,
  toBudgetMap,
};