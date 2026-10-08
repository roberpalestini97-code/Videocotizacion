# T04a — Huecos del contrato y de los ADR detectados por go (2026-10-08)

Autor: go. No se tocó `contracts/` ni `docs/adr/`: cada hueco queda para arq (y seg cuando corresponde).

| # | Hueco | Qué hizo go mientras tanto | Decide |
|---|---|---|---|
| C1 | `openapi.yaml` no tiene `/salud` ni `/listo` (ni esquema de respuesta). | `GET /salud` → 200 `{"estado":"ok"}`; `GET /listo` → 200 `{"estado":"listo"}` o 503 `problem+json` `servicio_no_disponible` con `Retry-After`. Sin detalles internos. | arq: ¿se agregan al contrato o quedan como rutas de operación fuera de `/v1`? |
| C2 | **Retención de consentimientos vs. consulta.** El ejemplo de `leerRetencion` propone `consulta_y_presupuesto` 365 días y `consentimientos` 730 días, pero hoy el consentimiento cuelga de la sesión (FK con `ON DELETE CASCADE`) y `dominio.NuevoConsentimiento` le copia el vencimiento de la sesión: se borran juntos. | Se borran juntos (mismo plazo). La API no tiene `DELETE` sobre `vc.consentimientos` (R12). | arq + seg (+ abogado, P3): si el consentimiento tiene que sobrevivir a la consulta como prueba, hace falta otra migración (sin cascada, con su propio vencimiento y sin datos de la consulta). |
| C3 | `ItemCotizacion` del contrato tiene un solo `precio_unitario_centavos`; el dominio guarda rango min/max (el tarifario solo tiene rangos). | Persistencia con columnas `*_min_centavos` y `*_max_centavos`. | arq en T04b (ya anotado en `dominio`). |
| C4 | El catálogo no tiene un código para "duplicado" / conflicto genérico. | Duplicados (tenant, asesor, sesión, consentimiento o cotización repetidos) → `estado_invalido` (409). | arq: confirmar o agregar código. |
| C5 | `perfil_asesor` tiene plazo en la tabla de retención, pero el puerto `almacen` no define borrado de asesores (ni ARCO del asesor). | `asesores.borrar_despues_de` existe; `BorrarVencidos` no borra asesores. | arq/T27. |
| C6 | La tabla de retención del contrato es un ejemplo fijo; no hay fuente de configuración por tenant de los plazos. | `tenants.retencion_dias` (1..3650) se usa al crear la sesión. | arq + Rober (abogado). |
| C7 | Tarea global de retención: el ADR 0004 pide "camino explícito y auditado" sin decir cuál. | Función `vc.tenants_para_retencion()` `SECURITY DEFINER` del dueño que devuelve **solo ids**; después se borra tenant por tenant con `SET LOCAL`. Constancia en `vc.registro_borrados` (solo cantidades). Endurecida y verificada al arrancar (H3 de T43). **Consecuencia aceptada por rev en T43: el proceso con el rol `vc_api` puede listar los ids de TODOS los tenants** (no otros datos). Este camino no se expone por HTTP. | **arq: pasarlo al ADR 0004** (sección Consecuencias). |
| C8 | `ADR 0001` nombra `adaptadores/stt` etc.; `ADR 0003` nombra los puertos `Transcriptor`, `Extractor`, `Sintetizador`, `Mensajeria`. | Puertos en `internal/proveedores`, falsos en `internal/proveedores/falsos`. Firmas provisorias hasta fijar streaming (T25, eventos no congelados). | arq. |

## H4 de T43 — Retención de asesores y `consentimientos.borrar_despues_de` (NO lo decide go)

Hoy: `vc.asesores` (email, WhatsApp) tiene `borrar_despues_de` pero nada lo borra; `vc.consentimientos.borrar_despues_de` no se evalúa (el consentimiento muere con su sesión por la cascada); una cotización con plazo mayor que su sesión se borra antes de su fecha. **Mientras no se decida, go no borra asesores.** Decide arq + seg + Rober (con abogado, P3).

**Asesores**
- **Opción A — borrado programado.** El job borra asesores vencidos. Como `sesiones` referencia al asesor, hay que elegir: (A1) borrar en cascada sus sesiones, consultas y presupuestos (se pierde el historial del backoffice antes de su plazo); o (A2) anonimizar al asesor (vaciar nombre, email, WhatsApp; dejar el id) y conservar sus sesiones hasta su propio plazo. A2 necesita columnas nullable o valores marcadores y que el panel lo muestre como "asesor dado de baja".
- **Opción B — solo por ARCO o baja explícita.** El asesor se borra/anonimiza solo cuando pide la supresión o el tenant lo da de baja; se quita `borrar_despues_de` de `asesores` (o queda solo como fecha informativa) y el ADR 0004 §8 lo dice. Más simple; depende de que el tenant pida la baja.

**Consentimientos**
- **Opción C — mismo plazo que la consulta (lo de hoy).** Se elimina la columna `consentimientos.borrar_despues_de` (o un CHECK la iguala a la de la sesión). Consecuencia: si la consulta se borra a los 365 días, también se pierde la prueba del consentimiento, contra el ejemplo del contrato (730 días).
- **Opción D — el consentimiento sobrevive a la consulta.** Sin cascada: FK `ON DELETE SET NULL` o sin FK a sesiones, solo con datos mínimos (versión del aviso, fecha, id); el job lo borra por su propia fecha. Consecuencia: hay que asegurar que no quede ningún dato personal enlazable y abrir un DELETE controlado (hoy la API no tiene DELETE en consentimientos, R12).

**Cotizaciones**: en cualquier opción conviene un CHECK o trigger que impida `cotizaciones.borrar_despues_de > sesiones.borrar_despues_de` (o retirar la columna), para que la fecha guardada no mienta.
