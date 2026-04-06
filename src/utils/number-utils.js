function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  const raw = String(value).trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw.replace(/[\$\s()]/g, '').replace(/[^\d.,-]/g, '');
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
    if (parts.length === 2) {
      const integerPart = parts[0].replace('-', '');
      const decimalPart = parts[1];
      const treatAsDecimal = decimalPart.length <= 2 || (decimalPart.length <= 4 && integerPart.length > 3);
      normalized = treatAsDecimal ? `${parts[0]}.${decimalPart}` : cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length === 2) {
      const integerPart = parts[0].replace('-', '');
      const decimalPart = parts[1];
      const treatAsDecimal = decimalPart.length <= 2 || (decimalPart.length <= 4 && integerPart.length > 3);
      normalized = treatAsDecimal ? cleaned : cleaned.replace(/\./g, '');
    } else {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const isNegativeByParenthesis = raw.includes('(') && raw.includes(')');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return isNegativeByParenthesis ? -Math.abs(parsed) : parsed;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  normalizeText,
  parseMoney,
  round2,
};
