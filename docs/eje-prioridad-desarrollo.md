# Eje de prioridad para siguientes pasos

Objetivo del MVP: uso **local o VPS single-instance** con un administrador. Sin un product goal explícito distinto, el orden recomendado equilibra **riesgo**, **coste de cambio** y **base para crecer**.

## 1. Hardening y visibilidad (corto plazo)

- Mantener documentación operativa de **qué expone la API** y **qué exige auth/CSRF** ([api-auth-routes.md](./api-auth-routes.md)).
- Revisar despliegue: `AUTH_COOKIE_SECURE`, `TRUST_PROXY`, y no exponer el puerto sin TLS en entornos compartidos.

## 2. Tests automatizados (medio plazo, alto retorno)

- Cubrir primero servicios puros sin I/O o con I/O mínimo: `comparison-service`, `month-service`, `validation-service`, y mutaciones críticas vía `withDb` con archivo temporal.
- Evita regresiones al tocar reglas PyG o cierre de mes.

## 3. Modularizar el frontend (medio plazo)

- `public/app.js` concentra casi toda la UI; extraer por vista (dashboard, ejecución, etc.) o una capa `api.js` reduce fricción para features y pruebas manuales.

## 4. Persistencia y uploads (largo plazo, cuando el contexto lo exija)

- Sustituir o complementar `data/db.json` cuando haya **varias instancias**, **concurrencia real** o **backups** formales.
- Sustituir almacenamiento en memoria de uploads (`upload-stores`) si los procesos se reinician con frecuencia o hay archivos grandes.

Este orden puede cambiar: si el siguiente hito es **multi-usuario en la nube**, sube la prioridad del punto 4; si es **estabilidad de cálculos**, prioriza el punto 2.
