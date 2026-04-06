# Arquitectura V2 (Local)

## Decision de stack
- Backend: Node.js + Express (ya instalado en el proyecto).
- Frontend: SPA estatica en HTML/CSS/JS servida por Express.
- Persistencia MVP: `data/db.json` (cero friccion local).
- Exportes/importes: `xlsx` para Excel y CSV.
- Preparacion a futuro: esquema PostgreSQL en `docs/postgresql-schema.sql`.

## Capas
1. `src/config`: reglas PUC, lineas P&G, tolerancias.
2. `src/services`:
   - `execution-service`: transforma base contable a P&G contable/gerencial.
   - `budget-service`: plantilla, parseo y normalizacion de presupuesto.
   - `comparison-service`: presupuesto vs real + favorable/desfavorable + semaforo.
   - `analysis-service`: resumen ejecutivo, hallazgos y plan de accion.
   - `validation-service`: validaciones de datos y alertas de calidad.
   - `storage-service`: lectura/escritura `data/db.json`.
   - `export-service`: reporte mensual en Excel.
3. `public`: dashboard ejecutivo local.

## Flujo funcional mensual
1. Cargar ejecucion contable y mapear columnas.
2. Procesar ejecucion para obtener P&G estandar.
3. Cargar o editar presupuesto mensual.
4. Comparar presupuesto vs real.
5. Generar hallazgos + plan de accion.
6. Persistir snapshot mensual para historico.

## Fases de implementacion
- Fase 1: Motor contable PUC + persistencia local.
- Fase 2: Presupuesto mensual (archivo + manual).
- Fase 3: Comparativo y semaforo de cumplimiento.
- Fase 4: Analisis gerencial y plan de accion.
- Fase 5: Historico mensual y exportable consolidado.