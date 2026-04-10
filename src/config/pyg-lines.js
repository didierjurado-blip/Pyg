const PYG_LINES = [
  { key: 'ingresos_operacionales', label: 'Ingresos operacionales', direction: 'higher_better', order: 1 },
  { key: 'menor_valor_ingreso', label: 'Menor valor del ingreso', direction: 'lower_better', order: 2 },
  { key: 'ingresos_operacionales_netos', label: 'Ingresos operacionales netos', direction: 'higher_better', order: 3, derived: true },
  { key: 'costos_directos', label: 'Costo de prestación del servicio / costo de ventas', direction: 'lower_better', order: 4 },
  { key: 'utilidad_bruta', label: 'Utilidad bruta', direction: 'higher_better', order: 5, derived: true },
  { key: 'gastos_administrativos', label: 'Gastos operacionales de administración', direction: 'lower_better', order: 6 },
  { key: 'gastos_ventas', label: 'Gastos operacionales de ventas', direction: 'lower_better', order: 7 },
  { key: 'utilidad_operacional', label: 'Utilidad operacional', direction: 'higher_better', order: 8, derived: true },
  { key: 'otros_ingresos', label: 'Otros ingresos', direction: 'higher_better', order: 9 },
  { key: 'gastos_financieros', label: 'Gastos financieros', direction: 'lower_better', order: 10 },
  { key: 'otros_gastos_no_operacionales', label: 'Otros gastos no operacionales', direction: 'lower_better', order: 11 },
  { key: 'utilidad_antes_impuestos', label: 'Utilidad antes de impuestos', direction: 'higher_better', order: 12, derived: true },
  { key: 'impuesto_renta', label: 'Impuesto de renta', direction: 'lower_better', order: 13 },
  { key: 'utilidad_neta', label: 'Utilidad neta', direction: 'higher_better', order: 14, derived: true },
  { key: 'ica_estimado_gerencial', label: 'ICA estimado gerencial', direction: 'lower_better', order: 15, derived: true },
  { key: 'utilidad_gerencial_ajustada', label: 'Utilidad gerencial ajustada', direction: 'higher_better', order: 16, derived: true },
];

const RESPONSIBLE_BY_LINE = {
  ingresos_operacionales: 'Dirección comercial',
  menor_valor_ingreso: 'Dirección comercial',
  ingresos_operacionales_netos: 'Gerencia general',
  costos_directos: 'Jefe de operaciones',
  utilidad_bruta: 'Gerencia general',
  gastos_administrativos: 'Dirección administrativa',
  gastos_ventas: 'Dirección comercial',
  utilidad_operacional: 'Gerencia general',
  otros_ingresos: 'Dirección financiera',
  gastos_financieros: 'Tesorería',
  otros_gastos_no_operacionales: 'Dirección financiera',
  utilidad_antes_impuestos: 'Dirección financiera',
  impuesto_renta: 'Contabilidad e impuestos',
  utilidad_neta: 'Gerencia general',
  ica_estimado_gerencial: 'Direcci?n financiera',
  utilidad_gerencial_ajustada: 'Gerencia general',
};

module.exports = {
  PYG_LINES,
  RESPONSIBLE_BY_LINE,
};
