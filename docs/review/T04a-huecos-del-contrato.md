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
| C7 | Tarea global de retención: el ADR 0004 pide "camino explícito y auditado" sin decir cuál. | Función `vc.tenants_para_retencion()` `SECURITY DEFINER` del dueño que devuelve **solo ids**; después se borra tenant por tenant con `SET LOCAL`. Constancia en `vc.registro_borrados` (solo cantidades). | seg: revisar en T43. |
| C8 | `ADR 0001` nombra `adaptadores/stt` etc.; `ADR 0003` nombra los puertos `Transcriptor`, `Extractor`, `Sintetizador`, `Mensajeria`. | Puertos en `internal/proveedores`, falsos en `internal/proveedores/falsos`. Firmas provisorias hasta fijar streaming (T25, eventos no congelados). | arq. |
