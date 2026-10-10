# ADR 0004 — Persistencia: PostgreSQL 16 con RLS forzada, roles separados y retención

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01 y lo decidido en T04a). Ampliado
  2026-10-09 por T44 (§10 contadores de consumo, §8 retención pendiente, C7 en Consecuencias).

## Contexto
La API se vende a terceros (0005): un error de filtrado por cliente expondría consultas y
presupuestos de otro tenant. Se guardan datos personales (contacto, transcripción resumida,
datos extraídos), sujetos a la Ley 25.326 (a validar con abogado). Confiar solo en el
`WHERE tenant_id = ?` del código es frágil.

## Decisión
1. PostgreSQL 16. Toda tabla de negocio tiene `tenant_id uuid NOT NULL` (sin excepciones,
   salvo el catálogo de tenants y los topes y el contador **globales** de §10, que no tienen
   datos de ningún tenant y a los que `vc_api` no tiene privilegios directos) e índices que
   empiezan por `tenant_id`.
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
   - **Plazo por tenant (C6).** El plazo de cada tipo de dato configurable lo fija el operador
     por tenant con la CLI (`api tenant configurar`, ADR 0005 §10), dentro del rango que publica
     `leerRetencion` (`plazo_dias_min`–`plazo_dias_max`); la base lo refuerza con CHECK. No hay
     ruta HTTP para cambiarlo. Hoy existe `vc.tenants.retencion_dias` (consulta y presupuesto);
     los demás tipos usan el valor por defecto hasta que se cierre lo pendiente de abajo.
   - **Contadores de consumo**: fuera de la retención y del ARCO (§10).
   - **Pendiente de Rober/abogado (H4 de T43 y C2 de T04a). arq NO lo cierra.** Mientras tanto
     go no borra asesores y el consentimiento muere con su sesión (lo de hoy).
     *Asesores:* (A1) borrado programado en cascada con sus sesiones — pierde historial del
     backoffice antes de su plazo; (A2) anonimizar al asesor (vaciar nombre, email, WhatsApp,
     conservar el id) y dejar que sus sesiones venzan por su plazo — el panel lo muestra como
     "asesor dado de baja"; (B) borrar o anonimizar solo por ARCO o baja explícita
     (`api asesor baja`), sin `borrar_despues_de` automático. **Recomendación de arq: A2
     disparada por B** (la baja o el ARCO anonimizan; no hay vencimiento automático del perfil
     mientras el asesor trabaja), porque no rompe el historial ni deja datos de contacto de un
     ex asesor. Los contadores por asesor (§10) se borran con la anonimización (son datos de una
     persona identificable).
     *Consentimientos (C2: hoy el ejemplo dice 730 días y la consulta 365):* (C) mismo plazo que
     la consulta — se quita `consentimientos.borrar_despues_de` o un CHECK lo iguala; se pierde la
     prueba del consentimiento cuando se borra la consulta; (D) el consentimiento sobrevive con
     datos mínimos (versión del aviso, fecha, id opaco de sesión, sin FK en cascada) y vence por
     su propio plazo. **Recomendación de arq: D**, si el abogado confirma que la prueba del
     consentimiento debe durar más que la consulta; si no, C (más simple). En cualquier caso, un
     CHECK o trigger que impida `cotizaciones.borrar_despues_de > sesiones.borrar_despues_de`.
     Quien decide: Rober con el abogado (P3); arq + seg ajustan el contrato después.
9. Registro de lecturas: las lecturas de datos personales desde el panel se registran
   (quién, qué, cuándo), en tabla propia con RLS.
10. **Contadores de consumo (H2, T44).** El tope mensual NO se calcula sumando `vc.sesiones`
    (la retención y el ARCO las borran y el tope se "reiniciaba"). Se calcula con contadores
    propios, que contienen solo agregados:
    - `vc.consumo_mensual(tenant_id, mes, segundos_usados, segundos_reservados,
      simultaneas_en_curso, sesiones, cotizaciones_emitidas)`, PK `(tenant_id, mes)`, `mes` =
      mes calendario en hora argentina (UTC−3). Con RLS forzada como toda tabla con `tenant_id`.
      **No la borra la retención ni el ARCO** y vive mientras exista el tenant. Sin datos
      personales: no figura en `TablaRetencion`.
    - `vc.consumo_diario(tenant_id, fecha, segundos, sesiones, cotizaciones_emitidas)` para el
      detalle diario de `Consumo`; se conserva 13 meses (agregado, sin datos personales).
    - `vc.consumo_asesor_mensual(tenant_id, asesor_id, mes, …)` y su diario: datos de una persona
      identificable (el asesor); siguen la retención y el ARCO **del asesor** (§8), no los de las
      consultas. Borrarlos no baja el contador del tenant ni el global.
    - `vc.consumo_global_mensual(mes, segundos_usados, segundos_reservados, simultaneas_en_curso)`
      y `vc.topes_globales` (una fila): sin `tenant_id` (excepción de §1); `vc_api` no tiene
      ningún privilegio sobre ellas.
    - `vc.reservas_cupo(tenant_id, sesion_id PK, asesor_id, mes, segundos_reservados,
      creada_en, vence_en, liberada_en)` con RLS: una reserva por sesión (ADR 0005 §4).
    - Solo se modifican con dos funciones `SECURITY DEFINER` del dueño, con `search_path` fijo,
      sin EXECUTE a PUBLIC y verificadas al arrancar (como `buscar_clave`, incluido el cuerpo,
      H7 de T04b1): `vc.reservar_cupo(tenant, asesor, sesion, segundos_max)` y
      `vc.liberar_cupo(sesion, segundos_reales)`. Toman los tenant y asesor de los argumentos
      pero verifican que coincidan con `app.tenant_id`. Bloquean filas en orden fijo
      (global → tenant → asesor) dentro de la transacción del llamador. `vc_api` solo tiene
      SELECT sobre `consumo_mensual`, `consumo_diario` y los de asesor (para `leerConsumo`).
    - `liberar_cupo` corre en la MISMA transacción que cierra la sesión: suma los segundos
      reales (redondeo hacia arriba, nunca más que lo reservado) a usados, resta la reserva y la
      simultánea; es idempotente. Una reserva vencida sin liberar se cobra completa al
      encontrarla (en la próxima `reservar_cupo` o en el barrido de la tarea de retención).

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
- (−) **C7 de T04a (aceptado por rev en T43):** la tarea de retención usa
  `vc.tenants_para_retencion()` (`SECURITY DEFINER`, solo devuelve ids) y luego borra tenant por
  tenant con `SET LOCAL`; por eso el proceso con el rol `vc_api` puede listar los ids de TODOS
  los tenants (no otros datos). Este camino no se expone por HTTP; constancia en
  `vc.registro_borrados` con solo cantidades.
- (+) El tope mensual es duro aunque la retención sea corta o haya supresiones (H2).
- (−) Crece la lista de funciones `SECURITY DEFINER` (cuatro); cada una se verifica al arrancar.
- (−) El bloqueo de la fila global serializa las reservas de todos los tenants; a la escala
  actual (5 simultáneas) es irrelevante; se revisa si se vende a muchos tenants.

## Verificación
- Pruebas de integración contra PostgreSQL 16 real con `vc_api`:
  sin `app.tenant_id` → SELECT da 0 filas e INSERT falla; con tenant A no se leen ni
  modifican filas de B; `INSERT` con `tenant_id` de B estando en A falla por `WITH CHECK`.
- Consulta de catálogo: toda tabla con columna `tenant_id` tiene `relrowsecurity` y
  `relforcerowsecurity` en true; `vc_api` tiene `rolbypassrls = false`.
- Prueba de arranque con rol indebido (dueño o BYPASSRLS) → la API no levanta.
- Prueba del job de retención con reloj falso.
- H2: tenant con `retencion_dias=1`, tope 600 s, sesión de 600 s → 429; se avanza el reloj 48 h
  en el mismo mes y corre la retención → sigue 429 (prueba `TestREV_RetencionBorraConsumo` de
  rev, ambos almacenes). Lo mismo tras un ARCO de supresión (parte 2).
- `vc_api` no puede `UPDATE`/`DELETE` contadores ni leer/escribir los globales; las funciones de
  cupo rechazan un tenant distinto de `app.tenant_id`.

## Supuestos
- TLS entre API y base: requerido en producción, NO probado todavía.
- Plazos de retención y alcance de ARCO: a validar con abogado.
- Copias de seguridad cifradas y su retención: se definen en T29.
