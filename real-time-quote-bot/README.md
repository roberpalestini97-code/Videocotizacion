# Smart Quote AI

Mockup web app para Videollamada, me imaginé como una landing, con el logo que voy a compartir, abajo botón queabra una animación, que simule una conexión de llamadas, pida micrfono y camara, y comience jna conversión con el Modelo de IA que vamos a entrenar para cotizar trabajos de mano de obra , reparaciones, mantenimientos, pinturas de casa, jardinería, limpieza. Proponer 3 avatars y planear el desarrollo y la usabilidad y las instrucciones para usar con el nuestro modelo

La idea es que sea un profesional y mediante instrucciones, o indicaciones, y observabilidad , evaluación de el trabajo y del esfuerzo, en el momento, vaya tomando los datos y proponga presupuestos, buscando el camino feliz del negocio en que yo lo llame porque la VideoCotización devolvió un resultado positivo de cliente interesado en iniciar a realizar el trabajo con nosotros

Home , faq , legales, contacto, cómo funciona

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://real-time-quote-bot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8026e1c8-f3f0-4e62-a9ce-1ac8f1c33d9d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Desarrollo local

Este front vive en el monorepo [Videocotizacion](https://github.com/roberpalestini97-code/Videocotizacion), carpeta `real-time-quote-bot/`. No se levanta solo: habla con el backend Go.

Guía para una máquina nueva (Node 22, Go, `.env` y los tres procesos): [`../ENTORNO.md`](../ENTORNO.md).

```powershell
# Desde la raíz del monorepo, después de crear .env.local desde .env.example:
npm ci --prefix real-time-quote-bot
powershell -File proyecto\scripts\levantar-local.ps1
```

Videollamada: http://127.0.0.1:5173/c/demoLocalVideocotiz001

`.env.local` (no se versiona) apunta al backend en `http://127.0.0.1:8080` con la clave pública de la semilla local. La clave de Gemini va solo en `proyecto/backend/.env`.
