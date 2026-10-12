# ADR 0007: Motor de cotización escalable y personalizable

## Estado

Propuesto

## Contexto

El precio orientativo lo calcula **Go** desde `tarifas/tarifas-2026.json` (ADR 0002). El LLM solo extrae trabajo, medidas y condiciones. Hoy las reglas que unen `trabajo.tipo` (salida del modelo) con `tarea` del tarifario viven **hardcodeadas** en `internal/cotizador/cotizador.go`, mientras los montos ya están versionados en JSON.

Para crecer a más oficios, tenants y **precios propios de cada profesional** (T26, P-tarifas), hace falta:

1. **Escalar** sin redeploy por cada regla nueva: datos declarativos + intérprete pequeño en Go.
2. **Personalizar** después: capas de precio (base pública → overlay del profesional/tenant) sin que el LLM toque montos.

Las referencias de **mano de obra 2026 en Argentina** (UOCRA Zona A sep/oct 2026, casas particulares, UATRE rural, UTN Venado Tuerto feb 2026) están en `referencias_salariales_convenio` del tarifario. Son **pisos salariales de convenio**, no precios de venta al cliente; sirven para validar coherencia y para futuros mínimos por jornal/rendimiento, no para fijar el rango publicado sin fuente de mercado.

## Decisión

### Capas (orden de aplicación futuro)

| Capa | Contenido | Estado |
|------|-----------|--------|
| 1 | Tarifario base (`tarifas-2026.json`: tareas, factores con valor, reglas de mapeo) | Activo en demo |
| 2 | Overlay por profesional/tenant (puntos `presupuesto_profesional`, recargos de zona/urgencia validados) | Diseñado; persistencia en PostgreSQL por tenant (0005) |
| 3 | Ajuste manual puntual (bitácora, no en LLM) | Fuera de alcance MVP |

El cálculo en producción sigue siendo **determinista, enteros en centavos, sin floats**.

### Datos: `motor_cotizacion` en el JSON de tarifas

Se agrega el bloque `motor_cotizacion` (versión `0.1.0`) con:

- `reglas_trabajo[]`: mapeo `trabajo_tipo` → tarea del tarifario (`fija`, `umbral_m2`, `medio_altura`).
- `localidades`: mapa slug LLM → zona del contrato.
- `capas_precio`: documentación de personalización (overlay aún no implementado en Go).
- `coherencia_mano_obra_2026`: rendimientos **referenciales** (no validados) para contrastar precio/m² contra jornal UOCRA; **no modifica** el precio emitido.

Go **carga** estas reglas al parsear el tarifario. Si falta `motor_cotizacion`, usa reglas embebidas equivalentes a las anteriores (tests mínimos).

### Intérprete en Go

Tipos de regla soportados (extensible):

- `fija`: una `tarea_id`.
- `umbral_m2`: elige tarea según suma de m² (ej. césped ≤100 m² vs mayor).
- `medio_altura`: deriva tarea según `altura.medio` (silleta/hidroelevador → tarea sin precio pública).

La lógica de recargos (`factores_ajuste` con `min_bps`) y de ítems sigue en Go; solo los factores con valor numérico se aplican (sin inventar zona/urgencia).

### Mano de obra Argentina 2026 (criterio de diseño)

- **Precios de tarea**: rangos de portales/UTN en el tarifario; confianza baja/media según fuentes.
- **Piso laboral**: `referencias_salariales_convenio` (UOCRA oficial ~6468–6585 ARS/h oct 2026 en centavos; jornal 8 h derivado).
- **No se usa UOCRA como precio al cliente** para pintor independiente (Servidos y el propio tarifario lo aclaran).
- Tests de coherencia (`TestCoherenciaManoObra2026`): alertan si un m² mínimo implicaría menos de ~½ jornal al rendimiento referencial documentado; **no bloquean** el tarifario provisorio.

## Alternativas consideradas

- **Reglas solo en Go**: simple hoy, no escala a multi-tenant ni a edición por no-devs.
- **Motor en el LLM**: rechazado (ADR 0002, inyección, no determinismo).
- **Excel/CSV externo**: posible para overlay; el contrato interno sigue siendo JSON versionado + validador.

## Consecuencias

- Cambiar un mapeo trabajo→tarea pasa a ser PR en `tarifas-2026.json` + `node verificar.mjs`.
- Personalización real exige T26 (presupuestos profesionales), almacén por tenant (T04a/0005) y validación P9.
- Más oficios: nuevas entradas en `oficios[].tareas` + regla en `motor_cotizacion` + conducta/prompt.

## Verificación

- `node proyecto/tarifas/verificar.mjs`
- `go test ./internal/cotizador/...`
- Tablero: motor de cotización / T26 actualizado con lo probado.

## Supuestos

- Zona A UOCRA es proxy aceptable de piso laboral **orientativo** hasta validación local (costa atlántica).
- Rendimientos m²/jornal en `coherencia_mano_obra_2026` son placeholders hasta respuestas a las 10 preguntas de `tarifas/README.md`.
