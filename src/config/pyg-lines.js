const PYG_LINES = [
  { key: 'ingresos_operacionales', label: 'Ingresos operacionales', direction: 'higher_better', order: 1 },
  { key: 'costos_directos', label: 'Costos de prestacion del servicio / costo de ventas', direction: 'lower_better', order: 2 },
  { key: 'utilidad_bruta', label: 'Utilidad bruta', direction: 'higher_better', order: 3, derived: true },
  { key: 'gastos_administrativos', label: 'Gastos operacionales de administracion', direction: 'lower_better', order: 4 },
  { key: 'gastos_ventas', label: 'Gastos operacionales de ventas', direction: 'lower_better', order: 5 },
  { key: 'utilidad_operacional', label: 'Utilidad operacional', direction: 'higher_better', order: 6, derived: true },
  { key: 'otros_ingresos', label: 'Otros ingresos', direction: 'higher_better', order: 7 },
  { key: 'gastos_financieros', label: 'Gastos financieros', direction: 'lower_better', order: 8 },
  { key: 'otros_gastos_no_operacionales', label: 'Otros gastos no operacionales', direction: 'lower_better', order: 9 },
  { key: 'utilidad_antes_impuestos', label: 'Utilidad antes de impuestos', direction: 'higher_better', order: 10, derived: true },
  { key: 'impuesto_renta', label: 'Impuesto de renta', direction: 'lower_better', order: 11 },
  { key: 'utilidad_neta', label: 'Utilidad neta', direction: 'higher_better', order: 12, derived: true },
];

const RESPONSIBLE_BY_LINE = {
  ingresos_operacionales: 'Direccion comercial',
  costos_directos: 'Jefe de operaciones',
  utilidad_bruta: 'Gerencia general',
  gastos_administrativos: 'Direccion administrativa',
  gastos_ventas: 'Direccion comercial',
  utilidad_operacional: 'Gerencia general',
  otros_ingresos: 'Direccion financiera',
  gastos_financieros: 'Tesoreria',
  otros_gastos_no_operacionales: 'Direccion financiera',
  utilidad_antes_impuestos: 'Direccion financiera',
  impuesto_renta: 'Contabilidad e impuestos',
  utilidad_neta: 'Gerencia general',
};

module.exports = {
  PYG_LINES,
  RESPONSIBLE_BY_LINE,
};