# Control P&G V2

Aplicacion local de control financiero para cargar ejecucion contable, convertirla a un P&G estandar colombiano, gestionar presupuesto mensual y dar seguimiento gerencial.

## Stack
- Node.js
- Express
- HTML, CSS y JavaScript vanilla
- Persistencia local en `data/db.json`
- Docker opcional para despliegue local o en VPS

## Autenticacion incorporada
La app ahora incluye un control de acceso pensado para exponerla en un VPS publico con una base razonable de seguridad.

### Que implementa
- Contrasenas hasheadas con `scrypt` usando `crypto` nativo de Node.
- Sesiones de servidor persistidas en `data/db.json`.
- Cookie `HttpOnly` y `SameSite=Lax`.
- Soporte para cookie `Secure` en produccion con HTTPS.
- Proteccion CSRF para operaciones mutables.
- Rate limit basico en login y setup inicial.
- Headers de seguridad y CSP en Express.
- Cambio de contrasena desde la UI.
- Cierre de sesion con invalidacion de la sesion almacenada.

## Alta inicial del administrador
Hay dos formas recomendadas de crear el primer usuario administrador.

### Opcion 1. Bootstrap por variables de entorno
Define estas variables antes de levantar la app:
- `AUTH_INITIAL_EMAIL`
- `AUTH_INITIAL_PASSWORD`
- `AUTH_INITIAL_NAME`

En el primer arranque, si no existen usuarios, la app crea ese administrador automaticamente.

### Opcion 2. Setup inicial con token
Si no quieres bootstrap automatico, define:
- `AUTH_SETUP_TOKEN`

La UI mostrara un formulario de creacion inicial solo cuando todavia no exista ningun usuario.
En un VPS publico esta es la opcion minima aceptable si no quieres dejar credenciales en variables de entorno permanentes.

### Comportamiento por entorno
- En `localhost`, si no existe ningun usuario, la app permite setup inicial local.
- En un host publico, si no existe usuario y no configuraste `AUTH_SETUP_TOKEN` ni bootstrap inicial, el setup queda bloqueado.

## Ejecucion local sin Docker
```powershell
cd C:\Proyectos\mi-primer-proyecto-ia
npm.cmd install
npm.cmd start
```

URL:
- `http://127.0.0.1:3000`

## Ejecucion con Docker
1. Copia `.env.example` a `.env`.
2. Ajusta variables segun el entorno.
3. Construye y levanta los contenedores.

```powershell
cd C:\Proyectos\mi-primer-proyecto-ia
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Variables importantes para VPS publico
- `AUTH_COOKIE_SECURE=true`
- `TRUST_PROXY=1`
- `AUTH_INITIAL_EMAIL` y `AUTH_INITIAL_PASSWORD`, o `AUTH_SETUP_TOKEN`
- `AUTH_SESSION_TTL_HOURS`

## Recomendacion de despliegue en VPS
Para exponerla en internet, usala detras de un proxy reverso con HTTPS real, por ejemplo:
- Nginx
- Caddy
- Traefik

Minimo recomendado:
1. HTTPS obligatorio.
2. `AUTH_COOKIE_SECURE=true`.
3. `TRUST_PROXY=1`.
4. Primer admin creado por bootstrap o por token.
5. No dejar setup abierto sin control.

## Flujo de uso
1. Inicia sesion con el administrador.
2. Selecciona empresa y mes activos.
3. Carga ejecucion y presupuesto.
4. Revisa dashboard, analisis, acciones y bitacora.
5. Cambia la contrasena inicial despues del primer acceso si aplicaste bootstrap.

## Limitaciones actuales
- Es un esquema de autenticacion para una app administrativa pequena, no un IAM corporativo.
- No hay recuperacion de contrasena por correo.
- No hay MFA.
- No hay roles finos todavia; el usuario actual es administrador.
- La persistencia sigue en JSON local.

## Proximos pasos recomendados
- Migrar usuarios y sesiones a PostgreSQL.
- Agregar auditoria de login/logout.
- Agregar expiracion deslizante de sesion.
- Incorporar roles y permisos por modulo si habra mas de un tipo de usuario.


## Credenciales predeterminadas
Si la base local no tiene usuarios, la app crea automaticamente este administrador:
- Usuario: `admin@pgcontrol.local`
- Contrasena: `PgcAdmin_2026!Cambiar`

Cambialos apenas ingreses desde la vista `Configuracion`:
- `Usuario de acceso` para cambiar nombre visible y correo de login
- `Seguridad de acceso` para cambiar la contrasena
