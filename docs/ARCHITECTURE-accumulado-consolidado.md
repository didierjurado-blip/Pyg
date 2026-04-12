# Arquitectura: acumulado YTD, consolidado y eliminaciones

## Modelo actual (empresa × mes)

Cada empresa (`companies[]`) tiene `dataByCompany[companyId].months[YYYY-MM]` con:

- **`execution`**: P&G ya mapeada a líneas maestras (`pyg-lines`), no consolidación directa por cuenta PUC como motor principal.
  - `contable` / `gerencial`: `standardTable`, `detailedTable`, `pygTable` (legacy alias).
  - `accountMapping`: trazabilidad cuenta → sección/subgrupo/valores contable y gerencial.
  - `managerialAdjustments`: ajustes gerenciales explícitos.
  - `automaticNotes`: exclusiones, reclasificaciones, calidad, notas técnicas.
- **`budget`**: misma forma contable/gerencial cuando hay presupuesto cargado.
- **`comparison` / `analysis`**: generados al refrescar análisis mensual (no son la fuente del acumulado; el acumulado **vuelve a sumar** tablas estándar).

## Principio de diseño (regla base)

La **línea P&G** (y en detalle **subgrupo** / **cuenta** vía mapeo) es el eje. Mensual, acumulado y consolidado deben operar sobre:

- `standardTable` (línea → valor),
- `detailedTable` (sección/subgrupo → valor),
- `accountMapping` (cuenta → línea/subgrupo),
- ajustes y notas asociadas.

## Fase 1 — Acumulado por empresa (YTD)

**Servicio:** `src/services/accumulated-service.js` → `buildAccumulatedDataset`.

- Filtra meses del **mismo año calendario** que el mes de corte, desde enero hasta el corte (`filterYearMonths` + `sortMonths`).
- Solo incluye meses con **ejecución** cargada.
- Suma:
  - real contable/gerencial estándar y detallado;
  - presupuesto acumulado (suma de meses con presupuesto) si `includeBudget`;
  - mapeo y ajustes concatenando filas con columna **`month`**.
- Comparativo real vs presupuesto YTD: `compareBudgetVsReal` sobre estándar **gerencial** acumulado y `lineSettings` de la empresa.
- La API devuelve `meta.schema = accumulated_ytd_v1` y `executiveSummary` para UI y exportes.

**Endpoints:**

- `GET /api/accumulated/:month?includeBudget=true|false`
- `GET /api/export-accumulated/:month?includeBudget=...`

**UI:** vista `Acumulado` en `public/index.html` / `app.js` (modo solo real / solo presupuesto / real vs presupuesto).

## Fase 2 — Grupos y consolidado simple (ya parcialmente implementado)

**Persistencia:** `companyGroups[]` en `db.json` (nombre + `companyIds`).

**Servicio:** `src/services/consolidation-service.js` → `buildConsolidatedDataset`.

- Un mes de corte, conjunto de empresas (grupo guardado vía `groupId` o **ad hoc** vía `companyIds` en query).
- Matrices `standardMatrix` / `detailedMatrix` con **columnas por empresa** y **total**.

### Consolidado YTD (año corrido multi-empresa)

**Función:** `buildConsolidatedYtdDataset` en el mismo `consolidation-service.js`.

- Para cada empresa seleccionada se llama a `buildAccumulatedDataset` hasta el **mes de corte global** (mismo criterio YTD que el acumulado por empresa).
- Con esas tablas estándar/detalle acumuladas se arman las **mismas matrices** que el consolidado mensual (suma por línea/subgrupo entre empresas).
- **Eliminaciones:** se toman todos los registros en `consolidationEliminations` cuyo `month` esté entre enero y el corte (calendario) y cuyo `scopeKey` coincida con el grupo o la selección ad hoc; se **suman por línea** al aplicar el consolidado ajustado. Cada ítem en la respuesta incluye `sourceYtdMonth` para trazabilidad.
- **API:** `GET /api/consolidated/ytd/:cutoffMonth` (mismos query params que el consolidado mensual: `view`, `includeBudget`, `groupId`, `companyIds`).
- **Export:** `GET /api/export-consolidated-ytd/:cutoffMonth` → Excel con hoja `00 YTD Periodo` además del resto de hojas del consolidado.
- **UI:** en la vista Consolidado, selector **Periodo → Acumulado YTD**.

## Fase 3 — Eliminaciones y consolidado ajustado

**Persistencia:** `consolidationEliminations[]` con `scopeKey` (`group:…` o `adhoc:…`), mes, empresas origen/destino, línea, tipo, valor, etc.

**Servicio:** `applyEliminationsToStandardRows` + `adjustedStandardTable` en `consolidation-service.js`.

- Muestra pre-ajuste, total eliminaciones y consolidado ajustado (sobre estándar consolidado).

## Fase 4 — Presupuesto en acumulado/consolidado

- Acumulado: `includeBudget` y comparativo ya soportados.
- Consolidado: `includeBudget` en `buildConsolidatedDataset` y exportes; ampliar UX según “solo real / solo presupuesto / mixto” de forma alineada con la vista Acumulado.

## Archivos clave

| Área | Archivo |
|------|---------|
| Acumulado YTD | `src/services/accumulated-service.js` |
| Consolidado + eliminaciones | `src/services/consolidation-service.js` |
| API + exportes | `src/routes/analysis-export.js`, `src/http/route-helpers.js` |
| Excel | `src/services/export-service.js` |
| UI acumulado / consolidado | `public/app.js`, `public/index.html` |

## Cómo probar Fase 1

1. Cargar ejecución (y opcionalmente presupuesto) en **varios meses** del mismo año para una empresa.
2. Elegir **mes de corte** en el selector global de mes.
3. Abrir vista **Acumulado**: verificar KPIs, resumen ejecutivo, tablas contable/gerencial, comparativo según modo.
4. **Exportar acumulado Excel**: revisar hojas `00 Resumen`, `01 Ejecutivo`, P&G, mapeo, ajustes con mes, notas completas y comparativo si aplica.

## Cómo probar consolidado YTD

1. Mínimo dos empresas con ejecución en varios meses del mismo año.
2. Vista **Consolidado** → **Periodo: Acumulado YTD** → seleccionar empresas o grupo → **Actualizar consolidado**.
3. Comprobar KPIs (corte, meses calendario), matrices y consolidado ajustado si hay eliminaciones registradas **por mes** en el rango.
4. **Exportar consolidado Excel** y revisar la hoja **00 YTD Periodo**.
