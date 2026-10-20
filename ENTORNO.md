# Entorno local (máquina nueva)

Esta guía deja la misma pila que usamos para desarrollar: backend Go en memoria con semilla demo, videollamada contra ese backend y panel del asesor en modo simulado.

Leela antes de instalar nada. Los archivos `.env` y `.env.local` **no están en Git**. Hay que crearlos a partir de las plantillas. La clave de Gemini tampoco está en el repo.

## Qué queda corriendo

| Proceso | URL | De dónde sale la config |
|---------|-----|-------------------------|
| Backend | http://127.0.0.1:8080/salud | `proyecto/backend/.env` |
| Videollamada | http://127.0.0.1:5173/c/demoLocalVideocotiz001 (Laura; ver también 002/003 abajo) | `real-time-quote-bot/.env.local` |
| Panel asesor (simulado) | http://127.0.0.1:5174 | `proyecto/panel-asesor/.env.mock` (ya viene en el repo) |

El panel simulado **no ve** las llamadas del backend. Sirve para recorrer Perfil, cotizaciones y registros con datos de mentira.

Puertos que usa el script: `8080` (API), `5173` (videollamada), `5174` (panel). También libera `5175` y `8787` si los tenía ocupados un proceso de este repo.

## Qué instalar

En Windows 10 u 11, con PowerShell:

| Herramienta | Versión | Para qué |
|-------------|---------|----------|
| Git | actual | clonar el monorepo |
| Node.js | **22 o más nueva** (referencia: 22.17.1). El panel declara `"node": ">=22"` | videollamada, panel, conductas y contrato |
| npm | el que trae ese Node | `npm ci` |
| Go | **1.25 o más nueva** (`proyecto/backend/go.mod` dice `go 1.25.0`; la imagen y el CI usan 1.27.2, con los arreglos de seguridad de net/http y crypto/tls) | API |
| Chrome o Edge | actual | la voz es el reconocimiento `es-AR` del navegador. Firefox no alcanza para esa parte |

Docker Desktop es opcional. El día a día usa `ALMACEN=memoria` y no levanta Postgres. Docker hace falta solo si vas a probar `proyecto/infra/` (compose de producción). Ese compose **no** es este entorno: lee otros nombres de variables (`VC_*`) y todavía no están alineados con lo que lee la API.

No hace falta nvm, pnpm ni una base local.

## Clonar y abrir

```powershell
git clone https://github.com/roberpalestini97-code/Videocotizacion.git
cd Videocotizacion
```

En Cursor, abrir `proyecto.code-workspace` (carpetas `proyecto/` y `real-time-quote-bot/`). Reglas de agentes: `AGENTS.md` en esta raíz.

## Archivos de entorno

Crearlos en la raíz del clone. No commitearlos.

### 1. Backend — `proyecto/backend/.env`

```powershell
Copy-Item proyecto\backend\.env.example proyecto\backend\.env
```

Completar **solo** `GEMINI_API_KEY`. El resto de la plantilla ya es el entorno nuestro. Queda así:

```
ENTORNO=desarrollo
ALMACEN=memoria
DIRECCION=127.0.0.1:8080
CLAVE_HMAC=clave-de-desarrollo-de-32-bytes-minimo
PROVEEDOR_STT=navegador
PROVEEDOR_LLM=gemini
PROVEEDOR_TTS=navegador
PROVEEDOR_WHATSAPP=enlace
SEMILLA_LOCAL=1
LOG_NIVEL=debug
GEMINI_API_KEY=<pegar la clave>
GEMINI_MODEL=gemini-3.1-flash-lite
```

`GEMINI_API_KEY` no se versiona. Pedila a Rober o creala en https://aistudio.google.com/apikey (cuenta de Google, mayor de 18). Con nivel gratuito, solo datos y personas ficticias: ver `proyecto/docs/ia/gemini.md`.

`CLAVE_HMAC` de arriba es una frase de desarrollo, igual en todas las máquinas. No es la clave de producción.

`SEMILLA_LOCAL=1` crea en memoria, al arrancar:

- tres enlaces con avatar VALID 3D (ver `proyecto/docs/avatar/valid-avatars-glb.md`):
  - `demoLocalVideocotiz001` → Laura / pintura
  - `demoLocalVideocotiz002` → Tito / jardinería
  - `demoLocalVideocotiz003` → Juan / mantenimiento
- clave pública `vc_pub_local_demo_clave_publica_navegador`
- orígenes permitidos: `localhost` y `127.0.0.1` en los puertos 5173, 5174 y 3000
- panel API real: `demo@videocotizacion.local`, `demo2@…`, `demo3@…` (misma contraseña de semilla)

### 2. Videollamada — `real-time-quote-bot/.env.local`

```powershell
Copy-Item real-time-quote-bot\.env.example real-time-quote-bot\.env.local
```

La plantilla ya trae los valores públicos. No hace falta editarla:

```
VITE_VC_MOCK=
VITE_VC_API_BASE=http://127.0.0.1:8080
VITE_VC_CLAVE_PUBLICA=vc_pub_local_demo_clave_publica_navegador
VITE_VC_ENLACE_DEMO=demoLocalVideocotiz001
```

Son públicos a propósito (van en el navegador). La clave secreta `vc_sec_…` no va en el front.

### 3. Panel — mock o API real

- **Mock** (sin backend): `cd proyecto/panel-asesor && npm run dev` — usa `.env.mock` (`VITE_USAR_MOCK=1`). Login: `admin@asesores.local` o `juan@asesores.local`, contraseña `frase-larga-de-demo-0`, TOTP `123456`. No lista llamadas reales.
- **API real** (recomendado con `levantar-local.ps1`): el script abre el panel con `npm run dev:api` (proxy `/v1` → backend). Login semilla: `demo@videocotizacion.local`, misma contraseña, segundo paso código de recuperación `DEMO-LOCA-2026`. Tras una videollamada en `demoLocalVideocotiz001`, **Mis cotizaciones** debe mostrar la sesión. Detalle: `proyecto/docs/fe/panel-backend-local.md`.

## Instalar dependencias

Desde la raíz del clone, una vez:

```powershell
npm ci --prefix real-time-quote-bot
npm ci --prefix proyecto\panel-asesor
npm ci --prefix proyecto\conductas
npm ci --prefix proyecto\contracts\verificacion
go -C proyecto\backend mod download
```

`conductas` y `contracts/verificacion` hacen falta para `verificar-repo.ps1`, no para abrir la videollamada.

## Levantar

```powershell
powershell -File proyecto\scripts\levantar-local.ps1
```

Abre tres ventanas de PowerShell. La primera vez Go compila y tarda. No es un build de producción.

El script se niega a arrancar si falta alguna clave de los `.env`, si `GEMINI_API_KEY` está vacía, o si no están `go`, `npm` y las carpetas `node_modules` del front y del panel. No imprime valores secretos.

Comprobar:

1. http://127.0.0.1:8080/salud responde.
2. http://127.0.0.1:5173/c/demoLocalVideocotiz001 abre la videollamada. Permitir cámara y micrófono. La voz del cliente es el navegador; el servidor no hace STT ni TTS.
3. http://127.0.0.1:5174 entra al panel con el usuario de demo de arriba.

### Si preferís tres terminales a mano

Backend:

```powershell
cd proyecto\backend
$env:LOG_NIVEL = "debug"
go run ./cmd/api servir
```

Videollamada:

```powershell
cd real-time-quote-bot
node .\node_modules\vite\bin\vite.js dev --host 127.0.0.1 --port 5173 --strictPort
```

Panel:

```powershell
cd proyecto\panel-asesor
node .\node_modules\vite\bin\vite.js --mode mock --host 127.0.0.1 --port 5174 --strictPort
```

En Windows no uses `npm run dev -- --port …`: `npm.ps1` se come los argumentos que van después de `--`.

## Verificar el repo

Con las dependencias instaladas, desde la raíz:

```powershell
powershell -File proyecto\scripts\verificar-repo.ps1
powershell -File proyecto\scripts\verificar-corte-local.ps1
```

El segundo script valida tarifas/motor T26 y panel semilla T44 sin correr todo el backend E2E.

Corre tests de Go, `npm run verificar` en conductas, la validación del contrato y, si existe el front, `npm run contrato:verificar`. Si Docker está instalado y el daemon anda, también `docker compose config`. Sin Docker, ese paso se omite.

## Qué no hace falta para este entorno

- Postgres, ni `ALMACEN=postgres`.
- `proyecto/infra/.env` ni `scripts/generar-secretos.sh`. Eso es el compose de la VM, con secretos generados, y no replica esta demo.
- Cuenta de WhatsApp Business. `PROVEEDOR_WHATSAPP=enlace` solo arma un `wa.me`.
- Claves de STT o TTS. Esas patas son `navegador`.
