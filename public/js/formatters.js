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

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

export function parseLocalizedNumber(value) {
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

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
