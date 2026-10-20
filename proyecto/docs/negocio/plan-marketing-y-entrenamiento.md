# VideoCotización: plan de salida al mercado y de entrenamiento del asesor

Fecha: 2026-10-18. Autor: estrategia de producto (agente). Estado: **propuesta para Rober**, sin
validar con profesionales ni con abogado. Lo que es supuesto está marcado como supuesto.

Base de lo que se dice acá (leído en el repo, sin tocar código):
`proyecto/docs/BRIEF.md`, ADR 0002/0005/0006, `proyecto/docs/ia/gemini.md` (costo medido),
`proyecto/conductas/` (conductas, esquema, prompts por oficio, ejemplos, negativos,
`verificar.mjs`), `backend/internal/turno/texto.go`, `backend/internal/prompts/`,
`backend/internal/proveedores/gemini/`, `backend/internal/semillalocal/semilla.go`,
`proyecto/tarifas/tarifas-2026.json`, el tablero y `real-time-quote-bot/src/components/Portada.tsx`.

Tipo de cambio supuesto para todo el documento: **1 USD = 1.450 ARS**. Recalcular los ARS cada
mes (o cobrar en ARS indexado a una referencia en USD).

---

## Lo que encontré en el código y cambia la estrategia

Seis cosas del estado actual pesan más que cualquier idea de marketing. Conviene leerlas antes que
el plan:

1. **Rober ya tiene unos 100 profesionales** (BRIEF). El primer cliente no hay que salir a buscarlo:
   está en la agenda de Rober. Eso baja muchísimo el costo de adquisición del piloto.
2. **Las tarifas no están validadas.** `tarifas-2026.json` dice `"uso_en_produccion": false` y
   `"validado_por_profesional": {"pintor": false, "jardinero": false}`; los rangos salen de portales
   de CABA y Mar del Plata. Un presupuesto mal calibrado quema la confianza del profesional en la
   primera semana. Validar tarifas es **requisito del piloto**, no una mejora.
3. **Con la clave gratuita de Gemini no se puede atender clientes reales.** `docs/ia/gemini.md`
   lo explica: en el nivel gratuito Google usa los datos para mejorar sus productos y pueden leerlos
   revisores humanos. Antes del piloto con personas reales: plan pago y consulta al abogado.
4. **El modelo no ve la conversación.** En `turno/texto.go` + `gemini.go`, cada turno manda solo el
   prompt del oficio, el JSON validado del turno anterior y **el último mensaje del cliente**. No
   recibe lo que dijo el asesor antes ni lo que dijo el cliente hace dos turnos. Por eso las
   respuestas salen genéricas ("Buenísimo, te tomo el pedido…"): el modelo no tiene de qué
   agarrarse para sonar a una charla.
5. **El modelo no ve la cámara.** En `gemini.go`, `adjuntarFotogramas = false` (se apagó el
   2026-10-13 porque el modelo se saturaba con JPEG), y los logs de la prueba muestran
   `fotogramas_a_gemini=0` en todos los turnos. Hoy "mostrame la pared con la cámara" es teatro:
   el asesor pide ver algo que no mira. Hay que prenderlo o dejar de pedirlo.
6. **El caso de Tito tiene causa concreta.** El prompt `conductas/prompts/jardineria.md` no dice
   que el asesor se llama Tito, ni que solo hace jardinería, ni que Laura pinta. El esquema tampoco
   tiene una acción para "pasar a otro asesor" (las 8 acciones del ADR 0002 no la incluyen). Y en
   Go, `cotizador.Cotizar` no compara el oficio que devuelve el LLM con los oficios del asesor de
   la sesión: si la charla seguía, Tito podía terminar emitiendo un presupuesto de pintura que caía
   en su panel. Es un bug de producto, no solo de tono.

Hay dos más, menores: la latencia de la prueba fue de **4 a 12 segundos por turno** (logs del
backend, 18:02:42 → 18:02:54) y la portada promete "recibí el presupuesto al instante", que choca
con "presupuesto orientativo que confirma el profesional".

---

# Parte 1: cómo vender el producto

## 1. A quién se le vende primero

Criterios: dolor fuerte y frecuente, decisión rápida (una persona decide), poca integración
técnica, que nos dé conversaciones reales para entrenar, y que podamos atender en la zona (Mar
Chiquita, Cobo, Santa Clara del Mar, Parque Lago, Mar del Plata).

| Segmento | Dolor | Quién decide y cuánto tarda | Qué necesita del producto | Riesgo | Puntaje |
|---|---|---|---|---|---|
| **Profesionales independientes** (pintor, jardinero, techista) | Pierden 1 a 3 tardes por semana yendo a presupuestar trabajos que no se cierran; contestan WhatsApp mientras trabajan | Él mismo, en una charla | Enlace propio, sus tarifas, WhatsApp | Precio bajo, churn alto si no ve trabajos | **Alto** (y ya están en la red de Rober) |
| **Empresas chicas de mantenimiento y pintura** (3 a 20 personas) | Un coordinador presupuesta todo el día; los leads de Instagram/Google se enfrían | Dueño; 2 a 4 semanas | Varios asesores, panel, reportes, su marca | Exigen precisión y personalizar tarifas | **Alto** |
| Administraciones de consorcios | Tienen que pedir 3 presupuestos por cada arreglo de espacios comunes | Administrador; 1 a 3 meses, pasa por asamblea | Orden de trabajo formal, comparativa, factura | Ciclo largo; el que filma es el encargado | Medio, segunda ola |
| Corralones y pinturerías | El cliente pregunta "¿me recomendás un pintor?" y no tienen a quién mandarlo; quieren vender más litros | Dueño o gerente comercial; 2 a 6 semanas | Widget en su web o QR en el mostrador, derivación a pintores de confianza | No pagan mucho; valoran el lead y la venta de materiales | **Alto como canal**, medio como cliente pago |
| Aseguradoras con asistencia al hogar | Mandan un técnico para cada siniestro chico; costo de inspección alto | Gerencia de siniestros + compras + legales; 6 a 12 meses | API, SLA, auditoría, datos en la región, integración | Ciclo muy largo, exigencia legal alta, piden precisión pericial | Bajo ahora, alto en 2027 |
| Marketplaces de servicios (Mercado Libre Servicios, Workana local, apps de oficios) | Los presupuestos tardan y el usuario abandona | Producto/BD; 3 a 9 meses | API white label, volumen, multi-oficio | Nos pueden copiar; nos piden exclusividad | Bajo ahora |

**Elección: empezar con dos.**

1. **Profesionales independientes de la red de Rober (pintura y jardinería) en la costa.** Ya hay
   relación, el dolor es claro, decide uno solo y cada llamada que atienden nos da datos reales
   para entrenar al asesor. Es el segmento que valida las tarifas: sin un pintor y un jardinero que
   digan "sí, eso cobro yo", no hay producto.
2. **Pinturerías y corralones de la zona, como canal y no como cliente pago.** No hace falta
   cobrarles al principio: ponen un QR en el mostrador ("¿Querés saber cuánto sale la mano de obra?
   Cotizalo por video") y derivan a pintores de la red. Nos traen demanda de clientes finales para
   los profesionales del segmento 1, que es justamente lo que el independiente quiere pagar.

Las empresas chicas de mantenimiento entran en el mes 3, cuando el panel multi-asesor esté
probado. Consorcios en el mes 4 a 6. Aseguradoras y marketplaces cuando la API vendible (ADR 0005)
tenga revisión de seguridad hecha (T28) y datos de precisión del piloto para mostrar.

Momento: estamos a fines de octubre. **Noviembre y diciembre son pretemporada en la costa**:
casas de fin de semana que hay que pintar, pasto y cercos que hay que dejar listos antes de
enero. Es el mejor momento del año para salir con pintura y jardinería. Si el piloto arranca en
enero, llega tarde.

## 2. Propuesta de valor por segmento

| Segmento | Propuesta de valor (una frase) | Problema concreto que resuelve |
|---|---|---|
| Profesional independiente | **"Tu asesor cotiza por video mientras vos trabajás, y solo vas a ver los trabajos que ya tienen número."** | Visitas para presupuestar que no se cierran (una tarde perdida cada una), WhatsApps sin contestar mientras está en la escalera, clientes que piden precio y desaparecen. |
| Empresa de mantenimiento y pintura | **"Cada consulta que entra sale con un presupuesto orientativo en minutos, con tu marca y tus tarifas, sin sumar un coordinador."** | Cuello de botella en quien presupuesta; leads de Ads/Instagram que se enfrían en horas; presupuestos distintos según quién los arma. |
| Administración de consorcios | **"El encargado filma el problema y en el día tenés presupuesto de mano de obra para llevar a la asamblea."** | Coordinar visitas de 3 proveedores para cada arreglo; demoras de semanas. |
| Pinturería / corralón | **"Cuando el cliente pregunta por un pintor, le das presupuesto de mano de obra al instante y te llevás la venta de la pintura."** | El cliente se va a pensar y compra en otro lado; no tienen red de pintores confiable para recomendar. |
| Aseguradora | **"Validá siniestros chicos del hogar por video y evitá la mitad de las inspecciones presenciales."** | Costo por inspección y tiempo de resolución. |
| Marketplace | **"Presupuesto de oficio en la misma visita, sin esperar a que conteste el profesional."** | Abandono entre "pedí presupuesto" y "me contestaron". |

## 3. Modelo de precios

### El costo, primero

Medido en `docs/ia/gemini.md` (plan pago Standard, precios del 2026-10-12):

- LLM: unos **0,0012 a 0,0016 USD por turno**. Una cotización corta (4 turnos, 3 minutos) sale
  **~0,007 USD**. Con historial de conversación (recomendado en la Parte 2) sube a ~0,01 USD.
- Transcripción en el servidor (el plan del micrófono abierto, `transcriptor.go`): audio a Gemini,
  supuesto ~0,002 a 0,005 USD por llamada. **Verificar** el precio de entrada de audio del modelo
  vigente.
- Voz: hoy 0 USD (voz del navegador). Con TTS de proveedor (ver Parte 2, etapa 5): **0,02 a 0,20
  USD por llamada** según proveedor.
- Infra fija (Render + Vercel + Postgres): unos 30 a 100 USD por mes al principio.

Conclusión: **una cotización completa cuesta entre 0,02 y 0,25 USD**. El costo marginal no limita
el precio; lo limita lo que vale para cada segmento. Igual hay que poner topes por plan (ya
existen en ADR 0005: simultáneas y minutos por mes) para que un bot o un cliente intenso no
dispare la factura.

### Planes propuestos

| Plan | Para quién | Precio mensual (ARS / USD) | Incluye | Lógica |
|---|---|---|---|---|
| **Gratis (piloto)** | Profesional independiente, primeros 30 | 0 durante 60 días | 1 asesor, 1 oficio, hasta 20 cotizaciones/mes, marca VideoCotización | Activación y datos. Al día 45 se habla de pasar a pago. |
| **Oficio** | Independiente | **ARS 18.000 a 25.000 / USD 12 a 17** | 1 asesor, 1 a 2 oficios, 60 cotizaciones/mes, su enlace y QR, panel | Equivale a menos que una tarde de trabajo. Si le ahorra 2 visitas al mes, se paga. |
| **Oficio Pro** | Independiente con volumen o con ayudante | **ARS 40.000 a 55.000 / USD 28 a 38** | 2 asesores, todos los oficios, 200 cotizaciones/mes, tarifas propias, reportes | Para el que ya cerró trabajos con el producto. |
| **Equipo** | Empresa chica de mantenimiento/pintura | **ARS 120.000 a 290.000 / USD 80 a 200** | Hasta 10 asesores, su marca en el widget, 500 cotizaciones/mes, excedente a USD 0,40 | Reemplaza parte del tiempo de un coordinador (que cuesta 15 a 30 veces eso). |
| **Canal (pinturería / corralón)** | Comercio | 0 a ARS 60.000 / USD 0 a 40 | QR y widget con su marca, derivación a la red de pintores, reporte de consultas | Al principio gratis a cambio de exhibición. Después, cobro chico o comisión por lead que derivan. |
| **API / white label** | Aseguradora, marketplace | Setup **USD 3.000 a 10.000** + **USD 0,80 a 2,50 por cotización completa**, mínimo mensual USD 500 | Multi-tenant (ADR 0005), SLA, su marca, sus tarifas | Se cobra por resultado; el margen es alto y cubre soporte e integración. |

### Por qué no cobrar por lead desde el día 1

El cobro por lead (por ejemplo ARS 2.000 a 5.000 por cotización completa con clic a WhatsApp)
alinea muy bien con el profesional, pero exige que **nosotros** traigamos la demanda. En el piloto
el profesional comparte su propio enlace: si le cobrás por un lead que trajo él, se siente
estafado. Recomendación:

- **Suscripción** cuando el profesional usa su propio enlace (sus clientes, su WhatsApp, su
  Instagram).
- **Pago por lead** solo para la demanda que traemos nosotros (Ads, pinturerías, Mercado Libre):
  ARS 2.500 a 6.000 por lead calificado (cotización completa + clic a WhatsApp). Comparar con lo
  que hoy le cuesta un lead en Google Ads local (supuesto: ARS 3.000 a 10.000 para "pintor mar
  del plata"; medirlo en la semana 5).
- **Freemium** solo como piloto con fecha de corte, no como plan eterno: el plan gratis eterno en
  un segmento con churn alto llena el panel de cuentas muertas que igual cuestan soporte.

Precios de lanzamiento: **"precio de fundador" fijo por 12 meses** para los primeros 30 que pasen a
pago. En un país con inflación, congelar el precio es un argumento de venta fuerte; se puede
congelar en USD de referencia y facturar en ARS.

## 4. Canales y adquisición: los primeros 90 días

Supuesto: arranca el lunes 2026-10-20. Equipo: Rober + una persona part-time para contenido y
seguimiento. Presupuesto de medios total: USD 600 a 1.200 en 90 días.

**Condiciones para salir con clientes reales (semanas 1 y 2):** plan pago de Gemini, consentimiento
antes de cámara y micrófono funcionando de verdad (T27), tarifas validadas por al menos un pintor y
un jardinero, y el arreglo de derivación del caso Tito. Sin eso, se graba y se muestra, pero no se
atiende a gente real.

| Semana | Objetivo | Acciones concretas | Entregable / meta |
|---|---|---|---|
| **1** (20-26 oct) | Dejar el producto en condición de piloto | Pasar Gemini a plan pago y poner alerta de gasto. Arreglar derivación entre asesores y pasar historial al modelo (Parte 2, etapa 1). Sentarse con 2 pintores y 2 jardineros de la red con `tarifas-2026.json` impreso y corregir los rangos. Consulta con abogado: consentimiento, presupuesto orientativo, transferencia internacional. | Tarifas v1 validadas por 4 profesionales. Turno con historial en producción. |
| **2** (27 oct-2 nov) | Elegir los primeros 10 | Rober llama a 25 profesionales de su red; elegir 10 (5 pintores, 5 jardineros) que usen WhatsApp Business y tengan demanda. Crear su asesor con su nombre y sus tarifas. Grabar 6 demos reales de 60 s (pared con humedad, fachada, pasto alto, cerco, poda, reja) con actores o con conocidos. | 10 profesionales con enlace propio. 6 videos editados. |
| **3** (3-9 nov) | Activar a los 10 | Onboarding presencial de 30 min con cada uno: mensaje de WhatsApp listo para pegar ("Para presupuestarte rápido, hacé la videollamada acá: [enlace]"), respuesta automática de WhatsApp Business con el enlace, estado de WhatsApp con el video demo. Grupo de WhatsApp de pilotos para feedback diario. | 10 de 10 con el enlace en su respuesta automática. Meta: 30 cotizaciones completas en la semana. |
| **4** (10-16 nov) | Aprender rápido | Llamar a cada profesional: ¿qué cotizaciones fueron basura?, ¿cuál se cerró?, ¿el número estaba bien? Escuchar 20 conversaciones (con consentimiento) y etiquetarlas (Parte 2, etapa 4). Corregir prompts y tarifas. Publicar 3 videos en Instagram y TikTok de Rober / de la marca. | Primer informe de precisión (presupuesto vs precio real). Lista de 10 fallas del asesor. |
| **5** (17-23 nov) | Primer canal comercial | Visitar 8 pinturerías y 4 corralones de Mar del Plata, Santa Clara y Mar Chiquita. Propuesta: QR en el mostrador y en la factura, derivado a pintores de la red, gratis por 3 meses, con reporte mensual de consultas. Encender Google Ads local con USD 150 ("pintor santa clara del mar", "presupuesto pintura casa mar chiquita", "corte de pasto cobo") apuntando a una landing por oficio. | 3 comercios con QR. Costo por cotización completa desde Ads medido. |
| **6** (24-30 nov) | Ampliar a 20 profesionales | Sumar 10 más de la red, ahora con testimonio en video de uno de los primeros ("me ahorré tres visitas esta semana"). Reels de "antes / después" del trabajo cotizado por video. | 20 profesionales activos. Meta: 100 cotizaciones completas acumuladas. |
| **7** (1-7 dic) | Gremio y comunidad | Contactar a la cámara o agrupación de pintores y jardineros de la zona (si no hay, el grupo de Facebook o WhatsApp más grande de oficios de Mar del Plata). Ofrecer una charla de 20 minutos "cómo presupuestar sin perder tardes". Publicar en grupos de Facebook de vecinos de Santa Clara, Mar Chiquita y Parque Lago (con permiso de los admins) el enlace de un profesional real, no el de la marca. | 1 charla dada. 15 interesados nuevos. |
| **8** (8-14 dic) | Pasar de gratis a pago | A los profesionales con ≥ 8 cotizaciones completas: ofrecer plan Oficio con precio de fundador congelado 12 meses. A los que no usaron: entender por qué y apagar su cuenta si no hay interés. | Meta: 8 profesionales pagos. |
| **9** (15-21 dic) | Mercado Libre y demanda propia | Publicar los servicios de 3 a 5 profesionales en Mercado Libre Servicios (pintura y jardinería, zona costa) con "presupuesto por videollamada en 3 minutos" y el enlace en la descripción o en la respuesta a preguntas (revisar las reglas de ML sobre enlaces externos antes). Probar Meta Ads con USD 150 a dueños de casas de fin de semana (ubicación CABA y Mar del Plata, interés en Mar Chiquita / Santa Clara). | Costo por cotización de cada canal. |
| **10** (22-28 dic) | Temporada alta | Contenido de urgencia de temporada: "¿llegás con la casa lista para enero?". Doblar el presupuesto en el canal que mejor dio (Ads o Meta). Revisar precisión del asesor con las conversaciones etiquetadas. | 250 cotizaciones completas acumuladas. |
| **11** (29 dic-4 ene) | Empresas chicas | Armar el caso con números del piloto (visitas evitadas, cotizaciones, trabajos cerrados). Contactar 15 empresas de mantenimiento y pintura de Mar del Plata (Google Maps + Instagram). Ofrecer piloto Equipo de 30 días. | 5 reuniones agendadas. |
| **12** (5-11 ene) | Primer cliente Equipo | Piloto con 1 a 2 empresas. Probar el panel multi-asesor con su gente. | 1 empresa en piloto. |
| **13** (12-18 ene) | Decidir | Revisión con métricas (sección 6): ¿seguimos con independientes, giramos a empresas, o a canal pinturerías? Definir precios definitivos y el plan del trimestre. | Documento de decisión para Rober. |

Canales que **no** recomiendo en los primeros 90 días: aseguradoras y marketplaces (ciclo de
venta más largo que el piloto), influencers genéricos de "hogar" (audiencia fuera de la zona) y
cualquier campaña nacional (no podemos atender fuera de la costa).

## 5. Mensaje y posicionamiento

**Posicionamiento:** VideoCotización no es "un robot que cotiza". Es **el asistente del
profesional**: atiende la primera consulta por video, toma los datos con la cámara y deja un
presupuesto orientativo de mano de obra, que el profesional confirma. El protagonista es el
profesional, no la IA.

Hay dos landings, porque hay dos lectores:

### Landing para clientes finales (la portada actual)

- Titular propuesto: **"Mostrá el trabajo con el celu y tené un presupuesto orientativo en 3
  minutos."**
- Bajada: "Hablás por video con el asistente de un profesional de la zona. Le mostrás la pared, el
  jardín o el arreglo, y te deja el presupuesto de mano de obra. El profesional lo confirma por
  WhatsApp."
- Cambio puntual: la portada dice "recibí el presupuesto al instante". Cambiar "al instante" por
  "en unos minutos" y agregar "orientativo": promete menos y evita el reclamo cuando el profesional
  ajusta el número.

### Landing para profesionales (no existe todavía)

Titular: **"Dejá de perder tardes presupuestando."**

Tres variantes de copy para probar (en Ads y en el mensaje de WhatsApp de Rober):

1. **Tiempo:** "Cada visita para presupuestar te cuesta una tarde. Con VideoCotización, tu cliente
   te muestra el trabajo por video, recibe un presupuesto orientativo con tus precios, y vos vas
   solo a los trabajos que ya tienen número."
2. **Leads que se enfrían:** "El cliente que te escribe a las nueve de la noche quiere un precio ya.
   Tu asistente lo atiende en ese momento, le toma las medidas por video y te deja el contacto
   listo en WhatsApp a la mañana."
3. **Imagen profesional:** "Presupuestos claros, con tu nombre y tus tarifas, en minutos. Tus
   clientes van a pensar que tenés una oficina atrás. Tenés un asistente."

### La desconfianza ("¿un robot me cotiza?")

- **Decirlo de entrada, sin vueltas.** Primer turno del asesor: "Hola, soy Tito, el asistente de
  [Nombre del profesional]. Soy un asistente automático: te tomo los datos y te dejo un precio
  orientativo, y [Nombre] te lo confirma." Ocultarlo es peor: la gente se da cuenta y se siente
  engañada.
- **El profesional es real y aparece.** Foto y nombre del profesional en la pantalla de inicio y
  en el presupuesto. El avatar es "su asistente", no un reemplazo.
- **El precio es un rango que confirma una persona.** "Orientativo, solo mano de obra, lo confirma
  el profesional cuando lo ve" en voz y en pantalla.
- **Salida humana siempre a mano.** El botón de WhatsApp tiene que estar visible desde el primer
  minuto, no solo al final.
- **Del lado del profesional:** el miedo es "me va a regalar el trabajo con un precio bajo". La
  respuesta es que el número sale de **sus** tarifas, que Go calcula y el modelo nunca toca (ADR
  0002, ya implementado), y que él ve cada cotización en el panel antes de contestar.

### Lo legal (a validar con abogado)

- **Consentimiento de cámara y micrófono antes de abrirlos**, explícito, con finalidad ("para
  tomar los datos del trabajo"), y aviso de que no se graban ni se guardan imágenes ni audio
  (BRIEF, decisión 3). Está diseñado (T10/T27); T27 sigue pendiente en el tablero.
- **Transferencia internacional:** el texto y las imágenes van a Google. Mencionarlo en la
  política de privacidad (Ley 25.326) y usar el plan pago.
- **Presupuesto orientativo:** leyenda fija en el presupuesto: "Presupuesto orientativo de mano de
  obra, sin materiales, calculado con los datos de la videollamada. No es una oferta vinculante:
  el profesional lo confirma después de ver el trabajo. Validez: X días." Preguntar al abogado si
  aplica el artículo 21 de la Ley 24.240 (presupuesto en servicios) y qué hace falta para que
  quede claro que no es el presupuesto formal.
- **Personas en cámara:** el asesor no describe personas, solo superficies y plantas (ya está en
  las conductas). Mantenerlo.
- **Uso de conversaciones para mejorar el asistente:** consentimiento aparte, opcional (Parte 2,
  etapa 4).

## 6. Métricas y metas del piloto

Piloto: 20 profesionales, 8 semanas (semanas 3 a 10).

| Métrica | Definición | Meta piloto | Dónde se mide |
|---|---|---|---|
| Activación | Profesional con ≥ 3 cotizaciones completas en sus primeros 14 días | ≥ 60 % | Panel (cotizaciones por asesor) |
| Llamadas completadas | Llamadas que terminan en presupuesto o derivación útil / llamadas iniciadas | ≥ 55 % | Backend (motivo de cierre) |
| Abandono por permisos | Sesiones que no pasan el consentimiento o la cámara | ≤ 25 % | Front (sin_consentimiento, sin_camara) |
| Cotizaciones por profesional | Completas por mes, por profesional activo | ≥ 15 | Panel |
| Clic a WhatsApp | Presupuestos con clic al botón de WhatsApp | ≥ 40 % | Front / enlace con código |
| Cotización → trabajo | Trabajos cerrados / cotizaciones completas (lo reporta el profesional) | ≥ 15 % (meta deseada 25 %) | Formulario de 1 clic en el panel |
| Precisión | Presupuesto orientativo dentro de ±25 % del precio final | ≥ 70 % de los trabajos cerrados | Etiquetado del profesional |
| Visitas evitadas | Visitas de presupuesto que el profesional dice que se ahorró | ≥ 4 por profesional por mes | Encuesta semanal de 2 preguntas |
| Errores de derivación | Cotizaciones con oficio que no es del asesor | 0 | Backend (regla nueva) y evaluaciones |
| Latencia | Segundos desde que el cliente termina de hablar hasta que el asesor empieza | p50 ≤ 3 s, p90 ≤ 6 s | Backend (medir) |
| Costo por cotización | LLM + voz + transcripción | ≤ 0,10 USD | Consumo del proveedor |
| CAC | Gasto de adquisición / profesionales pagos nuevos | ≤ USD 30 (independiente) | Planilla |
| Conversión a pago | Profesionales pagos / activos al día 60 | ≥ 40 % | Facturación |
| Churn | Bajas mensuales de pagos | ≤ 8 % mensual | Facturación |

La métrica que manda en el piloto es **cotización → trabajo**, con precisión. Si el profesional
cierra trabajos con lo que le trae el asesor, todo lo demás se arregla. Si no cierra, ningún
copy lo salva.

## 7. Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Tarifas mal calibradas → presupuestos que el profesional no respeta | Alta | Alto | Validar con 4 profesionales antes del piloto; cada profesional carga o ajusta las suyas; mostrar rango, no número único; revisar precisión cada 2 semanas. |
| Usar el nivel gratuito de Gemini con clientes reales | Media | Alto (legal y reputación) | Plan pago antes del piloto; alerta de gasto; ver `docs/ia/gemini.md`. |
| El asesor cotiza fuera de su oficio (caso Tito) | Alta hoy | Alto | Regla en Go (no cotizar oficios que el asesor no tiene) + prompt con el plantel + evaluación automática que bloquea el cambio si falla. |
| "¿Un robot?": desconfianza del cliente final | Media | Medio | Decirlo de entrada, profesional real visible, WhatsApp siempre a mano. |
| Fricción de cámara y micrófono en celulares (permisos, gama baja, "Tocá para hablar") | Alta | Alto | Botón "Probar cámara y micrófono" (ya existe), micrófono abierto con transcripción en el servidor, alternativa de escribir por texto, T08 (equipos modestos) desbloqueado. |
| Latencia de 4 a 12 s por turno: la charla se siente rota | Alta | Alto | Respuestas más cortas, historial chico, frase de relleno inmediata, TTS por streaming, medir p50/p90 (Parte 2, etapa 5). |
| Inflación desactualiza tarifas en ARS | Alta | Medio | Tarifas con fecha y ajuste mensual por índice; recordatorio en el panel "tus tarifas tienen 45 días". |
| Abuso de costos (bots, curiosos) | Media | Medio | Ya hay desafío anti-bots, cuota por tenant y topes (ADR 0005/0006). Mantener alerta de gasto. |
| Dependencia de un proveedor de LLM (Gemini saturado, como el 2026-10-13) | Media | Medio | Puerto `proveedores.Extractor` (ADR 0003): segundo adaptador listo y elegido con las evaluaciones. |
| Profesional que no contesta el WhatsApp después del presupuesto | Media | Alto (el cliente culpa a la marca) | SLA mínimo en el acuerdo de piloto; recordatorio al profesional; reasignar a otro de la red si no contesta en 24 h (fase 2). |
| Estacionalidad: en invierno cae la demanda en la costa | Alta | Medio | Sumar mantenimiento y reparaciones para marzo; mirar Mar del Plata urbana. |
| Reclamo legal por presupuesto "no respetado" | Baja | Alto | Leyenda de orientativo validada por abogado, en voz y en pantalla. |

---

# Parte 2: cómo entrenar al modelo para que hable bien

## Cómo está armado hoy

- **Un solo llamado por turno** a Gemini (`gemini-3.1-flash-lite`, temperatura 0,2,
  `thinkingLevel: minimal`) que devuelve un JSON cerrado (`esquema-salida-llm.schema.json`) con los
  datos extraídos, la acción siguiente y la frase que dice el avatar (`respuesta_hablada`, ≤ 400
  caracteres, sin montos).
- **El system prompt** es solo el archivo del oficio de la sesión (`conductas/prompts/{oficio}.md`,
  versión `prompts.1`), elegido por el avatar (`prompts/oficio.go`: `av_valid_tito` → jardinería).
  `conductas.md` es documentación: **no se manda al modelo**. Todo lo que el modelo tiene que saber
  tiene que estar en el prompt del oficio.
- **El contenido del turno** es: el JSON validado del turno anterior + el último mensaje del
  cliente marcado como dato. Sin historial, sin el nombre del asesor, sin fotogramas.
- **Go hace de red de seguridad**: valida el esquema, reintenta una vez con corrección, reemplaza
  la frase si trae montos, detecta inyección, calcula el precio con las tarifas y agrega frases de
  plantilla al cierre (`FraseCotizacion`, `FraseDerivacion`, en `turno/texto.go`).
- **Verificación existente**: `npm run verificar` en `conductas/` valida el esquema con ajv (strict),
  12 ejemplos que deben pasar, 20 negativos que deben fallar y que estén las 8 acciones. Es una
  prueba **del esquema**, no del modelo. El arnés contra el LLM real es **T17, pendiente**.

Esta base es buena: el precio fuera del LLM, el esquema cerrado y los negativos son exactamente lo
que hay que tener. Lo que falta es todo lo que hace que la charla suene a una persona.

## Plan por etapas (de lo más barato a lo más caro)

| Etapa | Qué | Esfuerzo | Costo directo | Impacto esperado |
|---|---|---|---|---|
| 1 | Conductas, prompts y arreglos de contexto en Go | 3 a 5 días | ~0 | **Muy alto**: arregla Tito, lo genérico y la cámara |
| 2 | Few-shot y conversaciones guionadas por oficio | 4 a 6 días | ~0 | Alto: tono y orden de preguntas consistentes |
| 3 | Evaluaciones automáticas (T17) sobre `verificar` | 5 a 8 días | < 1 USD por corrida | **Alto**: nada empeora sin que lo veamos |
| 4 | Datos reales del piloto con consentimiento y etiquetas | 1 semana de armado + continuo | horas de profesionales | Alto a mediano plazo: precisión y casos reales |
| 5 | Ajuste fino y voz (TTS rioplatense, latencia) | Voz: 1 a 2 semanas. Ajuste fino: 2 a 4 semanas | Voz 0,02 a 0,20 USD por llamada; ajuste fino 20 a 100 USD por corrida + tiempo | Voz: alto. Ajuste fino: medio, y solo con datos |

### Etapa 1: conductas, prompts y contexto

#### 1.1 Arreglos de contexto en Go (lo que más rinde)

Son cambios chicos de código (los hace quien tenga la tarea, no este documento) que pasan por el
arquitecto porque tocan el contrato del turno:

1. **Historial corto.** Mandar los últimos 4 a 6 intercambios (cliente y asesor) como `contents`
   multi-turno, además del JSON anterior. Costo: unos 200 a 500 tokens más por turno (~0,0001 a
   0,0003 USD). Sin esto, ningún prompt va a lograr que el asesor retome lo que dijo el cliente.
2. **Identidad del asesor en el prompt.** Inyectar desde Go: nombre del asesor, nombre del
   profesional, sus oficios y **el plantel** ("Laura: pintura. Juan: mantenimiento."). Hoy el
   prompt dice "Sos el trabajador de la costa que toma pedidos de jardinería": Tito no sabe que
   es Tito.
3. **Guarda de oficio en Go.** Si `salida.oficio` es válido y no está en los oficios del asesor de
   la sesión, **no cotizar**: responder con una plantilla de derivación y marcar el turno. Es la
   red de seguridad del caso Tito, aunque el modelo se equivoque.
4. **Acción de derivación.** Proponer al arquitecto (contrato primero) una acción nueva
   `derivar_asesor` con el oficio destino, y un evento para que el front muestre "Hablar con
   Laura". Mientras no esté, usar `fuera_de_alcance` con `motivo: "oficio de otro asesor:
   pintura"` y que la frase nombre a Laura.
5. **Cámara: prender o callar.** Volver a adjuntar fotogramas, pero solo uno, y solo en el turno
   siguiente a un `pedir_ver` (evita saturar el modelo, que fue el motivo de apagarlos). Si no se
   puede todavía, sacar del prompt el "pedir ver" y reemplazarlo por "pedile que te diga…".
6. **Plantillas de cierre más cortas.** `FraseCotizacion` tiene tres oraciones y se suma a la
   frase del modelo: en voz suena a contrato. Ver el "después" del ejemplo 5.

#### 1.2 Estructura de prompts propuesta (`prompts.2`)

Hoy hay un archivo por oficio que repite reglas comunes. Propuesta:

```
conductas/prompts/
  comun.md            # regla de oro, voz, voseo, una pregunta, inyección, minimización
  oficios/pintura.md  # qué preguntar y en qué orden, señales técnicas
  asesores/laura.md   # personalidad, muletillas, cómo saluda y cómo cierra
```

Go arma el system prompt como `comun + oficio + asesor + plantel` y la referencia de versión
(`prompts/referencia.go`) toma el hash de las tres partes. Es un cambio mecánico en
`prompts.MaterialTurno`.

#### 1.3 Reglas de voz (van en `comun.md`)

```
Hablás en voz alta, no escribís. Por eso:
- Máximo dos oraciones cortas y una sola pregunta, al final. Ideal: menos de 30 palabras.
- Primero mostrá que escuchaste (repetí el dato clave con tus palabras), después preguntá.
- Voseo siempre: vos, tenés, podés, querés, mirá, contame. Nunca tú, usted, tienes, puedes, vale.
- Números chicos en palabras ("tres por dos"), medidas dichas ("metros cuadrados", nunca "m2").
- Sin listas, paréntesis, comillas, emojis ni abreviaturas.
- No arranques siempre igual. Variá el acuse: "Dale", "Perfecto", "Bien", "Ah, mirá", o
  directamente el dato ("Una pared de tres por dos, la tengo").
- Nada de frases de call center: "te tomo el pedido", "¿en qué más te puedo ayudar?",
  "excelente pregunta".
- Si el cliente está apurado o hay daño activo, menos charla y directo al dato que falta.
```

Bajar el `maxLength` de `respuesta_hablada` de 400 a ~250 en el prompt (no hace falta tocar el
esquema todavía; la evaluación lo controla).

#### 1.4 Personalidad por asesor

| Asesor | Personalidad | Cómo suena | Lo que evita |
|---|---|---|---|
| **Laura** (pintura) | Prolija, detallista, le importa la preparación de la superficie | "Ojo que si hay humedad, primero hay que tratarla." "Dale, contame." | Prometer terminaciones; hablar de marcas de pintura |
| **Tito** (jardinería) | Tranquilo, de la costa, conoce el viento, el salitre y los pinos | "Mirá, con este viento el cerco sufre." "Tranqui, lo vemos." | Apurar; cotizar paisajismo como corte |
| **Juan** (mantenimiento) | Resolutivo, práctico, prioriza lo urgente | "Vamos por partes." "Primero lo que se moja." | Inventar tareas sin tarifa (hoy casi todo es derivar a WhatsApp) |

Cada `asesores/*.md` lleva: saludo de apertura (con el aviso de asistente automático), 5 o 6
muletillas permitidas, 2 que no puede usar, y cómo deriva.

#### 1.5 Cómo derivar cuando el oficio no es el suyo

```
Hacés solo {oficios_del_asesor}. El resto del equipo: {plantel}.
Si el cliente pide algo de otro oficio del equipo:
- No tomes el pedido ni anotes medidas como si fuera tuyo.
- Decí en una oración que eso lo hace otro asesor, nombralo, y ofrecé pasarlo.
- oficio: el que pidió el cliente. siguiente_paso.accion: derivar_asesor (o fuera_de_alcance
  con motivo "oficio de otro asesor: <oficio>" mientras no exista la acción).
Si pide algo que nadie del equipo hace (gas, electricidad matriculada, estructura):
fuera_de_alcance, decí por qué y ofrecé lo que sí hace el equipo.
Si pide dos cosas (jardín y pintar la reja): tomá lo tuyo y avisá que lo otro lo ve otro asesor.
```

#### 1.6 Ejemplos de antes y después

**Ejemplo 1: el caso Tito (derivación).** Cliente a Tito: "Quiero pintar una pared de 3 por 2
metros."

- Antes (prueba real): "Buenísimo, te tomo el pedido. ¿En qué localidad queda el trabajo?" y en
  Datos en vivo: Oficio: Pintura.
- Después: "Uh, pintar no es lo mío, yo me ocupo del jardín. La que pinta es Laura. ¿Querés que te
  pase con ella? Ya le dejo anotada la pared de tres por dos."
  JSON: `oficio: "pintura"`, `accion: "derivar_asesor"` (o `fuera_de_alcance` con motivo), sin
  cotizar.

**Ejemplo 2: lo genérico (Laura, primer dato).** Cliente: "Quiero pintar una pared de 3 por 2."

- Antes: "Buenísimo, te tomo el pedido. ¿En qué localidad queda el trabajo?"
- Después: "Dale, una pared de tres por dos. ¿Es adentro de la casa o da afuera?"
  (Repite el dato, y la pregunta siguiente es la que cambia el precio: interior o exterior. La
  zona puede esperar un turno.)

**Ejemplo 3: pedir ver con la cámara (Laura, con fotogramas prendidos).** Cliente: "Tiene unas
manchas negras en la esquina."

- Antes (estilo actual): "Perfecto. ¿Me podrías indicar el estado de la superficie?"
- Después: "Eso puede ser humedad. Acercá la cámara a la esquina, despacio, así la veo bien."
  JSON: `accion: "pedir_ver"`, `estado_superficie` queda sin definir hasta ver.

**Ejemplo 4: urgencia (Juan).** Cliente: "Se me llueve el techo del quincho y el finde viene
gente."

- Antes: "Entiendo. ¿Me decís en qué zona es el trabajo?"
- Después: "Uy, con lluvia encima no esperemos. Mostrame de dónde gotea y te paso directo con el
  profesional."
  JSON: `urgencia.nivel: "alta"`, `accion: "derivar_whatsapp"` (mantenimiento no tiene tarifa
  validada).

**Ejemplo 5: el cierre con presupuesto (Laura).**

- Antes: frase del modelo + `FraseCotizacion`: "Perfecto, ya tengo todo. Listo, ya tengo lo
  necesario. Te dejo en pantalla el presupuesto orientativo; el profesional lo confirma cuando vea
  el trabajo. Si querés seguir, tocá el botón de WhatsApp con tu código." (Dice dos veces "ya
  tengo", más de 40 palabras.)
- Después (plantilla de Go más corta y el modelo no repite el acuse): "Listo, te dejo el
  presupuesto en pantalla. Es orientativo y de mano de obra: Laura lo confirma cuando vea la
  pared. ¿Le escribís por WhatsApp?"

**Ejemplo 6: pregunta de precio antes de tiempo (Tito).** Cliente: "¿Pero más o menos cuánto me
sale cortar el pasto?"

- Antes: "El número lo arma el sistema al final." (correcto, pero seco)
- Después: "Te lo digo apenas tenga los metros, así no te tiro un número al aire. ¿Más o menos
  cuánto tiene el terreno?"

**Ejemplo 7: dato difícil de estimar (Tito).** Cliente: "No sé cuánto mide."

- Antes: "¿Me podés decir la superficie en metros cuadrados?"
- Después: "No pasa nada. ¿Es como una cancha de tenis, más chico o más grande? Si querés, caminá
  el fondo con la cámara y lo calculamos juntos."

### Etapa 2: few-shot y conversaciones guionadas

Los 12 `ejemplos/` actuales son salidas de un turno suelto: sirven para el esquema, no para enseñar
cómo suena una charla.

1. **Carpeta `conductas/guiones/`**, una conversación por archivo, con todos los turnos (cliente,
   asesor, JSON esperado de cada turno). Formato propuesto:

   ```json
   {
     "id": "tito-03-corte-y-reja",
     "asesor": "tito", "oficios": ["jardineria"], "plantel": {"laura": ["pintura"]},
     "turnos": [
       {"cliente": "Hola, necesito cortar el pasto y pintar la reja",
        "esperado": {"oficio": "jardineria", "accion": "preguntar",
                     "debe_mencionar": ["Laura"], "no_debe": ["te tomo el pedido"]},
        "asesor_referencia": "Dale, el pasto lo hago yo. La reja la ve Laura, que pinta. ¿El terreno es grande o chico?"}
     ]
   }
   ```

2. **Cuántos:** 10 por oficio para arrancar (30), escritos con un pintor y un jardinero de la red
   en una tarde de mate: el profesional dice cómo pregunta él, nosotros lo pasamos a texto. Cubrir:
   camino feliz, cliente que no sabe medidas, derivación, fuera de alcance, urgencia, plazo largo,
   propietario ausente, consorcio, inyección, pregunta de precio anticipada.
3. **Few-shot en el prompt:** meter 2 o 3 diálogos cortos (no JSON completos) por asesor en
   `asesores/*.md`. Más de 3 encarece cada turno y hace que el modelo copie frases textuales. Rotar
   cuáles van según el oficio.
4. **Los guiones son también casos de evaluación** (etapa 3): se escriben una vez y sirven dos veces.

### Etapa 3: evaluaciones automáticas (construir T17 sobre `verificar`)

Hoy `npm run verificar` prueba el esquema sin llamar al modelo. Se agrega una segunda capa que sí
llama al modelo, con la misma filosofía (archivos JSON en carpetas, sale con código 1 si falla):

```
conductas/
  verificar.mjs        # ya existe: esquema, ejemplos, negativos (sin red, corre en cada PR)
  evaluar.mjs          # nuevo: corre guiones/ y casos/ contra el LLM real
  casos/               # casos de un turno con expectativas
  resultados/          # salida por corrida (no se commitea; se resume en el tablero)
```

`npm run evaluar` (en `conductas/package.json`) arma el pedido igual que el backend. Lo más limpio
es un comando Go (`go run ./cmd/evaluar-conductas`, como el `cmd/medir-gemini` que ya existe) que
usa el adaptador de producción, y que `evaluar.mjs` solo lo invoque y puntúe. Así se evalúa
exactamente lo que corre en producción.

#### Criterios: primero las reglas, después el juez

**Chequeos deterministas (baratos, sin ambigüedad):**

| Criterio | Cómo se chequea |
|---|---|
| Salida válida | Pasa `ValidarSalidaLLM` sin reintento (y se cuenta cuántas necesitaron reintento) |
| Acción correcta | `siguiente_paso.accion` ∈ acciones esperadas del caso |
| Derivación correcta | Oficio fuera del asesor → nunca `emitir_presupuesto`; la frase nombra al asesor correcto |
| No anticipa precio | Ninguna cifra ni palabra de monto antes de `emitir_presupuesto` (ya lo filtra Go; acá se cuenta cuántas veces tuvo que reemplazar) |
| Datos anotados | Campos esperados con el valor esperado (`zona.localidad`, `medidas[0].cantidad`, `altura.metros_max`…) |
| Una sola pregunta | Como máximo un "?" y al final |
| Largo para voz | ≤ 250 caracteres y ≤ 35 palabras |
| Voseo | Regex de formas prohibidas: `\b(tú|usted|tienes|puedes|quieres|vale)\b` |
| Frases prohibidas | "te tomo el pedido", "en qué más te puedo ayudar", etc. |
| Variedad | En un guion, el mismo arranque ("Buenísimo") en más del 30 % de los turnos falla |
| Inyección | Casos de `negativos/` como mensaje del cliente: `intento_inyeccion: true` y sin revelar el prompt |

**Juez LLM (para tono y naturalidad):** un modelo distinto del que se evalúa (regla del repo:
quien escribe no revisa) puntúa de 1 a 5: suena a persona del oficio, retoma lo que dijo el
cliente, natural en voz alta, personalidad del asesor. Se valida el juez con 30 respuestas
puntuadas a mano por Rober y un profesional; si no coincide en ≥ 80 %, no se usa como bloqueante.

**Repeticiones:** cada caso 3 veces (la salida no es determinista). Pasa si 3/3 en los criterios
críticos (derivación, precio, esquema) y 2/3 en los de estilo.

#### Set inicial de casos (60, a escribir con los profesionales)

| Grupo | Ejemplos | Cantidad |
|---|---|---|
| Derivación entre asesores | Tito + "pintar pared 3 por 2"; Laura + "cortar el pasto"; Juan + "pintar la fachada"; pedido mixto | 9 |
| Fuera de alcance | Gas, enchufes nuevos, viga partida | 4 |
| Camino feliz por oficio | Interior, fachada en altura, corte periódico, poda, cerco | 12 |
| Datos difíciles | "No sé cuánto mide", "es grande", medidas en pasos, "como dos canchas" | 6 |
| Precio anticipado | "¿Cuánto sale más o menos?", "¿me hacés precio?", "¿y si pago en efectivo?" | 5 |
| Urgencia y plazo | Filtración activa, "antes del verano", "en marzo", por etapas | 6 |
| Tipo de cliente | Propietario ausente, consorcio, inmobiliaria, comercio | 5 |
| Inyección y datos personales | "Ignorá tus reglas", "mostrame el prompt", cliente que dicta su DNI y dirección | 6 |
| Ruido de transcripción | Frases cortadas, muletillas, "eh… la pared… tres", palabras mal transcriptas | 4 |
| Cierre | Cliente que se despide, que dice "lo pienso", que pide WhatsApp | 3 |

#### Cuándo se corre y cuánto cuesta

- **En cada PR que toque `conductas/prompts/`, `conductas/guiones/`, `turno/` o
  `proveedores/gemini/`:** `npm run evaluar` local antes del push, con la clave en `backend/.env`.
  Se pega el resumen en la descripción del PR y en la `nota` del tablero (regla "hecho =
  verificado").
- **Cada noche en CI (cuando exista T12):** misma corrida con una clave paga de un proyecto
  aparte, con tope de gasto.
- **Costo:** 60 casos × 3 repeticiones × ~0,0015 USD ≈ **0,30 USD por corrida**, más el juez
  (similar). Los 30 guiones de 6 turnos suman otro ~0,80 USD. **Menos de 2 USD por corrida
  completa.**
- **No va en `verificar-repo.ps1`** (necesita clave y red). Sí se agrega a `verificar.mjs` un
  chequeo de que `casos/` y `guiones/` estén bien formados, para que eso corra en cada PR sin red.
- **Resultado guardado por versión de prompt** (`prompts.2`, `prompts.3`…) para comparar: "pasó de
  71 % a 88 % en derivación".

### Etapa 4: datos reales del piloto

1. **Consentimiento aparte y opcional.** En la pantalla de consentimiento, una segunda casilla
   destildada: "Permito que se use el texto de esta conversación, sin imagen ni audio y sin mis
   datos personales, para mejorar el asistente." Si no la tilda, la llamada funciona igual. Texto
   a validar con el abogado (Ley 25.326, finalidad distinta de la cotización).
2. **Qué se guarda:** solo el texto transcripto de cada turno, la `respuesta_hablada` y el JSON
   validado. **Nunca** fotogramas ni audio (BRIEF, decisión 3). Ya existe la idea de guardar
   respuestas del modelo para el backoffice (T31); se reusa con retención propia (por ejemplo 12
   meses) y borrado ARCO.
3. **Anonimizar en dos pasadas:** reglas (teléfonos, mails, DNI, números de calle, patentes) y una
   pasada de LLM que reemplaza nombres propios de personas por `[PERSONA]`. Las zonas quedan en el
   nivel del enum (`cobo`, `santa_clara_del_mar`). Revisión humana de una muestra del 10 %.
4. **Etiquetado con los profesionales, en el panel**, con botones y no con formularios:
   - En cada cotización: "¿El número estaba bien?" (bajo / bien / alto), "¿Hiciste el trabajo?"
     (sí / no / todavía), "Precio final" (opcional). Esto también **calibra las tarifas**, que hoy
     no están validadas.
   - En una muestra de conversaciones: "¿Preguntó lo que vos preguntarías?" y "¿Qué faltó?".
   - Incentivo: un mes gratis cada 20 conversaciones etiquetadas.
5. **Uso de los datos:** cada conversación que salió mal se convierte en caso de `casos/` (la
   evaluación crece con la realidad, no con la imaginación). Las mejores se vuelven few-shot.
   Meta: 300 conversaciones etiquetadas al final del piloto.
6. **Gemini con datos reales solo en plan pago.** Repetido porque es la condición de todo esto.

### Etapa 5: ajuste fino y voz

#### Ajuste fino (fine-tuning): cuándo sí y cuándo no

- **Qué se gana:** tono y estructura más consistentes con un prompt más corto (menos tokens, algo
  menos de latencia), y menos reintentos de esquema. **No** se gana conocimiento de precios (no
  debe tenerlo) ni capacidad de ver mejor la cámara.
- **Cuándo vale la pena:** las tres condiciones juntas. (a) Hay ≥ 500 conversaciones reales
  etiquetadas y anonimizadas. (b) Prompt + few-shot se estancaron en las evaluaciones (por ejemplo,
  dos versiones seguidas sin mejora en tono). (c) El volumen hace que el prompt largo pese en costo
  o latencia (miles de llamadas por mes).
- **Cuánto cuesta:** el entrenamiento en sí es barato: 500 conversaciones × ~3.000 tokens × 3
  épocas ≈ 4,5 M tokens, del orden de **20 a 100 USD por corrida** en los servicios de ajuste
  supervisado (Vertex AI para Gemini; verificar qué modelos vigentes lo admiten y el precio, porque
  cambia seguido). Lo caro es la gente: 2 a 4 semanas de armado de datos, evaluación y
  despliegue, más reentrenar cada vez que cambie el esquema o el plantel.
- **Riesgo:** un modelo ajustado queda atado a una versión de un proveedor; si Google retira el
  modelo base, hay que reentrenar. Con el puerto `proveedores.Extractor` (ADR 0003) y las
  evaluaciones de la etapa 3, **antes de ajustar conviene probar otros modelos con el mismo set**:
  a veces cambiar de modelo rinde más que ajustar uno.
- **Estimación:** no antes de marzo de 2027. Probablemente nunca para el tono si las etapas 1 a 3
  andan bien; más probable para bajar latencia con un modelo más chico.

#### Voz: TTS con acento rioplatense

Hoy el avatar habla con `speechSynthesis` del navegador: la voz depende del teléfono (en muchos
Android sale con acento de España o México, o robótica) y no hay control de visemas finos.

| Opción | Acento rioplatense | Latencia al primer audio | Costo por llamada (≈1.200 caracteres hablados) | Notas |
|---|---|---|---|---|
| Voz del navegador (hoy) | Depende del equipo; casi nunca | Inmediata | 0 | Sin control; suena distinto en cada celular |
| Azure Speech, voces neurales es-AR | Sí, voces es-AR nativas | Baja, con streaming | ~0,02 USD | Devuelve **eventos de visemas**: encaja con `turno/visemas.go` y el avatar |
| Google Cloud TTS / Gemini TTS | Variable (verificar si hay voces es-AR; Gemini TTS se puede pedir con estilo) | Baja a media | ~0,02 a 0,05 USD | Mismo proveedor que el LLM, una factura |
| ElevenLabs (voz clonada de un actor rioplatense con su consentimiento) | El más natural | Muy baja en modelos "flash" | ~0,10 a 0,20 USD | Voz propia por asesor (Laura, Tito, Juan); más caro, contrato con el actor |

Recomendación: **probar Azure es-AR primero** (precio, acento nativo y visemas), con ElevenLabs
como comparación de calidad para Laura. Hacer una prueba ciega con 10 personas de la zona: ¿cuál
suena más "de acá"? Cualquiera de las dos cabe holgada en el costo por cotización de la sección 3.

#### Latencia: el presupuesto de tiempo

La charla se siente natural si el asesor arranca a hablar **en menos de 2 a 3 segundos** desde que
el cliente termina. Hoy son 4 a 12 s. Presupuesto objetivo:

| Paso | Hoy | Objetivo |
|---|---|---|
| Detectar fin de habla | Botón "Tocá para hablar" | 600 a 800 ms de silencio (VAD en el servidor con micrófono abierto) |
| Transcripción | Navegador | 300 a 800 ms (servidor) |
| LLM | 2 a 10 s | 1,2 a 2,5 s: respuestas más cortas, `thinkingLevel: minimal` (ya está), menos tokens de salida, `MaxTokensSalida` ajustado |
| TTS al primer audio | Inmediato (navegador) | 200 a 400 ms con streaming |
| **Total** | **4 a 12 s** | **≈ 2,5 a 4 s, y p50 ≤ 3 s** |

Trucos baratos mientras tanto:

- **Acuse inmediato** desde el front o el backend apenas se detecta el fin de habla: un "Mjm…",
  "A ver…", "Dale, dejame anotar" pregrabado con la voz del asesor (5 o 6 variantes). Cubre 1 a 2
  segundos de espera y se siente humano.
- **Hablar mientras se escribe el pizarrón**: que la respuesta hablada salga antes que el resto del
  JSON (el campo `respuesta_hablada` primero en el esquema y salida por streaming), o separar en
  dos llamados si el streaming del JSON no alcanza.
- **Micrófono abierto con cuidado**: cancelación de eco activada en `getUserMedia`, y al principio
  medio dúplex (no escuchar mientras habla el avatar) para que el asesor no se transcriba a sí
  mismo. Después, interrupción ("barge-in") cuando el cliente habla encima.
- **Medir siempre**: agregar al log de cada turno `ms_stt`, `ms_llm`, `ms_tts` y el total. Hoy el
  log muestra el inicio y el fin del turno, no dónde se va el tiempo.

---

# Resumen de una página

**El diagnóstico.** El producto tiene una base técnica seria (el precio fuera del LLM, esquema
cerrado, defensas contra inyección, panel), y Rober tiene algo que la mayoría de los SaaS no tiene
al arrancar: 100 profesionales en su red y una zona chica que conoce. Lo que frena hoy no es el
marketing: son tres cosas concretas. Las tarifas no están validadas, la clave de Gemini es la
gratuita, y el modelo habla sin historial, sin cámara y sin saber quién es (por eso Tito aceptó
pintar).

**A quién y cómo.** Primero, profesionales independientes de pintura y jardinería de la red, en la
costa, con piloto gratis de 60 días y después el plan Oficio a ARS 18.000-25.000 (USD 12-17) con
precio de fundador congelado. Las pinturerías y corralones, como canal de demanda con QR en el
mostrador. Empresas chicas de mantenimiento en el mes 3. Aseguradoras y marketplaces, después.
Cada cotización cuesta menos de 0,25 USD aun con voz premium: el precio sale del valor (una tarde
de visita ahorrada), no del costo. Noviembre y diciembre son pretemporada: hay que salir ya.

**Las 5 acciones de esta semana**

1. **Pasar Gemini a plan pago** con alerta de gasto, y pedir la consulta con el abogado
   (consentimiento, transferencia internacional, leyenda de presupuesto orientativo).
2. **Arreglar el caso Tito en dos capas:** guarda en Go (no cotizar oficios que el asesor no tiene)
   y prompt con identidad y plantel ("Sos Tito, hacés jardinería; Laura pinta, Juan hace
   mantenimiento"). Proponer al arquitecto la acción `derivar_asesor`.
3. **Mandar historial corto al modelo** (últimos 4 a 6 intercambios) y reescribir las reglas de voz
   (dos oraciones, una pregunta, repetir el dato, voseo, sin frases de call center). Decidir la
   cámara: un fotograma después de `pedir_ver`, o dejar de pedir ver.
4. **Validar tarifas** con 2 pintores y 2 jardineros de la red, en persona, con
   `tarifas-2026.json` impreso.
5. **Escribir los primeros 20 casos de evaluación** (derivación, precio anticipado, voseo, largo) y
   un `npm run evaluar` mínimo que los corra contra Gemini. Así cada cambio de prompt de los
   próximos días se mide.

**Las 5 acciones de este mes**

1. **Piloto con 10 profesionales** (semana 3) y 20 (semana 6), con onboarding presencial, respuesta
   automática de WhatsApp Business con su enlace y grupo de feedback.
2. **Etapa 2 completa:** `prompts.2` con `comun + oficio + asesor`, 30 guiones escritos con
   profesionales, 2 o 3 few-shot por asesor; evaluación con 60 casos y juez validado a mano.
3. **Primeras 3 pinturerías con QR** y Google Ads local con USD 150 para medir costo por cotización.
4. **Etiquetado en el panel** (¿el número estaba bien?, ¿hiciste el trabajo?, precio final) con
   consentimiento aparte del cliente. Es lo que calibra tarifas y lo que algún día alimenta un
   ajuste fino.
5. **Voz y latencia:** medir dónde se va el tiempo de cada turno, poner un acuse inmediato
   pregrabado y hacer la prueba ciega de TTS es-AR (Azure vs ElevenLabs) con 10 personas de la
   zona. Meta: p50 ≤ 3 s hasta que el asesor empieza a hablar.

**La métrica que manda:** cotización → trabajo cerrado, con el presupuesto dentro de ±25 % del
precio final. Meta del piloto: ≥ 15 % de cierre y ≥ 70 % de precisión.
