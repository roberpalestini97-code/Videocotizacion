# Deploy demo (T45): Vercel + Render

Vercel Functions no aceptan WebSocket entrante y la API guarda el estado en memoria, así que la API Go
corre en Render (un contenedor persistente) y los dos fronts en Vercel.

| Pieza | Dónde | URL |
|------|-------|-----|
| Videollamada (`real-time-quote-bot/`, TanStack Start) | Vercel, proyecto `videocotizacion` | https://videocotizacion.vercel.app |
| Panel del asesor (`proyecto/panel-asesor/`, Vite SPA) | Vercel, proyecto `videocotizacion-panel` | https://videocotizacion-panel.vercel.app |
| API Go (`proyecto/backend/`, Docker) | Render, servicio `videocotizacion-api` (`render.yaml`) | https://videocotizacion-api.onrender.com |

## Cómo se conectan

- **Videollamada → API**: directo a Render (`VITE_VC_API_BASE`). La API da CORS a los orígenes de
  `ORIGENES_PUBLICOS` y, con `SEMILLA_LOCAL=1`, los suma a la clave pública de la demo.
  El socket de medios va a `URL_MEDIOS` (`wss://videocotizacion-api.onrender.com`).
- **Panel → API**: mismo origen. `panel-asesor/vercel.json` reescribe `/v1/*` a Render, así la cookie
  `__Host-vc_panel` queda en el dominio del panel.

## Variables

Render (ver `render.yaml`): `GEMINI_API_KEY` se carga a mano en el dashboard (no se versiona).
`CLAVE_HMAC` la genera Render. `PROVEEDOR_STT=gemini` (T47): el celular habla de corrido y el
servidor transcribe; cada turno de voz son dos llamadas a Gemini (transcripción + LLM).

Vercel `videocotizacion` (Root Directory `real-time-quote-bot`):

```
NITRO_PRESET=vercel
VITE_VC_API_BASE=https://videocotizacion-api.onrender.com
VITE_VC_CLAVE_PUBLICA=vc_pub_local_demo_clave_publica_navegador
VITE_VC_ENLACE_DEMO=demoLocalVideocotiz001
```

Vercel `videocotizacion-panel` (Root Directory `proyecto/panel-asesor`): sin variables.

## Límites de la demo

- `ENTORNO=desarrollo` + `ALMACEN=memoria`: cada reinicio o deploy de Render borra sesiones y cotizaciones
  y vuelve a sembrar la demo. Producción real = Postgres y `ENTORNO=produccion` (T11).
- Plan free de Render: se duerme a los 15 min sin tráfico; el primer pedido tarda ~1 min.
- Gemini en nivel gratuito: solo datos ficticios (`docs/ia/gemini.md`). Con `PROVEEDOR_STT=gemini` el
  audio del cliente también va a Gemini (no se guarda): el cupo gratuito se gasta el doble por turno de voz.
