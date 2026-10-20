/* Tablero VideoCotización. Fuente compartida.
   Cursor y Claude editan ESTE archivo (docs/tablero/datos.js).
   index.html lo muestra. No guardes el estado en la base del artifact de Claude.
   Tarea: id, titulo, agente, status (pendiente | en_curso | en_revision | hecha | bloqueada), rehacer, nota.
   Pregunta abierta: abierta true. Para cerrarla: respuesta y abierta false.
*/
window.TABLERO = {
  "meta": {
    "phaseIndex": 3,
    "verificacion_repo": {
      "fecha": "2026-10-12T19:35",
      "rama": "main @ 11cedd3 (T26/T44 merge); feat/tablero-cobertura-oct2026 en curso",
      "entorno": "Windows 2026-10-12: go test ./internal/cotizador/... ./internal/semillalocal/...; rutas TestPanelSemillaLocal* (2); node tarifas/verificar.mjs 0 fallas",
      "postgres_prueba": "PG_PRUEBA_URL si definida",
      "backend_go_test": "verificar-repo 2026-10-12: go test ./... ok (fix cmd/medir-gemini en arquitectura); verificar-corte-local ok",
      "infra_compose_config": "docker compose config ok",
      "conductas_verificar": "0 fallas (12+20)",
      "contrato_validar": "0 fallas",
      "contrato_vectores": "506 ok",
      "contrato_referencias_prompts": "6 slugs; anclas LF y prueba CRLF=LF",
      "lovable_contrato_verificar": "npm run contrato:verificar ok (rama PR T04, 2026-10-11)",
      "no_probado": "redocly/spectral; docker build/up; presupuesto emitido en la llamada (Gemini suelto respondió 200; el backend se reinició a las 15:04 con esa clave)",
      "script_local": "scripts/verificar-repo.ps1 · scripts/verificar-corte-local.ps1 (motor+T44+tarifas) · resolver-go-en-path.ps1"
    },
    "corte_gratis": {
      "definicion": "App gratis de uso propio: la videollamada cotiza con voz del navegador, Gemini en nivel gratuito (solo datos ficticios) y tarifas provisorias. Panel local en camino a llamadas reales (T44, semilla + dev:api). No incluye API vendible ni modelo 3D propio en producción.",
      "probado_2026_10_12": "Rober: pruebas manuales locales OK (videollamada + flujo general). Agente: TestPanelSemillaLocalLoginListaVacia; motor_cotizacion en JSON; levantar-local panel dev:api.",
      "falta_para_cotizar": "Confirmar en una llamada nueva que cotizacion.emitida llega al panel (Mis cotizaciones) con GEMINI activo; declarar en nota T44 cuando Rober lo verifique.",
      "no_hace_falta_cerrar": "Las 21 tareas en revisión no bloquean esta demo. Siguen en revisión porque quien escribe no se revisa a sí mismo."
    },
    "pendiente_goal": [
      "2026-10-19 SIGUEN (Rober marca goal): 1) STT en el servidor con Gemini para voz tipo Zoom en el celular (transcriptor.go sin commitear; falta config PROVEEDOR_STT=gemini, arranque, tramas PCM16 0x01 desde el front y prueba en celular real)",
      "2026-10-19 SIGUEN: 2) T45 cerrar deploy tras merge del PR #10: produccion Vercel, proxy /v1 y login del panel, llamada E2E WS+Gemini; de paso T44 (cotizacion.emitida llega a Mis cotizaciones)",
      "2026-10-19 SIGUEN: 3) T08 medir avatar con entornos T46 en Android gama media e iPhone viejo (necesita equipos de Rober)",
      "2026-10-19 SIGUEN: 4) T12 CI en GitHub Actions que corra verificar-repo en cada PR",
      "Rama feat/tablero-cobertura-oct2026: T42 checklist panel, T11 compose-smoke, estabilidad tests",
      "T44: confirmación Mis cotizaciones post-Gemini (Rober: lo prueba y avisa)",
      "P-tarifas: 10 preguntas README — entrevistas proximamente",
      "T13/T11: compose cuando Docker estable (IA solo free tier por ahora)",
      "T04a/T43: revisión PostgreSQL/RLS",
      "T41 revisiones cruzadas"
    ],
    "ruta_desarrollo_sugerida": [
      "1. PR feat/T26-T44-motor-panel-local → main (demo: videollamada Lovable + panel API + motor tarifas)",
      "2. T44: Rober confirma Mis cotizaciones tras llamada Gemini; luego marcar T44 hecha",
      "3. IA: solo capas gratuitas (Gemini free); sin pago exterior ni tope de gasto hasta escalar",
      "4. Front: dominio Lovable por ahora (P-dominio); panel UX simple y fácil de manejar (P-estilo → T34 cuando toque)",
      "5. T26/P-tarifas: próximamente entrevistas README; hasta entonces tarifario referencia + motor reglas",
      "6. Enums T05: visto Rober 2026-10-12; tipos extra en esquema; reglas motor opcionales después",
      "7. Legal: Ley 25.326 validada con abogado (P-abogado cerrada); seguir notas en docs/seguridad",
      "8. Paralelo sin bloquear demo: T11 Docker, T43/T04a PG, revisiones T41"
    ],
    "plan_trabajo_oct_2026": {
      "ahora": ["T42 verificación panel + T11 compose-smoke", "Esperar confirmación T44 panel post-llamada"],
      "proxima_semana": ["P-tarifas: cargar respuestas pintor/jardinero en tarifas-2026.json", "T43/T04a PG con PG_PRUEBA_URL"],
      "cuando_escale": ["Dominio propio", "Plan pago IA exterior", "Compose producción"]
    },
    "goal": "Todos los agentes trabajan en su lista de tareas asignadas y avanzan juntos hacia el mismo objetivo: una videollamada de cotización con avatar propio y una API que se pueda vender a terceros.",
    "reglas": [
      "Contrato primero. Quien escribe no revisa: lo mira otro agente, con otro modelo.",
      "Hecho significa verificado con pruebas corridas. Lo que no se probó se declara.",
      "Todo cambio que cruza módulos pasa por el arquitecto.",
      "Cada entrega se copia a la PC de Rober (Documents/videocotizacion/proyecto) antes de darla por hecha.",
      "Este archivo es la única copia del tablero. No vuelvas a usar la base del artifact de Claude."
    ],
    "conclusion": {
      "resumen": "Ninguno de los 10 aprobó el plan original: seis vieron un problema de fondo y cuatro pidieron ajustes. El plan pasó de 23 a 30 tareas y después siguió creciendo. El LLM solo extrae datos; el precio lo calcula Go.",
      "acuerdos": [
        "Alguien es dueño del ciclo de voz: transcripción, LLM, voz y visemas.",
        "Consentimiento y aislamiento por cliente entran al contrato desde el inicio.",
        "El contrato lo revisa un modelo distinto del que lo escribe.",
        "Una tarea no se da por hecha sin pruebas corridas."
      ],
      "ajustes": [
        "El arquitecto corre en Opus 5.5 hasta que haya créditos de Fable 5.1. Con créditos, el arquitecto pasa a Fable y el revisor sigue en Opus."
      ],
      "sincronia": [
        "Primero el contrato, después el backend y el panel, y al final el avatar y Lovable.",
        "Las notas largas de cada tarea siguen en docs/respaldo-tablero.md y también están copiadas en cada tarjeta."
      ]
    }
  },
  "agents": [
    {
      "id": "arq",
      "order": 1,
      "nombre": "Arquitecto",
      "stack": "ADRs, contrato OpenAPI y eventos de sesión",
      "modelo": "Opus 5.5 (objetivo: Fable 5.1)",
      "consultor": "Sonnet 5.5",
      "rol": "Arquitecto",
      "estado": "trabajando",
      "actual": "T41 · en revisión"
    },
    {
      "id": "go",
      "order": 2,
      "nombre": "Backend Go",
      "stack": "Go, PostgreSQL, RLS y sesión",
      "modelo": "Opus 5.5",
      "consultor": "Sonnet 5.5",
      "rol": "Backend Go",
      "estado": "trabajando",
      "actual": "T04 · en curso"
    },
    {
      "id": "cot",
      "order": 3,
      "nombre": "Motor de cotización",
      "stack": "Conductas, prompts y tarifas",
      "modelo": "Opus 5.5",
      "consultor": "Sonnet 5.5",
      "rol": "Motor de cotización",
      "estado": "trabajando",
      "actual": "T06 · en revisión"
    },
    {
      "id": "av",
      "order": 4,
      "nombre": "Avatar 3D",
      "stack": "Visemas y avatar en el navegador",
      "modelo": "Opus 5.5",
      "consultor": "Sonnet 5.5",
      "rol": "Avatar 3D",
      "estado": "trabajando",
      "actual": "T07 en el front · en revisión"
    },
    {
      "id": "seg",
      "order": 5,
      "nombre": "Seguridad y datos",
      "stack": "Ley 25.326, amenazas y credenciales",
      "modelo": "Opus 5.5",
      "consultor": "Sonnet 5.5",
      "rol": "Seguridad y datos",
      "estado": "trabajando",
      "actual": "T33 · en revisión"
    },
    {
      "id": "rev",
      "order": 6,
      "nombre": "Revisor independiente",
      "stack": "Revisión cruzada, otro modelo que el autor",
      "modelo": "Opus 5.5",
      "consultor": "Sonnet 5.5",
      "rol": "Revisor independiente",
      "estado": "esperando",
      "actual": "5 tareas asignadas"
    },
    {
      "id": "fe",
      "order": 7,
      "nombre": "Frontend",
      "stack": "Panel del asesor y front de Lovable",
      "modelo": "Sonnet 5.5",
      "consultor": "Opus 5.5",
      "rol": "Frontend",
      "estado": "trabajando",
      "actual": "T10 · en revisión"
    },
    {
      "id": "ops",
      "order": 8,
      "nombre": "Infra",
      "stack": "Docker, CI, dominio y costos",
      "modelo": "Sonnet 5.5",
      "consultor": "Haiku 4.5",
      "rol": "Infra",
      "estado": "trabajando",
      "actual": "T11 · en revisión"
    },
    {
      "id": "qa",
      "order": 9,
      "nombre": "Pruebas",
      "stack": "Contrato, conductas y flujo completo",
      "modelo": "Sonnet 5.5",
      "consultor": "Haiku 4.5",
      "rol": "Pruebas",
      "estado": "trabajando",
      "actual": "T16 · en revisión"
    },
    {
      "id": "doc",
      "order": 10,
      "nombre": "API pública y docs",
      "stack": "Documentación y ejemplo de integración",
      "modelo": "Sonnet 5.5",
      "consultor": "Haiku 4.5",
      "rol": "API pública y docs",
      "estado": "esperando",
      "actual": "2 tareas asignadas"
    }
  ],
  "tasks": [
    {
      "id": "T01",
      "titulo": "Registrar ADRs: backend Go modular, pipeline de voz (transporte, transcripción, LLM, voz, visemas), proveedores, persistencia, multi-cliente y flujo de datos con qué se graba",
      "agente": "arq",
      "status": "hecha",
      "rehacer": false,
      "nota": "5 ADR + índice en docs/adr, todos como Propuesto. Verificado: 6 secciones por ADR y sin precios inventados. Los acepta T24. Pendiente de Rober: avatar en navegador o en la VM (P1)."
    },
    {
      "id": "T02",
      "titulo": "Definir contratos: OpenAPI (autenticación, consentimiento, ARCO, errores, versionado) y eventos de sesión con visemas, con el JSON Schema de salida de cotización",
      "agente": "arq",
      "status": "hecha",
      "rehacer": false,
      "nota": "Solo el OpenAPI es candidato a 1.0.0 (contracts/estado-de-congelamiento.md). Los eventos de sesión quedan como borrador hasta que Rober responda P1 y se pruebe el token en navegadores reales."
    },
    {
      "id": "T03",
      "titulo": "Esqueleto del backend Go (sesión, cotización, clientes) con healthcheck y configuración",
      "agente": "go",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Esqueleto en backend/: compila, vet y tests con -race pasan. Revisado por T20: sin hallazgos altos, 5 correcciones obligatorias para el primer paso de T04. No probado: imagen Docker ni PostgreSQL."
    },
    {
      "id": "T04",
      "titulo": "Endpoints de sesión y cotización contra el contrato, con persistencia que nace con tenant_id y retención",
      "agente": "go",
      "status": "en_curso",
      "rehacer": true,
      "nota": "Parte a (T04a) hecha. WS→turno→respuestas_modelo; MaterialTurno/S4. Dev local: SEMILLA_LOCAL + internal/semillalocal (G05), CORS loopback, dotenv, scripts/levantar-local.ps1. origin/main y la rama T04-dev-local-semillalocal coinciden en b188b7c (2026-10-12). Falta revisión T04a/T43, docker build/up y el plan pago de T13."
    },
    {
      "id": "T04a",
      "titulo": "Corregir H1–H5 de T20 y persistencia en PostgreSQL con RLS, migraciones y arranque seguro",
      "agente": "go",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Verificado por mí contra PostgreSQL 16 real: gofmt limpio, go vet, go test -race verde (almacén memoria y postgres). TestRespuestasModeloPostgres (0014) cuando PG_PRUEBA_URL. Sin probar: TLS, Docker/compose. Falta revisión de un modelo distinto (Sonnet)."
    },
    {
      "id": "T05",
      "titulo": "Conductas por tipo de cliente y trabajo, y JSON Schema de salida del LLM (el LLM extrae datos, no calcula precios)",
      "agente": "cot",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Esquema 1.0 + conductas; validador 0 fallas. Visto Rober enums 2026-10-12 (P-enums); tipos extra en esquema. Validación campo con pintor/jardinero pendiente (P-tarifas). 2 valores siguiente_paso vs ADR 0002: arq/seg revisión cruzada."
    },
    {
      "id": "T06",
      "titulo": "Reglas de plazo largo y prompts por oficio, con minimización de datos y defensa contra inyección de prompts",
      "agente": "cot",
      "status": "en_revision",
      "rehacer": false,
      "nota": "Escrita por cot (2026-10-09). npm run verificar 0 fallas (12+20). Backend: MaterialTurno, slugsPrompt↔6 markdown (TestSlugsMarkdownT06), ancla paisajismo en Go+Node. S4 paisajismo→jardineria. Falta revisión cruzada y visto Rober (T05)."
    },
    {
      "id": "T07",
      "titulo": "Spike de avatar 3D en el navegador con visemas desde un audio de prueba, para validar el ADR antes de fijarlo y definir la interfaz del componente",
      "agente": "av",
      "status": "en_revision",
      "rehacer": true,
      "nota": "2026-10-15: GLB VALID (c-frame/valid-avatars-glb) enchufado: cargarModeloGLB + morphs h_expressions + 3 asesores demo en semilla. AvatarVivo carga URL por avatar_id (av_valid_*); fallback procedural si falla CDN. PROBADO: vitest 157/157 (AvatarVivo, catalogo VALID, blendshapes-valid); go test rutas/prompts/semillalocal. NO PROBADO: medir-avatar-en-front con red CDN en CI; llamada manual 002/003; fps en gama baja; E2E completo. Doc: proyecto/docs/avatar/valid-avatars-glb.md. Sigue en revisión."
    },
    {
      "id": "T08",
      "titulo": "Medir el avatar en equipos modestos y decidir si sigue en el navegador o pasa a alternativa 2D",
      "agente": "qa",
      "status": "bloqueada",
      "rehacer": false,
      "nota": "Sigue bloqueada para decisión: hace falta medir en la notebook de Rober, Android de gama baja/media y un iPhone viejo (protocolo en docs/avatar/spike-resultados.md). 2026-10-10: en Chromium del IDE el 3D ya corre en el front (canvas WebGL, modo=3d, modelo procedural visible). Eso no reemplaza T08."
    },
    {
      "id": "T09",
      "titulo": "Mapear el front de Lovable contra el contrato, declarar supuestos y generar cliente tipado y mock del OpenAPI",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": false,
      "nota": "2026-10-09: mapeo en docs/fe/mapeo-lovable-openapi.md. Script npm run contrato en real-time-quote-bot genera src/lib/api-contrato/generado/openapi.d.ts desde proyecto/contracts. El front sigue usando consultarAsesor hasta T10. Pendiente: mock HTTP alineado y revisión cruzada."
    },
    {
      "id": "T10",
      "titulo": "Integrar sesión, consentimiento y avatar en el front, con reconexión",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": false,
      "nota": "2026-10-10 (fe, mergeado a main, SIN revisar: quien escribe no revisa). El botón «Iniciar VideoCotización» habla con el contrato: enlace /c/<id_publico> → desafío (prueba de trabajo SHA-256) + crearSesion → consentimiento ANTES de cámara/micrófono → token de medios → WebSocket → texto del cliente (reconocimiento de voz del navegador es-AR) y fotogramas JPEG ≤1024 px/≤128 KiB cada 3 s (sin guardar) → avatar (Voz + AvatarPuerto, placeholder 2D) + pizarrón en vivo → precio solo al final (cotizacion.emitida) → wa.me con código de referencia. Reconexión con backoff, cerrarSesion y errores del catálogo en español. Reemplaza src/lib/asesor-api. PROBADO: npm ci; contrato:verificar ok; typecheck; lint (0 errores); build; vitest 145 pruebas (cliente, máquina de estados, reconexión, muestreo con límites, pizarrón, errores, controlador, conformidad con los JSON Schema del contrato contra el servidor falso); E2E Playwright en Chromium con cámara/mic FALSOS contra servidor mock HTTP+WS (scripts/e2e-videocotizacion.mjs, 47 verificaciones, 21 capturas en docs/fe/capturas/): flujo completo, consentimiento previo (getUserMedia=0 hasta aceptar), rechazo → sin_consentimiento, cámara denegada → sin_camara sin seguir, cuota agotada, desafío inválido, enlace inexistente, simultáneas agotadas, reconexión del socket (token nuevo, pizarrón conservado), sin_voz, cortar + derivación, fotogramas medidos en el servidor falso. NO PROBADO: backend real (Go) ni CORS real; LLM real; voz real (SpeechRecognition/speechSynthesis: en headless no hay voces ni reconocimiento, se probó la entrada por texto); cámara y micrófono reales; Firefox/Safari/Edge; móvil real (solo viewport 390x844 emulado en Chromium); lector de pantalla; desafío con la dificultad real (el mock usa 8 bits, el backend 16); wss:// con TLS (el mock usa ws://localhost). Huecos del contrato en docs/fe/huecos-T10.md (sin rango min–max, sin contacto del profesional en 429, sin «fuera de alcance», CORS, qué cuenta como voz para sin_voz, etc.). Pendiente: UI para corregir el pizarrón, contacto opcional, revisión cruzada. Avatar 3D/clips detrás de AvatarPuerto: ver T07 (rama T07-avatar-en-front). av es coautor y el consultor es Opus 5.5."
    },
    {
      "id": "T11",
      "titulo": "Docker Compose para correr backend y servicios en una misma VM, con base de datos, proxy con TLS y archivos estáticos del avatar",
      "agente": "ops",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Compose, Caddyfile y scripts en infra/. api.Dockerfile copia conductas/prompts y tarifas-2026.json (WORKDIR /). 2026-10-12: config.go alineado en compose; verificar-repo y scripts/compose-smoke.ps1 (docker info + compose config). docker build y compose up NO probados (daemon)."
    },
    {
      "id": "T12",
      "titulo": "CI con lint de OpenAPI, tests de contrato, lint y build de Go y del front, y escaneo de dependencias y secretos",
      "agente": "ops",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T13",
      "titulo": "Arquitectura en nube y costo por minuto con los proveedores elegidos de LLM, transcripción y voz, con rangos y fuentes",
      "agente": "ops",
      "status": "en_revision",
      "rehacer": false,
      "nota": "2026-10-12: medición en docs/ia/gemini.md. Revisión independiente APROBADA CON CAMBIOS. Aplicado: sin_voz_s 20→45; compose con PROVEEDOR_* , DB_URL, CLAVE_HMAC y GEMINI_API_KEY_FILE. No probado: compose up ni -race (sin cgo). P-gasto y plan pago siguen abiertos. Informe docs/review/T13-T25-revision-independiente.md."
    },
    {
      "id": "T14",
      "titulo": "Matriz de cumplimiento Ley 25.326 en versión mínima para el contrato: consentimiento, finalidad, retención, derechos ARCO y transferencia internacional",
      "agente": "seg",
      "status": "hecha",
      "rehacer": false,
      "nota": "Matriz de 26 obligaciones en docs/seguridad. Cita solo los artículos de los que hay certeza; lo demás va como a validar con un abogado. Verificado: 3 archivos, 32 requisitos con su forma de verificación."
    },
    {
      "id": "T15",
      "titulo": "Modelo de amenazas de la API vendible: autenticación de terceros, tenant_id, límites, aislamiento por cliente e inyección de prompts",
      "agente": "seg",
      "status": "hecha",
      "rehacer": false,
      "nota": "34 amenazas con mitigación. Dejó 11 observaciones a los ADR; la O1 (consentimiento vs token de sesión) bloquea el contrato y la resuelve T02."
    },
    {
      "id": "T16",
      "titulo": "Pruebas de contrato ejecutables derivadas del OpenAPI, incluida la separación entre clientes",
      "agente": "qa",
      "status": "en_revision",
      "rehacer": true,
      "nota": "188 vectores con resultado esperado en 0 fallas (lo corrí yo), 11 pendientes donde el contrato no decide, más plan de aislamiento de 45 casos. Hallazgos N1 (cantidad con ruido de float), N3 y A-1..A-3 van a arq/T04. Aún sin servidor contra el que correr."
    },
    {
      "id": "T17",
      "titulo": "Arnés de evaluación de conductas contra el LLM real: casos fijos, rúbrica y repeticiones, con resultados validados por técnicos",
      "agente": "qa",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T18",
      "titulo": "Integración del flujo completo, aislamiento entre clientes, consentimiento y borrado, y el ejemplo de T23",
      "agente": "qa",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T19",
      "titulo": "Fijar criterios de revisión y checklist de código limpio por stack",
      "agente": "rev",
      "status": "hecha",
      "rehacer": false,
      "nota": "Guía en docs/review/criterios.md: 48 ítems por stack, 12 errores amplios típicos y formato de informe. Verificado: 4 secciones."
    },
    {
      "id": "T20",
      "titulo": "Revisión independiente del esqueleto Go",
      "agente": "rev",
      "status": "hecha",
      "rehacer": false,
      "nota": "Sin hallazgos altos. Sí se puede construir T04 sobre el esqueleto, corrigiendo antes H2 (conformidad de repositorios), H4 (producción no debe usar memoria ni falsos), H5 (catálogo de errores), H1 (Secreto) y H3 (rol dueño). Detalle en docs/review/T20-revision-esqueleto-go.md."
    },
    {
      "id": "T21",
      "titulo": "Revisión final de la integración contra los ADR y el contrato, con la evidencia de las pruebas",
      "agente": "rev",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T22",
      "titulo": "Documentación de la API pública generada desde el OpenAPI, con chequeo en CI de diferencias con el contrato",
      "agente": "doc",
      "status": "pendiente",
      "rehacer": false,
      "nota": "Espera: conviene documentar cuando el OpenAPI pase a 1.0.0, para no reescribir la documentación."
    },
    {
      "id": "T23",
      "titulo": "Guía de integración y ejemplo de página de un tercero, con claves de prueba",
      "agente": "doc",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T24",
      "titulo": "Revisar ADRs y contrato antes de congelarlos, con un modelo distinto del autor y seg como co-revisor",
      "agente": "rev",
      "status": "hecha",
      "rehacer": false,
      "nota": "Tres informes en docs/review: Revisor, Seguridad y Pruebas dan APROBADA CON CAMBIOS. Bloquea congelar los eventos hasta que Rober responda P1. Pruebas (otro modelo) encontró un error real: una cotización fuera de zona no se podía emitir. Las correcciones van en T31."
    },
    {
      "id": "T25",
      "titulo": "Orquestador de sesión: transcripción, LLM con prompts versionados, validación de salida, cálculo de precio en Go y eventos de voz y visemas",
      "agente": "go",
      "status": "en_revision",
      "rehacer": false,
      "nota": "2026-10-10 (go, mergeado a main): turno de punta a punta: texto (+2 fotogramas más recientes, solo en memoria) → prompt por oficio → Extractor con datos previos → validación COMPLETA en Go del esquema 1.0 (cotizador.ValidarSalidaLLM; 12 ejemplos ok, 20 negativos fallan) con 1 reintento y plantilla → filtro de montos → pizarrón ampliado sin montos → avatar.respuesta + visemas del texto (voz del navegador) → precio en Go solo al emitir → cotizacion.emitida + sesion.cerrada (1000). Derivación y cierre por derivar_whatsapp, fuera_de_alcance, sin tarifa, cerrar, cuota del proveedor (429), tope de turnos y sin_voz (con aviso). intento_inyeccion marcado por el modelo o por heurística de Go; el precio no cambia (prueba). P3: turno numerado desde respuestas_modelo (límite declarado: intentos fallidos previos a un reinicio no cuentan para el tope). P4: si falla guardar respuesta o cotización → error y sin precio. PROBADO: go test -race ./... con PG real 0 SKIP, incluida TestSesionDePuntaAPuntaConPostgresYGemini (crear → consentir → token → WS → fotograma → 3 turnos con inyección → cotización → derivación; payload al proveedor sin ids/teléfono/código). NO PROBADO: modelo real, navegadores reales, latencia; pizarron.corregir sin implementar. Huecos del contrato en docs/review/T13-huecos-del-contrato.md (H1–H11). Falta revisión independiente."
    },
    {
      "id": "T26",
      "titulo": "Tablas de precios por oficio y zona, validadas por técnicos reales",
      "agente": "cot",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Tarifario 2026 provisorio en tarifas/: pintura 14/17, jardinería 9/15 con precio; referencias UOCRA/casas particulares oct 2026 como piso laboral (no precio venta). ADR 0007 + motor_cotizacion en JSON (reglas trabajo→tarea, capas overlay). Reglas proxy para enums nuevos (enduido, hongos, hidrolavado, césped, cercos). PROBADO 2026-10-12: verificar.mjs + verificar-corte-local + go test cotizador/semillalocal/rutas T44. NO probado: overlay tenant; entrevistas P-tarifas."
    },
    {
      "id": "T27",
      "titulo": "Implementar consentimiento antes de abrir cámara y micrófono, retención con borrado automático y endpoints ARCO",
      "agente": "go",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T28",
      "titulo": "Revisión de seguridad de lo implementado: autenticación, límites, secretos, inyección de prompts y cumplimiento",
      "agente": "seg",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T29",
      "titulo": "Secretos, TLS y dominio, registros, copias de seguridad y entorno de staging, revisados por seg",
      "agente": "ops",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T30",
      "titulo": "Modelo 3D propio con blendshapes de visemas, licencia, peso máximo y alternativa 2D",
      "agente": "av",
      "status": "en_revision",
      "rehacer": false,
      "nota": "2026-10-15: camino VALID MIT vía jsdelivr (commit c539a28), no asset propio en repo. Tres GLB demo mapeados en front (catalogo.ts) + semilla 3 enlaces. Boca: pesosValid → h_expressions (sin viseme_* Oculus). Pendiente: decisión producto (RPM vs VALID vs procedural obra), peso/offline, licencia producción. PROBADO: tests unitarios front/back arriba. NO PROBADO: inspección legal final."
    },
    {
      "id": "T31",
      "titulo": "Corregir el contrato según las tres revisiones de T24",
      "agente": "arq",
      "status": "hecha",
      "rehacer": false,
      "nota": "Corrigió los hallazgos de las tres revisiones. Repetí la verificación yo: 31 esquemas, 379 ejemplos del OpenAPI y 37 casos negativos sin fallas, Redocly y Spectral limpios. Los eventos siguen sin congelar hasta que Rober responda P1."
    },
    {
      "id": "T32",
      "titulo": "ADR 0006: video del cliente (fotogramas) y pizarrón, con los eventos nuevos del contrato",
      "agente": "arq",
      "status": "hecha",
      "rehacer": false,
      "nota": "ADR 0006 y eventos de cámara y pizarrón. Revisado por seg en T33 (13 hallazgos, ya integrados en T36). Contrato verificado por mí: 0 fallas."
    },
    {
      "id": "T33",
      "titulo": "Revisar el ADR 0006; definir el esquema del asesor y su credencial; y qué se guarda de cada consulta (quién pidió, presupuesto, respuestas del modelo), con retención y consentimiento",
      "agente": "seg",
      "status": "en_revision",
      "rehacer": true,
      "nota": "13 hallazgos (7 altos), 20 requisitos nuevos (R33 a R52) y 14 esquemas del asesor. Verificado por mí: los esquemas compilan y pasan sus ejemplos. Lo legal está marcado a validar con abogado. Espera tus respuestas Q1 a Q8."
    },
    {
      "id": "T34",
      "titulo": "Panel del asesor en React: perfil, mis cotizaciones y registros",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Panel en React revisado por rev (T34): sin hallazgos altos; accesibilidad medida con axe sin violaciones. Quedaron 5 correcciones y adaptarlo al contrato 0.1.2: tarea T38."
    },
    {
      "id": "T35",
      "titulo": "Ajustar ADR 0006 y contrato: cámara obligatoria, derivación a WhatsApp, clave pública del widget, guardar consulta para el backoffice",
      "agente": "arq",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Verificado por mí: validador y 193 vectores sin fallas."
    },
    {
      "id": "T36",
      "titulo": "Integrar al contrato las rutas del panel, la sesión del asesor y los requisitos R33 a R52 (contrato 0.1.1)",
      "agente": "arq",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Verificado por mí: contrato, lint y vectores en 0 fallas. Lo pendiente (R44, R49, rutas de claves de API) pasa a T04 por decisión de arq en T37."
    },
    {
      "id": "T37",
      "titulo": "Cerrar los 7 huecos del contrato que dejó el panel: datos extraídos y ítems del presupuesto, secreto único de la clave del widget, enlace de WhatsApp en el panel, ejemplos contradictorios, leer una sesión por id, contacto del cliente y mensajes de error",
      "agente": "arq",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Contrato 0.1.2-borrador. Entrada por enlace opaco de cada profesional en el front propio; avatares elegibles; desafío anti-bots; los 7 huecos del panel cerrados. Verificado por mí: 91 negativos y 245 vectores en 0 fallas, Redocly sin errores. Falta revisión de seg."
    },
    {
      "id": "T38",
      "titulo": "Adaptar el panel al contrato 0.1.2 y corregir los hallazgos de rev (mock fuera del build, foco, sesión vencida, consumo en Mi cuenta, más pruebas)",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Panel adaptado al contrato 0.1.2 y corregidos los hallazgos de rev. Verificado por mí: tsc sin errores, 94 pruebas verdes, build de producción sin el mock ni las credenciales de demo. 13 de 13 mutaciones detectadas. No probado contra backend real ni con lector de pantalla. Dejó 7 huecos menores de contrato (T39)."
    },
    {
      "id": "T39",
      "titulo": "Cerrar 7 huecos menores del contrato que dejó el panel: detalle de sesión sin código ni derivación, contacto_disponible solo en el listado, catálogo de textos, 401 ambiguo en reautenticación, consumo diario, texto para compartir, versión en la descripción",
      "agente": "arq",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Contrato 0.1.3-borrador. Verificado por mí: validar 0 fallas (48 esquemas, 622 ejemplos, 99 negativos), vectores 254 ok/0 fallas, redocly válido, spectral sin errores. Falta revisión de otro modelo."
    },
    {
      "id": "T40",
      "titulo": "Revisar el contrato 0.1.2: desafío anti-bots, enlace opaco del profesional, cuota dinámica y formulario de contacto",
      "agente": "seg",
      "status": "en_revision",
      "rehacer": true,
      "nota": "Hallazgos H14–H25, requisitos R53–R70. Veredicto: go puede empezar T04, pero crearSesion con la clave pública NO se abre al público hasta cumplir R53–R58, R60–R61 y R65–R67 (probados con proveedores falsos). Pendiente de Rober: gasto máximo mensual y abogado."
    },
    {
      "id": "T41",
      "titulo": "Aplicar al contrato y a los ADR las condiciones de seguridad de T40: Origin por tenant, sin_voz_s y motivos de cierre, simultánea, contacto con aviso y consentimiento, claves públicas y desafío, registro de lecturas",
      "agente": "arq",
      "status": "en_revision",
      "rehacer": false,
      "nota": "Contrato 0.1.4-borrador. npm run referencias-prompts (Node=Go, 6 slugs). Oficio.schema 5 valores; paisajismo T06/S4 documentado. Lovable contrato:verificar ok. Falta revisión cruzada T40."
    },
    {
      "id": "T42",
      "titulo": "Adaptar el panel al contrato 0.1.3: SesionDetalle, contacto_disponible, catálogo de etiquetas, códigos 401, consumo diario",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": false,
      "nota": "Paridad 0.1.3 ya implementada en T38/T39 (Detalle SesionDetalle, contacto_disponible vía state del listado, consumo diario Mi cuenta, 401 reautenticacion vs sesión). PROBADO 2026-10-12: npm test panel 238 tests (fix waitFor foco h1); NO probado: contrato 0.1.3 contra backend real post-merge T44."
    },
    {
      "id": "T43",
      "titulo": "Revisión independiente de T04a con un modelo distinto al que lo escribió (RLS, verificación del rol, migraciones, errores de PG)",
      "agente": "rev",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T44",
      "titulo": "Conectar el panel del asesor a llamadas reales en desarrollo local (semilla, proxy, checklist E2E)",
      "agente": "fe",
      "status": "en_revision",
      "rehacer": false,
      "nota": "Fase 0–2 auto cerrada: semilla panel, dev:api, panel-backend-local.md, TestPanelSemillaLocal* (2), verificar-corte-local.ps1, verificar-repo 2026-10-12 verde. PR feat/T26-T44-motor-panel-local → main. Rober: pruebas manuales OK; P-t44-panel-gemini pendiente. NO probado: Playwright API real."
    },
    {
      "id": "T45",
      "titulo": "Deploy demo: fronts en Vercel (videocotizacion + panel) y API Go en Render (WebSocket)",
      "agente": "infra",
      "status": "en_curso",
      "rehacer": false,
      "nota": "Rama feat/deploy-vercel-render. Backend: ORIGENES_PUBLICOS (CORS + origenes de la clave demo) y URL_MEDIOS (base wss de ws_url). render.yaml (memoria + SEMILLA_LOCAL, demo), panel-asesor/vercel.json (proxy /v1 mismo origen), imagen con esquema-salida-llm, TanStack Start 1.168.61 (CVE-2026-102989, Vercel bloqueaba el build). Probado 2026-10-17: go test -p 1 ./...; Render build+arranque, GET /v1/version 200; CORS preflight 204 para videocotizacion.vercel.app y 403 para origen ajeno; enlace demo responde; preview Vercel de la rama renderiza la portada. NO probado: produccion Vercel (espera merge a main), proxy /v1 del panel, login panel, llamada E2E con WebSocket y Gemini, bun.lock (no se regenero)."
    }
  ],
  "votes": [],
  "preguntas": [
    {
      "id": "P-dominio",
      "agente": "ops",
      "tarea": "T29",
      "abierta": false,
      "texto": "¿Tenés un dominio propio para el front? Si no, se arranca con el de Lovable.",
      "respuesta": "2026-10-12: arrancar con el dominio de Lovable; dominio propio cuando escale."
    },
    {
      "id": "P-gasto",
      "agente": "ops",
      "tarea": "T13",
      "abierta": false,
      "texto": "¿Cuánto es lo máximo que aceptás gastar por mes en los servicios de IA?",
      "respuesta": "2026-10-12: por ahora solo capas gratuitas (sin tope mensual definido hasta pasar a pago)."
    },
    {
      "id": "P-pago-exterior",
      "agente": "ops",
      "tarea": "T13",
      "abierta": false,
      "texto": "¿Cómo vas a pagar los servicios de IA del exterior?",
      "respuesta": "2026-10-12: no necesario por el momento (free tier)."
    },
    {
      "id": "P-tarifas",
      "agente": "cot",
      "tarea": "T26",
      "abierta": true,
      "texto": "¿Podés conseguir que un pintor y un jardinero de tu pueblo respondan las 10 preguntas de tarifas/README.md?",
      "ayuda": "Con eso se reemplaza el tarifario provisorio por precios reales.",
      "respuesta": "2026-10-12: proximamente; pendiente entrevistas."
    },
    {
      "id": "P-enums",
      "agente": "cot",
      "tarea": "T05",
      "abierta": false,
      "texto": "¿Das el visto a los enums de conductas de T05?",
      "respuesta": "2026-10-12: visto OK. Se agregaron trabajo.tipo (enduido_completo, tratamiento_hongos, hidrolavado, colocacion_cesped, cercos_vivos) y estado_superficie con_salitre."
    },
    {
      "id": "P-estilo",
      "agente": "fe",
      "tarea": "T34",
      "abierta": false,
      "texto": "¿Qué estilo querés para el panel del asesor?",
      "respuesta": "2026-10-12: UX/UI fácil de manejar, simple y clara (prioridad usabilidad sobre decoración)."
    },
    {
      "id": "P-abogado",
      "agente": "seg",
      "tarea": "T14",
      "abierta": false,
      "texto": "¿Hay un abogado para revisar los puntos de la Ley 25.326 marcados como a validar?",
      "respuesta": "2026-10-12: ya hablado con abogado; todo validado."
    },
    {
      "id": "P-t44-panel-gemini",
      "agente": "fe",
      "tarea": "T44",
      "abierta": true,
      "texto": "¿Tras una videollamada real con Gemini, la sesión aparece en el panel (Mis cotizaciones)?",
      "respuesta": "2026-10-12: Rober lo va a probar y avisar."
    }
  ],
  "log": [
    {
      "ts": "2026-10-18T14:00:00-03:00",
      "texto": "Claude: feat/portada-unica. Queda una sola portada (la v1) en la raiz: /, /como-funciona, /faq, /contacto, /legales. Se borraron la portada de / (Talonario) y la /v2 (Encuadre) con su CSS; /v1/* y /v2 redirigen a la raiz. Celular vertical: asesor arriba y camara abajo, mitad y mitad, chat a lo ancho y datos en vivo en una fila deslizable. Probado: tsc, vitest 171, build NITRO_PRESET=vercel, rutas y redirecciones en vite dev; llamada completa contra el backend de prod (Render) con camara y mic falsos de Chrome, en PC 1280x800 y celular 390x844, con Laura, Tito y Juan: WS, GLB 3D, fotogramas, texto y respuesta de Gemini. NO probado: voz real en celular (sigue el boton Toca para hablar; la voz tipo Zoom con STT en el servidor queda pendiente, bloqueada por disco lleno para compilar Go)."
    },
    {
      "ts": "2026-10-18T12:30:00-03:00",
      "texto": "Claude: fix/movil-tocar-para-hablar. En Android Chrome no aparecia texto (sin bips): el reconocimiento continuo arrancado sin gesto no abre el mic. Celular: boton Toca para hablar (una frase por toque, continuous=false), errores del reconocedor visibles con codigo (network/audio-capture), medidor de microfono con ondas verdes (espectro real con AnalyserNode; si el celular no comparte el mic se suelta la pista y se anima con la voz detectada), boton girar camara siempre en celular. PC sin cambios de flujo (continuo) + medidor real. Probado: vitest 171 (6 nuevos), typecheck, eslint, build NITRO_PRESET=vercel. NO probado: celular real."
    },
    {
      "ts": "2026-10-18T10:30:00-03:00",
      "texto": "Claude: hotfix fix/movil-mic-camara-panel-demo. Celular: se suelta la pista de audio de getUserMedia (Android no comparte el mic con SpeechRecognition: bucle de bips), backoff al rearmar el reconocedor, camara frontal por defecto con espejo y boton para girar (frontal/trasera). Panel demo: codigo DEMO-LOCA-2026 reutilizable (solo semilla en memoria) en las 3 cuentas. Probado: go test -p 1 ./... (TestPanelSemillaLocalRecuperacionReutilizable), front typecheck, vitest 165 (3 nuevos de girar camara), build NITRO_PRESET=vercel. NO probado: celular real (Android/iOS)."
    },
    {
      "ts": "2026-10-17T06:00:00-03:00",
      "texto": "Claude: rama feat/sync-local-oct17 sube el trabajo local (backend Gemini/semilla 3 asesores, front portada/consentimiento/avatares VALID, panel) + merge de T45. Probado: go test -p 1 ./...; front typecheck, vitest 162, contrato:verificar, build NITRO_PRESET=vercel; panel typecheck y vitest 238. NO probado: verificar-repo.ps1 completo, llamada E2E en prod."
    },
    {
      "ts": "2026-10-17T03:30:00-03:00",
      "texto": "Claude: T45 deploy demo Vercel (fronts) + Render (API Go con WebSocket; Vercel Functions no sirven WS). Rama feat/deploy-vercel-render."
    },
    {
      "ts": "2026-10-12T19:35:00-03:00",
      "texto": "main @ 11cedd3 (T26/T44); rama feat/tablero-cobertura-oct2026: T42 en revisión, compose-smoke.ps1, test foco DetalleCotizacion."
    },
    {
      "ts": "2026-10-12T19:00:00-03:00",
      "texto": "Cursor: motor_cotizacion externalizado (ADR 0007), T44 semilla+tests+scripts Go PATH, conductas enums ampliados con reglas proxy en tarifas; PR y merge a main; rama siguiente tablero-cobertura."
    },
    {
      "ts": "2026-10-12T18:20:00-03:00",
      "texto": "Rober respondió preguntas tablero: Lovable, IA free, enums visto+ampliados, panel UX simple, abogado OK; P-tarifas y P-t44 pendientes; plan_trabajo_oct_2026 en meta."
    },
    {
      "ts": "2026-10-12T12:41:00-03:00",
      "texto": "T43: go test postgres+migrador ok pero SKIP de RLS/arranque (PG_PRUEBA_URL ausente). go vet ok. Docker Desktop no queda en ejecución. La revisión independiente se cortó por conexión; se relanza."
    },
    {
      "ts": "2026-10-12T08:47:00-03:00",
      "texto": "docker info falló: no existe el pipe dockerDesktopLinuxEngine. Se lanzó Docker Desktop.exe. compose up sigue sin probar. Arrancó revisión T43 (otro modelo)."
    },
    {
      "ts": "2026-10-12T01:15:00-03:00",
      "texto": "T13/T25: sin_voz_s provisorio 45 s. Compose api/migrar alineados a config.go (PROVEEDOR_*, DB_URL, GEMINI_API_KEY_FILE). Sin compose up."
    },
    {
      "ts": "2026-10-12T01:10:00-03:00",
      "texto": "Revisión independiente T13/T25: APROBADA CON CAMBIOS (docs/review/T13-T25-revision-independiente.md). Aritmética de costo exacta. Obligatorios: sin_voz_s y nombres de variables Gemini en compose. T13 sigue en revisión."
    },
    {
      "ts": "2026-10-12T00:50:00-03:00",
      "texto": "T13: medición Gemini real (cmd/medir-gemini, 5/5 válidos) y costo por minuto en docs/ia/gemini.md. main y T04-dev-local-semillalocal en b188b7c. RPM/RPD sin número público. T13 sigue en revisión."
    },
    {
      "ts": "2026-10-11T23:55:00-03:00",
      "texto": "ENTORNO.md en la raíz: máquina nueva (Node 22, Go 1.24+, .env.example del backend con Gemini, .env.example del front ya apuntando a la semilla). La clave GEMINI_API_KEY sigue fuera del repo. Panel .env.mock versionado (solo VITE_USAR_MOCK=1)."
    },
    {
      "ts": "2026-10-11T14:30:00-03:00",
      "texto": "Corte app gratis: llamada local verificada (consentimiento, avatar 3d, cámara, texto). La clave de AI Studio responde 200; el api de las 03:22 no la había recargado. Las 21 en revisión no se marcan hechas."
    },
    {
      "ts": "2026-10-11T07:15:00-03:00",
      "texto": "Cursor: fetch — main sigue en 97dcf66 (PR T04 sin merge); verificar-repo ok; docker build bloqueado (daemon apagado)."
    },
    {
      "ts": "2026-10-11T04:05:00-03:00",
      "texto": "Gate unificado verificar-repo (Lovable incl.) ok; PR T04 apilada sobre main T07 sin conflictos."
    },
    {
      "ts": "2026-10-11T04:00:00-03:00",
      "texto": "T41: verificar-repo incluye npm run contrato:verificar (real-time-quote-bot en monorepo)."
    },
    {
      "ts": "2026-10-11T03:58:00-03:00",
      "texto": "T41/T04 PR: npm run contrato:verificar ok en real-time-quote-bot; plan-pr ampliado."
    },
    {
      "ts": "2026-10-11T03:55:00-03:00",
      "texto": "Gate verificar-repo en rama PR T04-dev-local-semillalocal: Go+conductas+506+compose ok (~2 min)."
    },
    {
      "ts": "2026-10-11T03:52:00-03:00",
      "texto": "T04: TestSembrarEnMemoria; Sembrar habilita loopback; PR rama 3 commits (dev local + .env.example + test)."
    },
    {
      "ts": "2026-10-11T03:48:00-03:00",
      "texto": "T04: backend/.env.example (SEMILLA_LOCAL, falsos); push en rama T04-dev-local-semillalocal."
    },
    {
      "ts": "2026-10-11T03:45:00-03:00",
      "texto": "T04: rama T04-dev-local-semillalocal → PR a main (semillalocal, dev local, gate verificar-repo)."
    },
    {
      "ts": "2026-10-11T03:42:00-03:00",
      "texto": "T04: verificar-repo.ps1 propaga LASTEXITCODE en todos los pasos; nota T04 tablero (semillalocal, dev local)."
    },
    {
      "ts": "2026-10-11T03:38:00-03:00",
      "texto": "Gate: verificar-repo.ps1 completo ok (Go+conductas+506+compose); main WIP sin commit."
    },
    {
      "ts": "2026-10-11T03:05:00-03:00",
      "texto": "T04: semillalocal extraído de arranque (G05); TestDependenciasEntrePaquetes verde; SEMILLA_LOCAL sin violar capas."
    },
    {
      "ts": "2026-10-10T23:55:00-03:00",
      "texto": "T07 (av, rama T07-avatar-en-front): avatar 3D + clips enchufados en el front (AvatarVivo, fallback 2D). Chromium del IDE: modo=3d, canvas WebGL, casco procedural visible. No mergeado. T08 sigue midiendo en equipos reales."
    },
    {
      "ts": "2026-10-10T23:05:00-03:00",
      "texto": "Cursor mergeó a main (pedido de Rober): feat/T13-llm-orquestador (base-verde + Gemini + T25) y feat/T10-front-contrato. No se mergearon T13-adaptador-gemini ni fix/base-verde-linux (se solapan y están más cortas). Gemini vivo ok con datos ficticios."
    },
    {
      "ts": "2026-10-10T16:58:00-03:00",
      "texto": "T13/T25 (go): adaptadores gemini/navegador/enlace + orquestador de turno completo. go test -race con PG real. Cursor después probó la API real de Gemini con datos ficticios."
    },
    {
      "ts": "2026-10-10T16:40:00-03:00",
      "texto": "T10 (fe): front conectado al contrato (enlace → desafío → sesión → consentimiento → medios por WebSocket → pizarrón → presupuesto final → WhatsApp). vitest 145 ok, E2E Chromium con cámara falsa 47/47. NO probado: backend real, voz y cámara reales."
    },
    {
      "ts": "2026-10-10T16:05:00-03:00",
      "texto": "fix/base-verde: hash de prompts CRLF→LF, .gitattributes eol=lf, migrador 0015..0001, migración 0015. Incluido en el merge de feat/T13-llm-orquestador."
    },
    {
      "ts": "2026-10-10T15:10:00-03:00",
      "texto": "Repo GitHub Videocotizacion: raíz Documents/videocotizacion; AGENTS.md (2 harness, rama+PR); rama chore/repo-inicial pusheada."
    },
    {
      "ts": "2026-10-10T01:55:00-03:00",
      "texto": "T04/T11: cotizador.AbrirDesdeRutasHabituales (arranque + WS tests); TestMapaDatosExtraidosEjemplosConductas (12 ejemplos T06)."
    },
    {
      "ts": "2026-10-10T01:45:00-03:00",
      "texto": "T06/T41: TestSlugsMarkdownT06; verificar-repo + docker compose config; tablero meta.infra_compose_config."
    },
    {
      "ts": "2026-10-10T01:35:00-03:00",
      "texto": "T11: intento docker build (daemon off); arranque AbrirCotizador +../../../tarifas; TestReferenciaAnclaPaisajismoT06; verificar-repo ok."
    },
    {
      "ts": "2026-10-10T01:25:00-03:00",
      "texto": "T11/T04: api.Dockerfile incluye conductas/prompts y tarifas-2026.json; meta.pendiente_goal en tablero."
    },
    {
      "ts": "2026-10-10T01:22:00-03:00",
      "texto": "T04: TestOpusVariasTramasPersisteRespuestaModelo; go test ./... verde; nota T04 tablero ampliada."
    },
    {
      "ts": "2026-10-10T01:20:00-03:00",
      "texto": "T04: TestPCMVariasTramasPersisteRespuestaModelo (audio acumulado → vc.respuestas_modelo)."
    },
    {
      "ts": "2026-10-10T01:18:00-03:00",
      "texto": "Tablero: scripts/verificar-repo.sh (Unix); meta.verificacion_repo actualizado; auditoría goal — gates auto OK, T04 dev cerrado salvo T13/prod/revisiones."
    },
    {
      "ts": "2026-10-10T01:15:00-03:00",
      "texto": "T25/T04: nota tablero al día; eventos-sesion.md anota acumulación audio; TestOpusVariasTramasAntesFinTurno."
    },
    {
      "ts": "2026-10-10T01:05:00-03:00",
      "texto": "T04: acumularAudioTrama (PCM/Opus multi-trama hasta flag fin); TestPCMVariasTramasAntesFinTurno."
    },
    {
      "ts": "2026-10-10T01:00:00-03:00",
      "texto": "T41: TestVersionEsLaDelContrato lee VERSION de contracts/fuente/base.mjs; scripts/verificar-repo.ps1 (go+conductas+contrato)."
    },
    {
      "ts": "2026-10-10T00:55:00-03:00",
      "texto": "T41/T04: contracts/verificacion/referencias-prompts.mjs (Node=Go en 6 slugs); meta.verificacion_repo en tablero; respaldo T06 alineado."
    },
    {
      "ts": "2026-10-10T00:50:00-03:00",
      "texto": "T04/T41: SesionDetalle.versiones.prompt usa MaterialTurno (paisajismo si última salida LLM); test panel ejemplo 05."
    },
    {
      "ts": "2026-10-10T00:45:00-03:00",
      "texto": "T04a: TestRespuestasModeloPostgres (Anexar/Listar, turno duplicado, aislamiento tenant); verificación conductas 0 + vectores 506 ok."
    },
    {
      "ts": "2026-10-10T00:40:00-03:00",
      "texto": "T04: trama Opus (0x02) con fin de turno usa STT falso como PCM; TestOpusFinTurnoConProveedoresFalsos; sin flag fin no llama proveedores."
    },
    {
      "ts": "2026-10-10T00:35:00-03:00",
      "texto": "T41: S4 ampliado en estado-de-congelamiento (paisajismo vs Oficio.schema); migrador ancla última 0014; turno TestDesdeTextoMaterialPaisajismoTrasUltimaSalida."
    },
    {
      "ts": "2026-10-10T00:30:00-03:00",
      "texto": "T04: TestTextoTurnoMaterialPaisajismoEnSegundoTurno (WS E2E); TestDetalleCotizacionPanelPaisajismoS4 (panel + ejemplo 05)."
    },
    {
      "ts": "2026-10-10T00:15:00-03:00",
      "texto": "T41/T04: referenciaPrompt (Node) = ReferenciaContrato (Go) en 5 oficios enum; paisajismo T06 vía referenciaPorSlug + referencias-prompts (6 slugs), no en dominio.Oficio."
    },
    {
      "ts": "2026-10-10T00:25:00-03:00",
      "texto": "T06/T41 S4: MapaDatosExtraidos normaliza paisajismo→jardineria (ej. 05); MaterialTurno + WS usa paisajismo.md cuando la última salida LLM lo clasifica; tests material + ejemplo 05."
    },
    {
      "ts": "2026-10-10T00:10:00-03:00",
      "texto": "T04: TestTextoTurnoPersisteRespuestaModelo (WS→ListarRespuestasModeloDeSesion); TestOpusFinTurnoNoDisparaSTT; go test ./... + contrato 506 ok + conductas 0 fallas."
    },
    {
      "ts": "2026-10-10T00:05:00-03:00",
      "texto": "respaldo-tablero alineado con T04/T06/T41; verificación go test + conductas 0 fallas."
    },
    {
      "ts": "2026-10-10T00:00:00-03:00",
      "texto": "T04: MapaDatosExtraidos (LLM → contrato) en panel; test ejemplo 01 conductas."
    },
    {
      "ts": "2026-10-09T23:55:00-03:00",
      "texto": "T04: vc.respuestas_modelo (0014); turno WS AnexarRespuestaModelo; panel devuelve respuestas_modelo en SesionDetalle."
    },
    {
      "ts": "2026-10-09T23:50:00-03:00",
      "texto": "T04: GET panel cotizaciones/{sesion_id} (SesionDetalle, versiones, R69); TestDetalleCotizacionPanel."
    },
    {
      "ts": "2026-10-09T23:45:00-03:00",
      "texto": "T41/T09: fuente/prompts.mjs alinea contrato con backend; validar+vectores 506 ok; Lovable npm run contrato regeneró openapi.d.ts."
    },
    {
      "ts": "2026-10-09T23:40:00-03:00",
      "texto": "T41/T04: ReferenciaContrato conducta_{oficio}@sha256(12) del markdown T06; documentada divergencia con vectores sintéticos del contrato."
    },
    {
      "ts": "2026-10-09T23:35:00-03:00",
      "texto": "T04/T25: sesión persiste avatar_id (migr. 0013); OficioDelTurno elige prompt por avatar u oficios del asesor."
    },
    {
      "ts": "2026-10-09T23:30:00-03:00",
      "texto": "T25: PedidoExtraccion.CuerpoPrompt carga conductas/prompts por oficio del asesor; tests prompts + turno."
    },
    {
      "ts": "2026-10-09T23:25:00-03:00",
      "texto": "T25: internal/prompts (prompts.1 + esquema 1.0) en turno LLM; respaldo-tablero T04 alineado con WS y 0.1.4-borrador."
    },
    {
      "ts": "2026-10-09T23:20:00-03:00",
      "texto": "T04/T25: trama audio PCM16 con flag fin de turno → Transcriptor falso → mismo turno que texto.enviar; ejecutarTurnoConTexto compartido; go test ./... verde."
    },
    {
      "ts": "2026-10-09T23:15:00-03:00",
      "texto": "WS cotizacion.emitida con cotización+derivación tras emitir; T06 re-verificado (0 fallas); respaldo-tablero alineado."
    },
    {
      "ts": "2026-10-09T23:10:00-03:00",
      "texto": "T25: cotizador Go en turno de texto; GuardarCotizacion cuando emitir_presupuesto; arranque.AbrirCotizador; test TestTextoTurnoGuardaCotizacion."
    },
    {
      "ts": "2026-10-12T15:35:00-03:00",
      "texto": "verificar-repo.ps1 verde (arquitectura cmd/medir-gemini); verificar-corte-local.ps1 nuevo; rama feat/T26-T44-motor-panel-local lista para commit."
    },
    {
      "ts": "2026-10-12T15:25:00-03:00",
      "texto": "T44 fase 2: TestPanelSemillaLocalListaSesionTrasCrear (sesión demo en listado+detalle); verificación cotizador+tarifas ok; goal activo — falta PR y checklist manual post-Gemini."
    },
    {
      "ts": "2026-10-12T15:15:00-03:00",
      "texto": "Goal dev: tablero meta (ruta_desarrollo_sugerida, corte_gratis 2026-10-12); T44 TestPanelSemillaLocalLoginListaVacia; pendiente PR y confirmación listado post-llamada."
    },
    {
      "ts": "2026-10-12T14:10:00-03:00",
      "texto": "T44 fase 0: semilla panel (contraseña + código recuperación); levantar-local panel dev:api; plan panel-backend-local.md (fases 1–3)."
    },
    {
      "ts": "2026-10-12T13:50:00-03:00",
      "texto": "Motor cotización (T26/ADR 0007): reglas en tarifas-2026.json motor_cotizacion; Go carga intérprete fija/umbral_m2/medio_altura; coherencia orientativa vs jornal UOCRA 2026. Personalización por capas diseñada, sin implementar overlay."
    },
    {
      "ts": "2026-10-09T23:05:00-03:00",
      "texto": "T25: pizarron.actualizado en turno de texto (campos anotados y faltantes, sin montos). Tests WS actualizados."
    },
    {
      "ts": "2026-10-09T23:00:00-03:00",
      "texto": "T04: paquete internal/turno; texto.enviar con falsos emite transcripción/avatar/visemas. T09: generador OpenAPI en Lovable. Tablero T04/T09 actualizado."
    },
    {
      "ts": "2026-10-09T22:55:00-03:00",
      "texto": "T09 desbloqueada: mapeo Lovable vs OpenAPI en docs/fe/mapeo-lovable-openapi.md. WS medios: ConsumirTokenMedios usa reloj del panel."
    },
    {
      "ts": "2026-10-09T22:45:00-03:00",
      "texto": "Cursor: backend go test ./... verde; fix cierre de sesión con reloj del panel; tablero alineado en T04/T06/T41."
    },
    {
      "ts": "2026-10-09T10:05:00-03:00",
      "texto": "Se sacó la marca rehacer de las tareas ya hechas: T01, T02, T14, T15, T19, T20, T24, T31, T32."
    },
    {
      "ts": "2026-10-09T09:50:00-03:00",
      "texto": "El tablero dejó el artifact de Claude y pasó a docs/tablero/datos.js. Cursor y Claude editan ese archivo; index.html solo lo muestra."
    },
    {
      "ts": "2026-10-08T18:00:00-03:00",
      "texto": "El código que parecía perdido volvió a aparecer y se respaldó. Las notas actualizadas quedaron en docs/respaldo-tablero.md."
    },
    {
      "ts": "2026-10-08T12:00:00-03:00",
      "texto": "El entorno de Claude se reinició. Las tareas cuyo entregable eran archivos quedaron marcadas para rehacer, con la nota conservada."
    }
  ]
};
