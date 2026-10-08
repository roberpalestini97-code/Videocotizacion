# ADR 0004 — Persistencia: PostgreSQL 16 con RLS forzada, roles separados y retención

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01 y lo decidido en T04a)

## Contexto
La API se vende a terceros (0005): un error de filtrado por cliente expondría consultas y
presupuestos de otro tenant. Se guardan datos personales (contacto, transcripción resumida,
datos extraídos), sujetos a la Ley 25.326 (a validar con abogado). Confiar solo en el
`WHERE tenant_id = ?` del código es frágil.

## Decisión
1. PostgreSQL 16. Toda tabla de negocio tiene `tenant_id uuid NOT NULL` (sin excepciones,
   salvo el catálogo de tenants) e índices que empiezan por `tenant_id`.
2. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en cada tabla con `tenant_id`.
   Política única por tabla, `USING` y `WITH CHECK`:
   `tenant_id = current_setting('app.tenant_id', true)::uuid`. Sin la variable → 0 filas y
   los INSERT fallan (falla cerrada).
3. Roles:
   - `vc_dueno`: dueño de esquema y tablas; solo lo usa `api migrar`. No lo usa la API.
   - `vc_api`: rol de la API; `NOSUPERUSER NOBYPASSRLS`, no dueño de nada, solo los
     privilegios DML necesarios por tabla.
4. Cada operación corre en una transacción que primero ejecuta
   `SET LOCAL app.tenant_id = $1` (vía `set_config(..., true)`). El `tenant_id` sale de la
   credencial autenticada, nunca del cuerpo de la petición. No se usa `SET` de sesión, para
   que el pool de conexiones no arrastre el tenant entre peticiones.
5. Arranque seguro: al iniciar, `api servir` verifica en `pg_roles`/`pg_class` que su rol no
   es superusuario, no tiene BYPASSRLS, no es dueño de tablas y que toda tabla con `tenant_id`
   tiene RLS forzada. Si algo falla, no arranca.
6. Migraciones versionadas en el repo, aplicadas solo con `api migrar` y credenciales de
   `vc_dueno`; cada migración que crea tabla con `tenant_id` incluye su política.
7. Qué se guarda (para el backoffice, decisión 5 del BRIEF): sesión (inicio, fin, motivo de
   cierre, minutos), datos extraídos validados, presupuesto (ítems y totales en centavos
   `int64`, versión de tarifas, prompts y esquema), código de referencia, resumen para el
   panel y contacto solo si el cliente lo dejó con aviso y consentimiento.
   NO se guardan fotogramas (0006) ni audio. La transcripción completa no se guarda; si se
   decide guardar extractos, se agrega por ADR.
8. Retención: cada tabla con datos personales tiene `borrar_despues_de`; un job diario borra
   lo vencido y deja constancia sin datos personales. Plazos concretos: a validar con abogado.
   Derechos ARCO por endpoints del contrato (T27).
9. Registro de lecturas: las lecturas de datos personales desde el panel se registran
   (quién, qué, cuándo), en tabla propia con RLS.

## Alternativas consideradas
- Base por tenant: aislamiento fuerte pero operación y migraciones N veces; excesivo hoy.
- Esquema por tenant: mismas complicaciones de migración; RLS cubre el riesgo con menos costo.
- Solo filtro en el código: un olvido filtra datos de otro cliente; descartado como única
  defensa (se mantiene además como segunda capa).

## Consecuencias
- (+) Un error de código no alcanza para leer datos de otro tenant.
- (+) La API no puede alterar el esquema ni saltear políticas.
- (−) Toda consulta exige transacción con `SET LOCAL`; tareas globales (job de borrado)
  necesitan un camino explícito y auditado.
- (−) Hay que probar contra PostgreSQL real; el almacén en memoria no prueba RLS.

## Verificación
- Pruebas de integración contra PostgreSQL 16 real con `vc_api`:
  sin `app.tenant_id` → SELECT da 0 filas e INSERT falla; con tenant A no se leen ni
  modifican filas de B; `INSERT` con `tenant_id` de B estando en A falla por `WITH CHECK`.
- Consulta de catálogo: toda tabla con columna `tenant_id` tiene `relrowsecurity` y
  `relforcerowsecurity` en true; `vc_api` tiene `rolbypassrls = false`.
- Prueba de arranque con rol indebido (dueño o BYPASSRLS) → la API no levanta.
- Prueba del job de retención con reloj falso.

## Supuestos
- TLS entre API y base: requerido en producción, NO probado todavía.
- Plazos de retención y alcance de ARCO: a validar con abogado.
- Copias de seguridad cifradas y su retención: se definen en T29.
