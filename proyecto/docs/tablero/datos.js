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
      "fecha": "2026-10-11T03:38",
      "rama": "T04-dev-local-semillalocal (PR pendiente merge Rober)",
      "entorno": "Windows; verificar-repo.ps1 con exit code si go test falla (LASTEXITCODE)",
      "postgres_prueba": "PG_PRUEBA_URL si está definida (tests postgres en corrida ~22 min)",
      "backend_go_test": "go test ./... ok (incl. arquitectura tras semillalocal)",
      "infra_compose_config": "docker compose config ok",
      "conductas_verificar": "0 fallas (12+20)",
      "contrato_validar": "0 fallas",
      "contrato_vectores": "506 ok",
      "contrato_referencias_prompts": "6 slugs; anclas LF y prueba CRLF=LF",
      "lovable_contrato_verificar": "openapi.d.ts ok",
      "no_probado": "redocly/spectral; docker build/up; cambios Lovable en working tree sin contrato:verificar en esta corrida",
      "script_local": "scripts/verificar-repo.ps1 · scripts/verificar-repo.sh"
    },
    "pendiente_goal": [
      "T13: medición de límites/latencia de Gemini; revisión independiente de T13/T25 (ya en main)",
      "T04a/T43: revisión independiente PostgreSQL/RLS",
      "T05/T06/T40/T41: revisiones cruzadas y visto Rober",
      "T11: levantar compose y validar imagen api (prompts+tarifas en distroless)"
    ],
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
      "nota": "Parte a (T04a) hecha. WS→turno→respuestas_modelo; MaterialTurno/S4. Dev local: SEMILLA_LOCAL + internal/semillalocal (G05), CORS loopback, dotenv, scripts/levantar-local.ps1. verificar-repo.ps1 ok (2026-10-11, main WIP sin PR). Falta T13 prod, revisión T04a/T43, docker build/up."
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
      "nota": "Esquema de salida del LLM + conductas + 8 ejemplos y 8 negativos: validador en 0 fallas (lo corrí yo). Cambia 2 valores de siguiente_paso respecto del ADR 0002: arq y seg deben verlos. Faltan datos de un técnico real (10 preguntas en validacion-enums.md) y el visto de Rober a los enums."
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
      "nota": "2026-10-10 (av, rama T07-avatar-en-front, SIN revisar: quien escribe no revisa). El motor del spike (Avatar3D + AvatarClips + visemas/clips) está copiado en real-time-quote-bot/src/lib/avatar-motor y enchufado detrás de AvatarPuerto: AvatarVivo hace 3d → ErrorSinWebGL → clips → placeholder 2D. Reloj: performance.now (speechSynthesis, sin AudioContext). Visemas del servidor pisan el respaldo desde texto. three@0.180.0. PROBADO: vitest AvatarVivo 6/6 (cascada y visemas pendientes); eslint de los archivos tocados 0; Chromium del IDE contra mock: data-avatar-modo=3d, canvas WebGL 533×354 (CSS 686×456), modelo procedural (casco + chaleco) visible en la llamada, saludo del asesor en el chat. NO PROBADO: E2E Playwright completo (47 checks) en esta rama; fps serio (rAF en pestaña de fondo dio 1); sync boca↔voz real; GLB T30; clips grabados; Firefox/Safari/móvil. T08 sigue midiendo en equipos reales. Falta revisión de otro agente."
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
      "nota": "Compose, Caddyfile y scripts en infra/. api.Dockerfile copia conductas/prompts y tarifas-2026.json (WORKDIR /). verificar-repo incluye docker compose config (sin levantar). docker build NO probado (daemon inactivo). Falta compose up y validar Caddyfile en runtime."
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
      "nota": "2026-10-10 (go): STT/TTS=navegador, LLM=gemini (gemini-3.5-flash-lite), WhatsApp=enlace. Mergeado a main. Cursor probó generateContent real con datos ficticios (3.5-flash-lite y 3.1-flash-lite OK). Doc docs/ia/gemini.md. Falta revisión independiente, costo por minuto y plan pago para clientes reales."
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
      "nota": "Tarifario 2026 provisorio en tarifas/: pintura 12 de 12 tareas, jardinería 10 de 15; reparaciones y limpieza sin cubrir. 13 fuentes, ninguna oficial de la costa. NO está validado por un profesional ni se puede activar en producción. Verificado por mí: el validador da 0 fallas. Lo reemplazan los presupuestos reales de los profesionales."
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
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
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
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    },
    {
      "id": "T43",
      "titulo": "Revisión independiente de T04a con un modelo distinto al que lo escribió (RLS, verificación del rol, migraciones, errores de PG)",
      "agente": "rev",
      "status": "pendiente",
      "rehacer": false,
      "nota": ""
    }
  ],
  "votes": [],
  "preguntas": [
    {
      "id": "P-dominio",
      "agente": "ops",
      "tarea": "T29",
      "abierta": true,
      "texto": "¿Tenés un dominio propio para el front? Si no, se arranca con el de Lovable."
    },
    {
      "id": "P-gasto",
      "agente": "ops",
      "tarea": "T13",
      "abierta": true,
      "texto": "¿Cuánto es lo máximo que aceptás gastar por mes en los servicios de IA?"
    },
    {
      "id": "P-pago-exterior",
      "agente": "ops",
      "abierta": true,
      "texto": "¿Cómo vas a pagar los servicios de IA del exterior?"
    },
    {
      "id": "P-tarifas",
      "agente": "cot",
      "tarea": "T26",
      "abierta": true,
      "texto": "¿Podés conseguir que un pintor y un jardinero de tu pueblo respondan las 10 preguntas de tarifas/README.md?",
      "ayuda": "Con eso se reemplaza el tarifario provisorio por precios reales."
    },
    {
      "id": "P-enums",
      "agente": "cot",
      "tarea": "T05",
      "abierta": true,
      "texto": "¿Das el visto a los enums de conductas de T05?"
    },
    {
      "id": "P-estilo",
      "agente": "fe",
      "tarea": "T34",
      "abierta": true,
      "texto": "¿Qué estilo querés para el panel del asesor?"
    },
    {
      "id": "P-abogado",
      "agente": "seg",
      "tarea": "T14",
      "abierta": true,
      "texto": "¿Hay un abogado para revisar los puntos de la Ley 25.326 marcados como a validar?"
    }
  ],
  "log": [
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
