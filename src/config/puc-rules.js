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
    label: 'Gastos operacionales de administración',
  },
  gastos_ventas: {
    prefixes: ['52'],
    label: 'Gastos operacionales de ventas',
  },
  costos_directos: {
    prefixes: ['61'],
    label: 'Costo de prestación del servicio / costo de ventas',
  },
};

const FINANCIAL_PREFIXES = ['5305', '530520', '530525', '530535'];
const NON_OPERATIONAL_PREFIXES = ['53'];
const INCOME_TAX_PATTERNS = [/impuesto de renta/i, /renta y complementarios/i, /provision de renta/i];
const DISCOUNT_PATTERNS = [/descuento comercial/i, /^421040/, /rebaja comercial/i, /devolucion en ventas/i];

const ALERT_PATTERNS = [
  { id: 'iva_desc', pattern: /iva descontable|iva recuperable/i, message: 'IVA descontable/recuperable identificado: sugerir exclusión del modelo gerencial.' },
  { id: 'anticipos', pattern: /anticipo/i, message: 'Anticipos no suelen afectar directamente el P&G.' },
  { id: 'activos', pattern: /activo|propiedad planta|intangib|depreciaci/i, message: 'Cuenta asociada a activos o depreciación: validar tratamiento contable y gerencial.' },
  { id: 'reintegros', pattern: /reintegro|recuperacion/i, message: 'Partida no recurrente: validar lectura gerencial.' },
  { id: 'venta_activos', pattern: /venta de activo|utilidad en venta|perdida en venta/i, message: 'Resultado por venta de activos: tratar como no operacional.' },
  { id: 'estampillas', pattern: /estampilla/i, message: 'Estampillas pueden distorsionar la lectura operativa.' },
  { id: 'extraordinarias', pattern: /extraordinari/i, message: 'Partida extraordinaria identificada.' },
  { id: 'publicidad_costo', pattern: /publicidad|mercadeo|promocion/i, message: 'Publicidad/mercadeo detectado: revisar si debe ir en gasto de ventas y no en costo.' },
];

module.exports = {
  PUC_SECTIONS,
  FINANCIAL_PREFIXES,
  NON_OPERATIONAL_PREFIXES,
  INCOME_TAX_PATTERNS,
  DISCOUNT_PATTERNS,
  ALERT_PATTERNS,
};
