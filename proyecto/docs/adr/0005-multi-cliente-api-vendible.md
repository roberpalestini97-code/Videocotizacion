# ADR 0005 — Multi-cliente y API vendible: tenants, claves, cuotas y aislamiento

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01)

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
4. Cuotas por tenant con topes duros: llamadas simultáneas (inicial 5) y minutos por mes
   (inicial 500). Al alcanzar el tope: no se crean sesiones nuevas (error del catálogo) y la
   sesión en curso cierra al llegar al límite con motivo `cuota_agotada`, avisando antes.
   Cuota dinámica por debajo de los topes (por enlace, por origen, por IP): ver 0006.
5. Límites de tasa por credencial e IP en las rutas públicas.
6. Medición de consumo por tenant (minutos, y unidades por proveedor de 0003) visible en el
   panel ("consumo", también diario según contrato 0.1.3).
7. Política de costo (BRIEF): si el gasto sube, primero se optimiza y después se cobra un
   servicio. La facturación a terceros queda fuera de este ADR.
8. Versionado: solo el OpenAPI es candidato a 1.0.0; los eventos de sesión siguen en borrador.

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
- (−) Un tope duro puede cortar una llamada legítima; se avisa antes de cortar.

## Verificación
- Plan de aislamiento (45 casos de T16, a rehacer): con credencial de A, toda lectura,
  escritura, listado y búsqueda de recursos de B da 404 (no 403, para no confirmar existencia).
- Prueba: `tenant_id` en el cuerpo distinto del de la credencial no cambia el tenant efectivo.
- Prueba: la clave pública no puede leer sesiones ni cotizaciones (401/403 según contrato).
- Prueba con reloj y medidor falsos: la llamada 6 simultánea se rechaza; al agotar minutos
  no se crean sesiones y la sesión activa cierra con `cuota_agotada`.
- Clave secreta: en la base solo hay hash; comparación en tiempo constante.

## Supuestos
- Los valores 5 y 500 son configurables por tenant; los de terceros se pactan al vender.
- Algoritmo de hash de claves y formato exacto de prefijo: los define go en T04.
- Rutas de gestión de claves de API: pendientes en el contrato (pasaron a T04 por T37).
