# BRIEF — VideoCotización (fuente de verdad para todos los agentes)

Dueño: Rober (Argentina, español rioplatense). Todo texto para humanos va en español rioplatense; identificadores de código en español o inglés según el módulo, pero consistentes.

## Producto
Servicio de cotización de mano de obra por videollamada. El cliente final entra desde el front (Lovable) con "Iniciar VideoCotización", habla con un avatar con apariencia de **trabajador constructor**, y recibe un presupuesto orientativo. Rober tiene ~100 profesionales/asesores (pintura, jardinería; luego reparaciones, mantenimiento, limpieza) que hacen los trabajos en: **Mar Chiquita, Cobo, Santa Clara y Parque Lago**.
El backend (Go) debe poder **venderse como API** a terceros (multi-tenant).

## Decisiones tomadas por Rober (no reabrir)
1. Avatar: 3D en vivo en el navegador (visemas) **más** un modo de avatar de clips pregrabados. El avatar corre en el browser.
2. El cliente entra por un **enlace opaco del profesional**: `https://cotizar.<dominio>/c/<id_publico>` en el front de Lovable (botón "Iniciar VideoCotización").
3. **Cámara obligatoria**: se ve al cliente. Se muestrean fotogramas (JPEG ≤1024 px y ≤128 KiB, uno cada 3 s). **No se guardan**; solo se usan para que el modelo extraiga datos.
4. **Pizarrón en vivo** en pantalla con los datos que se van anotando (no rompe la conversación).
5. El **precio va solo al final** de la llamada. Se guarda la consulta y el presupuesto para el backoffice; en el panel del asesor se ve un **resumen**.
6. **Sin pasarela de pago**: se deriva al cliente a WhatsApp con el profesional por enlace `wa.me` con un código de referencia.
7. Capacidad inicial: **hasta 5 llamadas simultáneas y 500 minutos por mes**; a más demanda, más minutos; si el gasto sube, primero se optimiza y luego se cobra un servicio.
8. Tarifario 2026 de Argentina: provisorio ("referencia_publica_sin_validar"), sujeto a cambios; luego se reemplaza con presupuestos reales de los profesionales.
9. Panel para asesores: SPA React + TypeScript + Vite: **Perfil, Mis cotizaciones, Registros**.

## Arquitectura (resumen)
- Backend Go modular (puertos y adaptadores, proveedores falsos para todo lo externo: STT, LLM, TTS, WhatsApp).
- PostgreSQL 16 con **RLS + FORCE ROW LEVEL SECURITY**, rol de API **sin BYPASSRLS**, `SET LOCAL app.tenant_id` por transacción, migraciones con rol dueño (`api migrar`), `tenant_id` obligatorio en todo.
- **El LLM solo extrae datos** con JSON Schema (sin campos de monto). **El precio lo calcula Go** en centavos `int64` desde tablas de tarifas.
- Contrato: OpenAPI 3.1 + JSON Schema 2020-12 (ajv strict, Redocly, Spectral). Solo el OpenAPI es candidato a 1.0.0; los eventos de sesión y el encabezado binario NO se congelan todavía.
- Panel del asesor: cookie `__Host-vc_panel`, `X-CSRF-Token`, TOTP y reautenticación para acciones sensibles.
- Seguridad: abuso de costos, desafío `X-Desafio` anti-bots, cuota dinámica con topes duros, Origin por tenant, claves públicas de widget, registro de lecturas.
- Ley 25.326 (datos personales, Argentina): consentimiento antes de cámara/micrófono, finalidad, retención con borrado, derechos ARCO, transferencia internacional. Todo lo legal queda marcado **"a validar con abogado"**; no citar artículos de los que no haya certeza.

## Reglas del equipo
- Contrato primero. Quien escribe no revisa (otro agente/modelo). **Hecho = verificado** con pruebas corridas. Suposiciones declaradas. Todo cambio que cruza módulos pasa por el Arquitecto.
- Cada entrega se **copia a la PC de Rober** (`C:\Users\usuario\Documents\videocotizacion\proyecto`).
- Honestidad sobre límites: lo no probado (avatar en navegador real, Docker, TLS a la base, lector de pantalla, backend real con panel) se declara como no probado.

## Pendientes de Rober (no bloquean el avance)
Visto a los enums de conductas; estilo del panel; cómo paga los servicios de IA del exterior; abogado para Ley 25.326; dominio propio; gasto máximo mensual en IA; validación de tarifas con un pintor y un jardinero.

## Estructura del repo
`docs/adr`, `docs/review`, `docs/seguridad`, `contracts/`, `backend/`, `panel-asesor/`, `conductas/`, `tarifas/`, `avatar-spike/`, `infra/`. El historial de decisiones por tarea está en `docs/respaldo-tablero.md` (leerlo antes de empezar).

Máquina nueva (instalación, `.env` y arranque de las tres apps): `ENTORNO.md` en la raíz del monorepo, un nivel arriba de esta carpeta `proyecto/`.
