# API: rutas públicas, protegidas y CSRF

## Middleware relevante

- **`attachAuthContext`** ([`src/http/auth-http.js`](../src/http/auth-http.js)): se aplica a todas las peticiones bajo `/api` en [`create-app.js`](../src/http/create-app.js). Lee la cookie de sesión y rellena `req.auth` (`user`, `session`, `token`) o `req.auth === null`.
- **`requireAuthenticatedApi`**: exige sesión válida. Para métodos que **no** son `GET`, `HEAD` u `OPTIONS` (véase `SAFE_API_METHODS` en [`src/http/env.js`](../src/http/env.js)), exige cabecera **`x-csrf-token`** igual al `csrfToken` de la sesión actual.

## Regla global de protección

Al final de [`registerMetaAuthRoutes`](../src/routes/meta-and-auth.js) se registra un `app.use('/api', …)` que llama a **`isPublicApiPath(req)`** ([`src/http/auth-http.js`](../src/http/auth-http.js)): si la ruta completa (`req.originalUrl`) es pública, continúa; si no, aplica **`requireAuthenticatedApi`**.

### Rutas públicas (sin sesión)

| Método | Ruta (completa) | Notas |
|--------|------------------|--------|
| GET | `/api/health` | Liveness |
| GET | `/api/ready` | Readiness (`db.json` + Postgres si aplica) |
| GET | `/api/openapi.json` | Especificación OpenAPI |
| GET | `/api/auth/session` | Estado de sesión y setup |
| POST | `/api/auth/setup` | Solo si aún no hay usuarios; throttle |
| POST | `/api/auth/login` | Throttle; puede responder `mfaRequired` |
| POST | `/api/auth/mfa/verify-login` | Completar login con TOTP |
| POST | `/api/auth/logout` | Sin sesión: no-op amigable |

Cualquier otra ruta bajo `/api` pasa por **`requireAuthenticatedApi`**: requiere cookie de sesión válida. Varias rutas mutables además exigen rol mínimo (`requireMinRole('editor'|'admin')`).

### Rutas que exigen sesión (resumen)

Incluye, entre otras:

- `GET /api/meta`, `GET|POST /api/companies`, `DELETE /api/companies/:id`
- Grupos: `/api/company-groups`, `/api/months`, `/api/month-status/...`, `/api/actions-overview`
- Configuración: `/api/settings/lines`, bitácora `/api/audit-logs`
- Ejecución: `/api/execution/*`
- Presupuesto: `/api/budget/*`
- Mes: `/api/month-notes/*`, `/api/month-actions/*`, cierre/reapertura
- Análisis y exportación: `/api/analysis/*`, `/api/executive/*`, `/api/history/trend`, `/api/accumulated/*`, `/api/consolidated/*`, `/api/consolidation-eliminations/*`, `/api/export*`, `DELETE /api/data`
- Auth con sesión: `POST /api/auth/profile`, `POST /api/auth/change-password`

### CSRF en operaciones mutables

Con sesión activa, las peticiones **`POST`**, **`PUT`**, **`PATCH`**, **`DELETE`** a rutas protegidas deben enviar:

```http
x-csrf-token: <csrfToken devuelto en login o GET /api/auth/session>
```

Si falta o no coincide → **403** con mensaje de token CSRF inválido.

Los métodos **GET**, **HEAD** y **OPTIONS** no requieren CSRF.

## Orden de registro en Express

`registerMetaAuthRoutes` se invoca **antes** que el resto de registradores de rutas en `create-app.js`. El `app.use('/api', …)` que aplica `requireAuthenticatedApi` queda **antes** en la pila que rutas como `GET /api/companies`; las peticiones autenticadas pasan primero por ese middleware y luego por el handler concreto.
