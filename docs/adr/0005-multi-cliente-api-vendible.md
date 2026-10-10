# ADR 0005 — Multi-cliente y API vendible: tenants, claves, cuotas y aislamiento

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01). Ampliado 2026-10-09 por T44
  (contrato 0.1.5): §4 topes y reserva, §5 orden de los límites, §6 consumo, §9–§12.

## Contexto
El backend se tiene que poder vender como API a terceros (BRIEF). Rober es el primer cliente.
Cada llamada consume servicios de IA pagos por minuto: un tercero mal configurado o un bot
puede generar costos. Capacidad inicial: hasta 5 llamadas simultáneas y 500 minutos por mes
(decisión 7); a más demanda, más minutos.

## Decisión
1. Tenant = cliente de la API (empresa). Rober es el tenant inicial. Profesionales/asesores,
   enlaces opacos, tarifas, conductas, sesiones y cotizaciones pertenecen a un tenant.
2. Dos tipos de credencial por tenant:
   - Clave secreta (servidor a servidor): prefijo identificable + secreto aleatorio; se
     guarda solo un hash; se muestra una única vez al crearla; rotable y revocable.
   - Clave pública del widget (navegador): solo sirve para crear sesiones (`crearSesion`),
     atada a la lista de Origin del tenant y al desafío anti-bots (0006). No lee datos.
   El panel del asesor usa su propia sesión (cookie, ver 0006), no claves de API.
3. El `tenant_id` de cada petición se deriva SOLO de la credencial; si el cuerpo trae otro,
   se ignora o se rechaza. Ese valor alimenta `SET LOCAL app.tenant_id` (0004).
4. **Topes duros y reserva atómica (R56, R57; H2, H3 y B3 de T04b1).** Dónde se fija cada tope:

   | Tope | Dónde vive | Quién lo cambia | Valor inicial |
   |---|---|---|---|
   | Segundos por mes del tenant | `vc.tenants.segundos_mes_tope` | operador, `api tenant configurar` | 30 000 (500 min, BRIEF 7) |
   | Simultáneas del tenant | `vc.tenants.simultaneas_tope` | ídem | 5 |
   | Segundos por mes del asesor | `vc.asesores.segundos_mes_tope` (NULL = sin tope propio) | operador, `api asesor configurar` (panel de admin: más adelante) | NULL |
   | Simultáneas del asesor | `vc.asesores.simultaneas_tope` (NULL = sin tope propio) | ídem | NULL |
   | Gasto global por mes, en **segundos** de llamada de todos los tenants | `vc.topes_globales.segundos_mes` | operador, `api topes configurar` (rol dueño) | 30 000 provisorio hasta la cifra de Rober (P2) |
   | Simultáneas globales | `vc.topes_globales.simultaneas` | ídem | 5 (R57) |

   El tope global se expresa en segundos porque el contrato no conoce precios de proveedores;
   ops convierte la cifra de dinero de Rober en segundos. Si falta la fila de topes globales o
   vale 0, `api servir` no arranca (falla cerrada). El tope global no se expone a los tenants.
   - `crearSesion` solo **verifica** (lectura, sin reservar) que haya saldo ≥ 60 s y
     simultáneas libres: corta temprano, no garantiza.
   - `emitirTokenMedios` **reserva** con `vc.reservar_cupo` (ADR 0004 §10) en una transacción:
     +1 simultánea (tenant, asesor, global) y `duracion_maxima_s` de saldo en los tres
     contadores mensuales. Saldo efectivo = mínimo de los tres. Si el saldo < `duracion_maxima_s`
     pero ≥ 60 s, reserva el saldo y lo informa (`TokenMedios.reserva.recortada_por_cuota`); al
     llegar a ese límite la sesión cierra con `cuota_agotada`, avisando antes (`sesion.aviso`
     `cuota_proxima`). Con < 60 s → 429 `cuota_agotada`. Sin simultánea → 429
     `simultaneas_agotadas`. El mismo código para tenant, asesor o global: no se revela cuál.
   - La reserva vence en `inicio + duracion_maxima_s + 60 s` (independiente de la vida del
     token, H3c). Reconectar con reserva vigente reutiliza la misma reserva.
   - Al cerrar (cualquier motivo), `vc.liberar_cupo` pasa los segundos reales a usados y
     devuelve el resto, en la misma transacción del cierre.
   - La sesión que cruza la medianoche del día 1 se cobra en el mes en que se reservó.
   - Cuota dinámica por debajo de los topes (por enlace, por origen, por IP): ver 0006.
5. **Límites de tasa y orden (R8, R58; H1).** Ejes: por IP (IPv4 /32, IPv6 /64), por
   credencial, por enlace (`crearSesion`) y de desafíos por IP. Solo el de IP se consume antes
   de autenticar; el de credencial va después de validar Origin y desafío, y el de enlace después
   de resolver el enlace (tabla en `contracts/estado-de-congelamiento.md`). Con clave pública, el
   límite por credencial solo aplica a `crearSesion`: la clave está en el HTML de terceros y
   cualquiera puede forjar `Origin` fuera de un navegador, así que un límite por clave consumible
   sin resolver el desafío permitía apagar el widget de un tenant con ~13 IPs (H1). `emitirDesafio`
   queda protegido por el límite por IP y el tope global de desafíos pendientes. Valores
   provisorios (los de `TasasPorDefecto` de go): 120/min por IP, 600/min por credencial,
   `crearSesion` 10/min por IP, 120/min por clave pública, 10/min por enlace, desafíos 20/min por IP.
6. **Medición de consumo (H2).** Sale de los contadores de ADR 0004 §10, nunca de las sesiones.
   `leerConsumo` (clave secreta) muestra el contador del tenant; `leerConsumoPanel` muestra el del
   asesor y `alerta_tenant` (nivel p50/p80/p100 del tenant, sin cifras) para que el asesor entienda
   un corte por cupo. Ambos con `segundos_reservados` y `reinicia_en`. La vista del tenant completo
   en el panel para administradores queda para una versión posterior. Unidades por proveedor (0003):
   uso interno de ops, no se exponen.
7. Política de costo (BRIEF): si el gasto sube, primero se optimiza y después se cobra un
   servicio. La facturación a terceros queda fuera de este ADR.
8. Versionado: solo el OpenAPI es candidato a 1.0.0; los eventos de sesión siguen en borrador.
9. **IP del cliente, IPv6 e instancias (B4, H6).**
   - *Ahora (parte 2 de T04b, antes de abrir al público):* lista `PROXIES_CONFIANZA` (CIDR). Si
     `RemoteAddr` está en la lista, la IP del cliente es la primera dirección **no** confiable al
     recorrer `X-Forwarded-For` de derecha a izquierda; si no está, es `RemoteAddr` y
     `X-Forwarded-For` se ignora. Lista vacía (por defecto) = se ignora siempre. Las claves de los
     límites por IP agrupan IPv6 por /64 (IPv4 por dirección).
   - *Ahora:* **una sola instancia** de `api servir`. Al arrancar toma un
     `pg_try_advisory_lock` de sesión con una constante fija; si otra instancia lo tiene, no
     arranca. Así el límite de tasa y los desafíos en memoria (por instancia) no se multiplican
     ni se pierden por un despliegue mal configurado. Los despliegues son parar → arrancar.
   - *Ahora:* el cupo (topes y simultáneas) ya es compartido: vive en PostgreSQL (§4).
   - *Deuda declarada:* almacén compartido de tasas y desafíos (PostgreSQL o Redis) para más de
     una instancia; recién entonces se quita el candado. Lo dispara pasar de 5 simultáneas o
     vender a un segundo tenant con volumen.
10. **Operación por CLI, no por HTTP (B8, C5, C6; S5 del contrato).** Comandos de `api`, con la
    salida de secretos una sola vez por stdout y nunca en logs; cada uno deja constancia sin
    datos personales (acción, tenant, fecha) en `vc.registro_operaciones`:
    - `api tenant crear|configurar` (rol dueño, como `api migrar`): alta del tenant, topes,
      retención por tipo dentro de los rangos de `leerRetencion`, lista inicial de Origin.
    - `api topes configurar` (rol dueño): topes globales (§4).
    - `api asesor crear --rol administrador|asesor`: crea el asesor y su enlace opaco; muestra una
      vez la contraseña provisoria y el URI TOTP para enrolar (el primer administrador del tenant
      nace así). `api asesor configurar` (topes propios) y `api asesor baja` (revoca sesiones del
      panel y enlace; el borrado o anonimización sigue lo pendiente de ADR 0004 §8).
    - `api clave-secreta crear|listar|revocar`: claves secretas del tenant (R1). Las claves
      públicas del widget siguen en el panel (`crearClaveWidget`, administrador).
    Los comandos no‑dueño usan `vc_api` con `SET LOCAL app.tenant_id` (RLS se aplica igual).
    El contrato HTTP no gana rutas: no hay superficie pública para crear tenants ni claves secretas.
11. **CORS del widget (B6, R55).** Solo en las rutas que usa el widget (`x-vc-cors` en el
    contrato: lecturas públicas, `emitirDesafio`, `crearSesion` y las rutas con token de sesión).
    Preflight `OPTIONS` sin credenciales, en el paso 2 de la tabla (después del límite por IP):
    responde 204 y agrega `Access-Control-Allow-Origin` (exacto, nunca `*`), métodos, encabezados
    (`Authorization, Content-Type, X-VC-Clave-Publica, X-Desafio, Idempotency-Key`),
    `Max-Age: 600` y `Vary` solo si el Origin está registrado en alguna clave pública activa de
    cualquier tenant (unión cacheada ≤ 60 s, como la revocación); si no, 204 sin esos encabezados.
    En las respuestas reales, `Access-Control-Allow-Origin` solo si el Origin quedó validado para la
    credencial (clave pública: su lista; token de sesión: Origins de las claves públicas activas
    del tenant de la sesión) y `Access-Control-Expose-Headers: Retry-After` en 429/503. Nunca
    `Access-Control-Allow-Credentials`. El panel se sirve del mismo origen que la API y no tiene
    CORS. Que el token de sesión se rechace con Origin ajeno (B9) lo decide seg.
12. **`Retry-After` honesto (H4).** Todo 429 y 503 lleva la espera calculada, igual a
    `reintentar_en_s`: espera del limitador; bloqueo restante de login; hasta las 00:00 del día 1
    del mes siguiente (hora argentina) en `cuota_agotada`; hasta medianoche en el límite diario de
    lecturas de contacto; estimación corta configurable (30 s) en `simultaneas_agotadas` y 503.
    El widget no reintenta solo `cuota_agotada`: ofrece WhatsApp.

## Alternativas consideradas
- Un solo tipo de clave para todo: exponer una clave con lectura en el navegador es
  inaceptable; descartado.
- OAuth2 con client credentials desde el día uno: más estándar, más complejo para el primer
  cliente; se puede agregar sin romper el modelo de tenant.
- Cuotas solo blandas (avisos): no frenan el abuso de costos; descartado.

## Consecuencias
- (+) Un tercero nunca ve datos de otro (credencial → tenant → RLS).
- (+) El costo máximo por tenant queda acotado por los topes.
- (−) Gestión de claves, rotación y lista de Origin suma pantallas/rutas (pendiente en T04).
- (−) Un tope duro puede cortar una llamada legítima; se avisa antes de cortar. Con la reserva
  de `duracion_maxima_s`, cerca del tope se ofrecen llamadas más cortas (recorte) en vez de cortar.
- (−) Una sola instancia hasta pagar la deuda de §9: sin alta disponibilidad; despliegue con corte.
- (−) El preflight confirma que un Origin está registrado en alguna clave (no cuál ni de quién);
  riesgo bajo, aceptado.
- (+) Un atacante que conoce la clave pública ya no apaga el widget sin pagar la prueba de trabajo (H1).

## Verificación
- Plan de aislamiento (45 casos de T16, a rehacer): con credencial de A, toda lectura,
  escritura, listado y búsqueda de recursos de B da 404 (no 403, para no confirmar existencia).
- Prueba: `tenant_id` en el cuerpo distinto del de la credencial no cambia el tenant efectivo.
- Prueba: la clave pública no puede leer sesiones ni cotizaciones (401/403 según contrato).
- Prueba con reloj y medidor falsos: la llamada 6 simultánea se rechaza; al agotar minutos
  no se crean sesiones y la sesión activa cierra con `cuota_agotada`.
- Clave secreta: en la base solo hay hash; comparación en tiempo constante.
- H1: `TestREV_DrenarTasaDeClavePublica` termina con el visitante legítimo en 201; una prueba de
  ráfaga por cada limitador (IP, credencial, `crearSesion` por IP/clave/enlace, desafíos por IP).
- H3: 20 `emitirTokenMedios` concurrentes con tope 5 (PG, `-race`) → exactamente 5; saldo de 1 min
  con `duracion_maxima_s` de 15 min → reserva recortada; saldo < 60 s → 429; tope del asesor y
  global agotados → 429 `cuota_agotada`.
- H4: el valor de `Retry-After` de cada 429/503 con reloj falso (borde de mes ART, M18 de rev).
- §9: segunda instancia con el candado tomado no arranca; `X-Forwarded-For` ignorado si
  `RemoteAddr` no es de confianza; dos IPv6 del mismo /64 comparten balde.
- §11: los vectores `cors` del contrato contra el servidor.

## Supuestos
- Los valores 5 y 500 son configurables por tenant; los de terceros se pactan al vender.
- Algoritmo de hash de claves y formato exacto de prefijo: los define go en T04.
- Gestión de claves secretas, tenants y asesores: por CLI (§10), no en el contrato HTTP.
