const XLSX = require('xlsx');

function parseUploadedFile(file) {
  const workbook = XLSX.read(file.buffer, {
    type: 'buffer',
    cellDates: true,
    raw: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas o datos legibles.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true,
  });

  if (!rows.length) {
    throw new Error('El archivo no contiene filas con datos.');
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(String(key).trim()));
      return set;
    }, new Set())
  );

  const normalizedRows = rows.map((row) => {
    const normalized = {};

    headers.forEach((header) => {
      normalized[header] = row[header] ?? '';
    });

    return normalized;
  });

  return {
    headers,
    rows: normalizedRows,
    previewRows: normalizedRows.slice(0, 8),
  };
}

module.exports = {
  parseUploadedFile,
};
