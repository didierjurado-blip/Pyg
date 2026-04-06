const { sortMonths } = require('../utils/date-utils');

function buildMonthlyTrend(monthsRecord) {
  const months = sortMonths(Object.keys(monthsRecord || {}));

  return months.map((month) => {
    const snapshot = monthsRecord[month] || {};
    const realRows = snapshot.comparison?.rows || [];

    const rowByKey = new Map(realRows.map((row) => [row.lineKey, row]));

    return {
      month,
      ingresos_operacionales: rowByKey.get('ingresos_operacionales')?.real || 0,
      utilidad_operacional: rowByKey.get('utilidad_operacional')?.real || 0,
      utilidad_neta: rowByKey.get('utilidad_neta')?.real || 0,
      utilidad_neta_presupuesto: rowByKey.get('utilidad_neta')?.budget || 0,
    };
  });
}

module.exports = {
  buildMonthlyTrend,
};