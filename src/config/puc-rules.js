const PUC_SECTIONS = {
  ingresos_operacionales: {
    prefixes: ['41'],
    label: 'Ingresos operacionales',
  },
  otros_ingresos: {
    prefixes: ['42'],
    label: 'Otros ingresos',
  },
  gastos_administrativos: {
    prefixes: ['51'],
    label: 'Gastos operacionales de administracion',
  },
  gastos_ventas: {
    prefixes: ['52'],
    label: 'Gastos operacionales de ventas',
  },
  costos_directos: {
    prefixes: ['61'],
    label: 'Costos de prestacion del servicio / costo de ventas',
  },
};

const FINANCIAL_PREFIXES = ['5305'];
const NON_OPERATIONAL_PREFIXES = ['53'];

const ALERT_PATTERNS = [
  { id: 'iva_desc', pattern: /iva descontable|iva recuperable/i, message: 'Posible cuenta de balance llevada al resultado.' },
  { id: 'anticipos', pattern: /anticipo/i, message: 'Anticipos no suelen afectar directamente el P&G.' },
  { id: 'activos', pattern: /activo|propiedad planta|intangib/i, message: 'Cuenta asociada a activos: revisar clasificacion.' },
  { id: 'reintegros', pattern: /reintegro|recuperacion/i, message: 'Partida no recurrente: validar analisis gerencial.' },
  { id: 'venta_activos', pattern: /venta de activo|utilidad en venta|perdida en venta/i, message: 'Resultado por venta de activos: tratar como no operacional.' },
  { id: 'estampillas', pattern: /estampilla/i, message: 'Estampillas pueden distorsionar la lectura operativa.' },
  { id: 'extraordinarias', pattern: /extraordinari/i, message: 'Partida extraordinaria identificada.' },
];

module.exports = {
  PUC_SECTIONS,
  FINANCIAL_PREFIXES,
  NON_OPERATIONAL_PREFIXES,
  ALERT_PATTERNS,
};