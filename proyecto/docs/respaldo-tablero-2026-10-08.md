# Respaldo del tablero VideoCotización (2026-10-08)

Decisiones y notas de cada tarea. En las marcadas REHACER, los archivos (contrato, ADR, código, documentos) se perdieron al reiniciarse el entorno de trabajo; lo que sigue es lo único que sobrevive.

## T01 · Registrar ADRs: backend Go modular, pipeline de voz (transporte, transcripción, LLM, voz, visemas), proveedores, persistencia, multi-cliente y flujo de datos con qué se graba
- Agente: arq · estado antes del incidente: hecha · REHACER
- Nota: 5 ADR + índice en docs/adr, todos como Propuesto. Verificado: 6 secciones por ADR y sin precios inventados. Los acepta T24. Pendiente de Rober: avatar en navegador o en la VM (P1).

## T02 · Definir contratos: OpenAPI (autenticación, consentimiento, ARCO, errores, versionado) y eventos de sesión con visemas, con el JSON Schema de salida de cotización
- Agente: arq · estado antes del incidente: hecha · REHACER
- Nota: Solo el OpenAPI es candidato a 1.0.0 (contracts/estado-de-congelamiento.md). Los eventos de sesión quedan como borrador hasta que Rober responda P1 y se pruebe el token en navegadores reales.

## T03 · Esqueleto del backend Go (sesión, cotización, clientes) con healthcheck y configuración
- Agente: go · estado antes del incidente: en_revision · REHACER
- Nota: Esqueleto en backend/: compila, vet y tests con -race pasan. Revisado por T20: sin hallazgos altos, 5 correcciones obligatorias para el primer paso de T04. No probado: imagen Docker ni PostgreSQL.

## T04 · Endpoints de sesión y cotización contra el contrato, con persistencia que nace con tenant_id y retención
- Agente: go · estado antes del incidente: en_curso · REHACER
- Nota: Parte a (T04a) hecha; faltan las rutas HTTP, el WebSocket y el login del panel (T04b), después de que arq cierre T41.

## T04a · Corregir H1–H5 de T20 y persistencia en PostgreSQL con RLS, migraciones y arranque seguro
- Agente: go · estado antes del incidente: en_revision · REHACER
- Nota: Verificado por mí contra PostgreSQL 16 real: gofmt limpio, go vet, go test -race verde (almacén memoria y postgres). Sin probar: TLS contra la base, imagen Docker y compose. Falta revisión de un modelo distinto (Sonnet).

## T05 · Conductas por tipo de cliente y trabajo, y JSON Schema de salida del LLM (el LLM extrae datos, no calcula precios)
- Agente: cot · estado antes del incidente: en_revision · REHACER
- Nota: Esquema de salida del LLM + conductas + 8 ejemplos y 8 negativos: validador en 0 fallas (lo corrí yo). Cambia 2 valores de siguiente_paso respecto del ADR 0002: arq y seg deben verlos. Faltan datos de un técnico real (10 preguntas en validacion-enums.md) y el visto de Rober a los enums.

## T06 · Reglas de plazo largo y prompts por oficio, con minimización de datos y defensa contra inyección de prompts
- Agente: cot · estado antes del incidente: pendiente

## T07 · Spike de avatar 3D en el navegador con visemas desde un audio de prueba, para validar el ADR antes de fijarlo y definir la interfaz del componente
- Agente: av · estado antes del incidente: en_revision · REHACER
- Nota: Spike descartable en avatar-spike. Verificado de nuevo: 95 pruebas pasan y tsc sin errores. NUNCA corrió en un navegador: no hay fps ni sincronía medidos. Falta revisión de otro agente. Supone avatar en el navegador (P1 sin confirmar).

## T08 · Medir el avatar en equipos modestos y decidir si sigue en el navegador o pasa a alternativa 2D
- Agente: qa · estado antes del incidente: bloqueada
- Nota: Hay que medir en dispositivos reales (la notebook de Rober, Android de gama baja y media, un iPhone viejo). El entorno de Claude no tiene navegador ni GPU. El protocolo de medición está en docs/avatar/spike-resultados.md.

## T09 · Mapear el front de Lovable contra el contrato, declarar supuestos y generar cliente tipado y mock del OpenAPI
- Agente: fe · estado antes del incidente: bloqueada
- Nota: Necesita acceso al código del front de Lovable (repositorio de GitHub o exportación). Sin eso no se puede mapear contra el contrato.

## T10 · Integrar sesión, consentimiento y avatar en el front, con reconexión
- Agente: fe · estado antes del incidente: pendiente
- Nota: av es coautor y el consultor es Opus 5.5.

## T11 · Docker Compose para correr backend y servicios en una misma VM, con base de datos, proxy con TLS y archivos estáticos del avatar
- Agente: ops · estado antes del incidente: en_revision · REHACER
- Nota: Compose, Caddyfile y scripts en infra/. NO se levantó ningún contenedor (no hay daemon de Docker en el entorno) ni se validó el Caddyfile. Lo que sí corrió: docker compose config y un chequeo de seguridad por servicio. Las etiquetas de imagen no están verificadas.

## T12 · CI con lint de OpenAPI, tests de contrato, lint y build de Go y del front, y escaneo de dependencias y secretos
- Agente: ops · estado antes del incidente: pendiente

## T13 · Arquitectura en nube y costo por minuto con los proveedores elegidos de LLM, transcripción y voz, con rangos y fuentes
- Agente: ops · estado antes del incidente: pendiente

## T14 · Matriz de cumplimiento Ley 25.326 en versión mínima para el contrato: consentimiento, finalidad, retención, derechos ARCO y transferencia internacional
- Agente: seg · estado antes del incidente: hecha · REHACER
- Nota: Matriz de 26 obligaciones en docs/seguridad. Cita solo los artículos de los que hay certeza; lo demás va como a validar con un abogado. Verificado: 3 archivos, 32 requisitos con su forma de verificación.

## T15 · Modelo de amenazas de la API vendible: autenticación de terceros, tenant_id, límites, aislamiento por cliente e inyección de prompts
- Agente: seg · estado antes del incidente: hecha · REHACER
- Nota: 34 amenazas con mitigación. Dejó 11 observaciones a los ADR; la O1 (consentimiento vs token de sesión) bloquea el contrato y la resuelve T02.

## T16 · Pruebas de contrato ejecutables derivadas del OpenAPI, incluida la separación entre clientes
- Agente: qa · estado antes del incidente: en_revision · REHACER
- Nota: 188 vectores con resultado esperado en 0 fallas (lo corrí yo), 11 pendientes donde el contrato no decide, más plan de aislamiento de 45 casos. Hallazgos N1 (cantidad con ruido de float), N3 y A-1..A-3 van a arq/T04. Aún sin servidor contra el que correr.

## T17 · Arnés de evaluación de conductas contra el LLM real: casos fijos, rúbrica y repeticiones, con resultados validados por técnicos
- Agente: qa · estado antes del incidente: pendiente

## T18 · Integración del flujo completo, aislamiento entre clientes, consentimiento y borrado, y el ejemplo de T23
- Agente: qa · estado antes del incidente: pendiente

## T19 · Fijar criterios de revisión y checklist de código limpio por stack
- Agente: rev · estado antes del incidente: hecha · REHACER
- Nota: Guía en docs/review/criterios.md: 48 ítems por stack, 12 errores amplios típicos y formato de informe. Verificado: 4 secciones.

## T20 · Revisión independiente del esqueleto Go
- Agente: rev · estado antes del incidente: hecha · REHACER
- Nota: Sin hallazgos altos. Sí se puede construir T04 sobre el esqueleto, corrigiendo antes H2 (conformidad de repositorios), H4 (producción no debe usar memoria ni falsos), H5 (catálogo de errores), H1 (Secreto) y H3 (rol dueño). Detalle en docs/review/T20-revision-esqueleto-go.md.

## T21 · Revisión final de la integración contra los ADR y el contrato, con la evidencia de las pruebas
- Agente: rev · estado antes del incidente: pendiente

## T22 · Documentación de la API pública generada desde el OpenAPI, con chequeo en CI de diferencias con el contrato
- Agente: doc · estado antes del incidente: pendiente
- Nota: Espera: conviene documentar cuando el OpenAPI pase a 1.0.0, para no reescribir la documentación.

## T23 · Guía de integración y ejemplo de página de un tercero, con claves de prueba
- Agente: doc · estado antes del incidente: pendiente

## T24 · Revisar ADRs y contrato antes de congelarlos, con un modelo distinto del autor y seg como co-revisor
- Agente: rev · estado antes del incidente: hecha · REHACER
- Nota: Tres informes en docs/review: Revisor, Seguridad y Pruebas dan APROBADA CON CAMBIOS. Bloquea congelar los eventos hasta que Rober responda P1. Pruebas (otro modelo) encontró un error real: una cotización fuera de zona no se podía emitir. Las correcciones van en T31.

## T25 · Orquestador de sesión: transcripción, LLM con prompts versionados, validación de salida, cálculo de precio en Go y eventos de voz y visemas
- Agente: go · estado antes del incidente: pendiente

## T26 · Tablas de precios por oficio y zona, validadas por técnicos reales
- Agente: cot · estado antes del incidente: en_revision · REHACER
- Nota: Tarifario 2026 provisorio en tarifas/: pintura 12 de 12 tareas, jardinería 10 de 15; reparaciones y limpieza sin cubrir. 13 fuentes, ninguna oficial de la costa. NO está validado por un profesional ni se puede activar en producción. Verificado por mí: el validador da 0 fallas. Lo reemplazan los presupuestos reales de los profesionales.

## T27 · Implementar consentimiento antes de abrir cámara y micrófono, retención con borrado automático y endpoints ARCO
- Agente: go · estado antes del incidente: pendiente

## T28 · Revisión de seguridad de lo implementado: autenticación, límites, secretos, inyección de prompts y cumplimiento
- Agente: seg · estado antes del incidente: pendiente

## T29 · Secretos, TLS y dominio, registros, copias de seguridad y entorno de staging, revisados por seg
- Agente: ops · estado antes del incidente: pendiente

## T30 · Modelo 3D propio con blendshapes de visemas, licencia, peso máximo y alternativa 2D
- Agente: av · estado antes del incidente: pendiente

## T31 · Corregir el contrato según las tres revisiones de T24
- Agente: arq · estado antes del incidente: hecha · REHACER
- Nota: Corrigió los hallazgos de las tres revisiones. Repetí la verificación yo: 31 esquemas, 379 ejemplos del OpenAPI y 37 casos negativos sin fallas, Redocly y Spectral limpios. Los eventos siguen sin congelar hasta que Rober responda P1.

## T32 · ADR 0006: video del cliente (fotogramas) y pizarrón, con los eventos nuevos del contrato
- Agente: arq · estado antes del incidente: hecha · REHACER
- Nota: ADR 0006 y eventos de cámara y pizarrón. Revisado por seg en T33 (13 hallazgos, ya integrados en T36). Contrato verificado por mí: 0 fallas.

## T33 · Revisar el ADR 0006; definir el esquema del asesor y su credencial; y qué se guarda de cada consulta (quién pidió, presupuesto, respuestas del modelo), con retención y consentimiento
- Agente: seg · estado antes del incidente: en_revision · REHACER
- Nota: 13 hallazgos (7 altos), 20 requisitos nuevos (R33 a R52) y 14 esquemas del asesor. Verificado por mí: los esquemas compilan y pasan sus ejemplos. Lo legal está marcado a validar con abogado. Espera tus respuestas Q1 a Q8.

## T34 · Panel del asesor en React: perfil, mis cotizaciones y registros
- Agente: fe · estado antes del incidente: en_revision · REHACER
- Nota: Panel en React revisado por rev (T34): sin hallazgos altos; accesibilidad medida con axe sin violaciones. Quedaron 5 correcciones y adaptarlo al contrato 0.1.2: tarea T38.

## T35 · Ajustar ADR 0006 y contrato: cámara obligatoria, derivación a WhatsApp, clave pública del widget, guardar consulta para el backoffice
- Agente: arq · estado antes del incidente: en_revision · REHACER
- Nota: Verificado por mí: validador y 193 vectores sin fallas.

## T36 · Integrar al contrato las rutas del panel, la sesión del asesor y los requisitos R33 a R52 (contrato 0.1.1)
- Agente: arq · estado antes del incidente: en_revision · REHACER
- Nota: Verificado por mí: contrato, lint y vectores en 0 fallas. Lo pendiente (R44, R49, rutas de claves de API) pasa a T04 por decisión de arq en T37.

## T37 · Cerrar los 7 huecos del contrato que dejó el panel: datos extraídos y ítems del presupuesto, secreto único de la clave del widget, enlace de WhatsApp en el panel, ejemplos contradictorios, leer una sesión por id, contacto del cliente y mensajes de error
- Agente: arq · estado antes del incidente: en_revision · REHACER
- Nota: Contrato 0.1.2-borrador. Entrada por enlace opaco de cada profesional en el front propio; avatares elegibles; desafío anti-bots; los 7 huecos del panel cerrados. Verificado por mí: 91 negativos y 245 vectores en 0 fallas, Redocly sin errores. Falta revisión de seg.

## T38 · Adaptar el panel al contrato 0.1.2 y corregir los hallazgos de rev (mock fuera del build, foco, sesión vencida, consumo en Mi cuenta, más pruebas)
- Agente: fe · estado antes del incidente: en_revision · REHACER
- Nota: Panel adaptado al contrato 0.1.2 y corregidos los hallazgos de rev. Verificado por mí: tsc sin errores, 94 pruebas verdes, build de producción sin el mock ni las credenciales de demo. 13 de 13 mutaciones detectadas. No probado contra backend real ni con lector de pantalla. Dejó 7 huecos menores de contrato (T39).

## T39 · Cerrar 7 huecos menores del contrato que dejó el panel: detalle de sesión sin código ni derivación, contacto_disponible solo en el listado, catálogo de textos, 401 ambiguo en reautenticación, consumo diario, texto para compartir, versión en la descripción
- Agente: arq · estado antes del incidente: en_revision · REHACER
- Nota: Contrato 0.1.3-borrador. Verificado por mí: validar 0 fallas (48 esquemas, 622 ejemplos, 99 negativos), vectores 254 ok/0 fallas, redocly válido, spectral sin errores. Falta revisión de otro modelo.

## T40 · Revisar el contrato 0.1.2: desafío anti-bots, enlace opaco del profesional, cuota dinámica y formulario de contacto
- Agente: seg · estado antes del incidente: en_revision · REHACER
- Nota: Hallazgos H14–H25, requisitos R53–R70. Veredicto: go puede empezar T04, pero crearSesion con la clave pública NO se abre al público hasta cumplir R53–R58, R60–R61 y R65–R67 (probados con proveedores falsos). Pendiente de Rober: gasto máximo mensual y abogado.

## T41 · Aplicar al contrato y a los ADR las condiciones de seguridad de T40: Origin por tenant, sin_voz_s y motivos de cierre, simultánea, contacto con aviso y consentimiento, claves públicas y desafío, registro de lecturas
- Agente: arq · estado antes del incidente: pendiente

## T42 · Adaptar el panel al contrato 0.1.3: SesionDetalle, contacto_disponible, catálogo de etiquetas, códigos 401, consumo diario
- Agente: fe · estado antes del incidente: pendiente

## T43 · Revisión independiente de T04a con un modelo distinto al que lo escribió (RLS, verificación del rol, migraciones, errores de PG)
- Agente: rev · estado antes del incidente: pendiente
