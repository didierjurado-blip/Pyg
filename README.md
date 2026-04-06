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

## Seguridad y alcance actual
- La autenticacion usa contrasenas hasheadas con `scrypt`.
- Las sesiones se guardan en `data/db.json`.
- La cookie es `HttpOnly` y `SameSite=Lax`.
- Hay proteccion CSRF para operaciones mutables.
- Hay rate limit basico en login y setup inicial.

## Limitaciones actuales
- Es una app administrativa pequena, no un IAM corporativo.
- No hay recuperacion de contrasena por correo.
- No hay MFA.
- No hay roles finos.
- La persistencia sigue en JSON local.

## Proximos pasos recomendados
- Migrar usuarios y sesiones a PostgreSQL.
- Agregar auditoria de login/logout.
- Agregar expiracion deslizante de sesion.
- Incorporar roles y permisos por modulo.
