# Control P&G V2

Aplicacion local de control financiero para cargar ejecucion contable, convertirla a un P&G estandar colombiano, gestionar presupuesto mensual y dar seguimiento gerencial.

## Stack
- Node.js
- Express
- HTML, CSS y JavaScript vanilla
- Persistencia local en `data/db.json`
- Docker para despliegue local o en VPS

## Despliegue rapido en VPS Linux con curl + Docker
Cualquier persona con acceso al repositorio puede instalar la app en un VPS Linux usando un solo comando.

### Requisitos del VPS
- Linux
- Docker instalado
- Docker Compose plugin instalado (`docker compose`)
- `curl` y `tar` disponibles

### Instalacion desde repositorio publico
```bash
curl -fsSL https://raw.githubusercontent.com/didierjurado-blip/Pyg/main/scripts/install-vps.sh | bash
```

### Instalacion desde repositorio privado
```bash
export GITHUB_TOKEN="TU_TOKEN_DE_GITHUB"
curl -fsSL -H "Authorization: Bearer ${GITHUB_TOKEN}" https://raw.githubusercontent.com/didierjurado-blip/Pyg/main/scripts/install-vps.sh | bash
```

### Instalar en otra carpeta o rama
```bash
export APP_DIR=/opt/pg-control-v2
export GITHUB_REF=main
curl -fsSL https://raw.githubusercontent.com/didierjurado-blip/Pyg/main/scripts/install-vps.sh | bash
```

### Actualizar una instalacion existente
```bash
curl -fsSL https://raw.githubusercontent.com/didierjurado-blip/Pyg/main/scripts/update-vps.sh | bash
```

### Diagnostico rapido del tarball
Antes de instalar, puedes validar que GitHub entregue el paquete del repo:
```bash
curl -I https://github.com/didierjurado-blip/Pyg/archive/refs/heads/main.tar.gz
```
Debe responder `200 OK` o una redireccion valida.

Para repositorio privado:
```bash
export GITHUB_TOKEN="TU_TOKEN_DE_GITHUB"
curl -fsSL -H "Authorization: Bearer ${GITHUB_TOKEN}" https://raw.githubusercontent.com/didierjurado-blip/Pyg/main/scripts/update-vps.sh | bash
```

### Donde queda instalada
- Carpeta por defecto: `/opt/pg-control-v2`
- Puerto por defecto: `3000`
- Datos persistentes: `/opt/pg-control-v2/data`

### Primer acceso despues de instalar
Por defecto, el instalador copia `.env.example` a `.env` solo si `.env` no existe.
Eso deja la app lista para entrar por `http://IP_DEL_SERVIDOR:3000`.

Si luego pones la app detras de HTTPS con Nginx, Caddy o Traefik, cambia en `.env`:
- `AUTH_COOKIE_SECURE=true`
- `TRUST_PROXY=1`

Despues reinicia la app:
```bash
cd /opt/pg-control-v2
docker compose up -d --build
```

## Credenciales predeterminadas
Si la base local no tiene usuarios, la app crea automaticamente este administrador:
- Usuario: `admin@pgcontrol.local`
- Contrasena: `PgcAdmin_2026!Cambiar`

Cambialos apenas ingreses desde la vista `Configuracion`:
- `Usuario de acceso` para cambiar nombre visible y usuario de login
- `Seguridad de acceso` para cambiar la contrasena

## Variables de entorno de Docker
El archivo `.env.example` cubre las variables principales:
- `APP_PORT`
- `TRUST_PROXY`
- `AUTH_COOKIE_SECURE`
- `AUTH_SESSION_TTL_HOURS`
- `AUTH_INITIAL_EMAIL`
- `AUTH_INITIAL_PASSWORD`
- `AUTH_INITIAL_NAME`
- `AUTH_SETUP_TOKEN`

## Ejecucion local sin Docker
```powershell
cd C:\Proyectos\mi-primer-proyecto-ia
npm.cmd install
npm.cmd start
```

URL:
- `http://127.0.0.1:3000`

## Ejecucion con Docker en local
```powershell
cd C:\Proyectos\mi-primer-proyecto-ia
docker compose down
docker compose build --no-cache
docker compose up -d
```

El `docker-compose.yml` por defecto solo levanta la app (persistencia `data/db.json` en el volumen). Para PostgreSQL y auditoria de seguridad en tabla `security_audit`, usa el stack extendido:

```powershell
docker compose -f docker-compose.corporate.yml up -d
docker compose -f docker-compose.corporate.yml run --rm app npm run migrate
```

Define `DATABASE_URL` si usas Postgres fuera de ese compose (por ejemplo en `.env`).

## Respaldo de la base JSON
Copia versionada de `data/db.json` en `data/backups/`:

```powershell
npm run backup:db
```

## Pruebas automatizadas y CI
```powershell
npm test
```

En GitHub Actions el workflow `.github/workflows/ci.yml` ejecuta `npm ci` y `npm test`.

## API y observabilidad
- Contrato parcial en [openapi.json](openapi.json); se expone en `GET /api/openapi.json`.
- Liveness: `GET /api/health`. Readiness (lectura de `db.json` y Postgres si `DATABASE_URL` esta definido): `GET /api/ready`.
- Logs HTTP en JSON por peticion (desactivar con `LOG_HTTP=false`).
- Procesamiento asincrono de ejecucion: `POST /api/execution/process-async` devuelve `202` y `jobId`; estado en `GET /api/jobs/:jobId`.

## Seguridad y alcance actual
- La autenticacion usa contrasenas hasheadas con `scrypt`.
- Las sesiones se guardan en `data/db.json`.
- La cookie es `HttpOnly` y `SameSite=Lax`.
- Hay proteccion CSRF para operaciones mutables.
- Hay rate limit basico en login y setup inicial.
- Roles: `admin` (estructura y borrados criticos), `editor` (cargas y ajustes operativos), `viewer` (solo lectura). Los usuarios existentes se normalizan a `admin` si no tenian rol. Para cambiar rol: `node scripts/set-user-role.js <email> <admin|editor|viewer>`.
- MFA TOTP opcional (configuracion en la vista Configuracion). Tras activarlo, el login exige segundo paso.
- Renovacion deslizante de sesion: cada varios minutos de actividad se extiende la expiracion (variable `AUTH_SESSION_SLIDE_MINUTES`, por defecto 5).
- Con `DATABASE_URL` y migraciones aplicadas, eventos sensibles de autenticacion se registran en PostgreSQL (`security_audit`).

## Limitaciones actuales
- Es una app administrativa pequena, no un IAM corporativo.
- No hay recuperacion de contrasena por correo.
- No hay SSO corporativo ni MFA WebAuthn.
- La persistencia operativa principal sigue en JSON local (Postgres complementa auditoria de seguridad, no reemplaza aun todo el modelo).

## Documentacion de desarrollo
- [Eje de prioridad sugerido](docs/eje-prioridad-desarrollo.md) para planificar siguientes iteraciones.
- [Rutas API: publicas, sesion y CSRF](docs/api-auth-routes.md).
- [Arquitectura acumulado YTD y consolidado](docs/ARCHITECTURE-accumulado-consolidado.md).

## Proximos pasos recomendados
- Migrar datos operativos (meses, cargas) a PostgreSQL con transacciones.
- Auditoria completa de acciones de negocio en base relacional.
- SSO (OIDC/SAML) y politicas de contrasena avanzadas.
