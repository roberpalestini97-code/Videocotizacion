# ADR — VideoCotización

Registro de decisiones de arquitectura. Fuente de verdad superior: `docs/BRIEF.md`; si un ADR
lo contradice, manda el BRIEF y el ADR se corrige. Todos los ADR están en **Propuesto** hasta
que los revise un modelo distinto del autor, con seg como co-revisor (equivalente a T24).

## Índice

| ADR | Título | Estado | Módulos afectados |
|---|---|---|---|
| [0001](0001-backend-go-modular.md) | Backend Go modular (puertos y adaptadores, proveedores falsos) | Propuesto | backend |
| [0002](0002-pipeline-de-voz.md) | Pipeline de voz, LLM extractor, precio en Go y `siguiente_paso` | Propuesto | backend, contracts, conductas, avatar |
| [0003](0003-proveedores-reemplazables.md) | Proveedores externos reemplazables | Propuesto | backend, infra |
| [0004](0004-persistencia-postgresql-rls.md) | PostgreSQL 16 con RLS forzada, roles y retención | Propuesto | backend, infra |
| [0005](0005-multi-cliente-api-vendible.md) | Multi-cliente y API vendible: tenants, claves, cuotas | Propuesto | backend, contracts, panel |
| [0006](0006-video-pizarron-whatsapp-panel.md) | Video, pizarrón, WhatsApp, enlace opaco, panel y antiabuso | Propuesto | todos |

Formato de cada ADR: Estado, Contexto, Decisión, Alternativas, Consecuencias, Verificación y
Supuestos. Sin precios inventados. Lo legal (Ley 25.326) va como "a validar con abogado".

## Preguntas abiertas

| # | Pregunta | Para | Bloquea |
|---|---|---|---|
| P1 | Avatar en navegador o en la VM | Rober | Resuelta por BRIEF (decisión 1: navegador + clips). Falta medir en equipos reales (T08) |
| P2 | Gasto máximo mensual en IA y forma de pagar proveedores del exterior | Rober | Elegir proveedores reales (0003, T13) |
| P3 | Abogado para Ley 25.326: plazos de retención, consentimiento de imagen, transferencia internacional, ARCO | Rober | Abrir al público (0004, 0006) |
| P4 | Dominio propio para `cotizar.<dominio>` y lista de Origin | Rober | TLS y Origin por tenant (0006, T29) |
| P5 | Visto a los enums de conductas y a los valores de `siguiente_paso` | Rober + cot | Congelar el esquema de salida (0002) |
| P6 | Los 2 valores de `siguiente_paso` que cambió T05 (detalle perdido) | cot | Conciliar 0002 con `conductas/` |
| P7 | Mecanismo del desafío `X-Desafio` (prueba de trabajo propia o proveedor) | arq + seg | Abrir `crearSesion` al público (T41) |
| P8 | Valores de `sin_voz_s`, duración máxima por llamada y cuota dinámica | Rober + ops | Configuración de producción |
| P9 | Validación del tarifario con un pintor y un jardinero | Rober | Activar precios en producción (0002) |
| P10 | Rehacer R33–R52 (T33), R53–R70 (T40) y Q1–Q8 de T33, perdidos en el incidente | seg | Revisión de 0004 y 0006 |
| P11 | Qué ve el cliente si no tiene o no habilita cámara | Rober | Texto de la pantalla de consentimiento |

## Cambios

- 2026-10-08 — Se rehacen 0001–0006 y este índice desde cero tras la pérdida del entorno, a
  partir de `docs/BRIEF.md` y `docs/respaldo-tablero.md` (T01, T32, T35, T37, T39, T40/T41).
  Novedades respecto de lo que se recuerda de la versión perdida:
  - 0002: `siguiente_paso` pasa a objeto `{accion, motivo, campos}`; `fuera_de_zona` permite
    emitir (corrige el error hallado en T24); cantidades normalizadas a enteros (N1 de T16).
  - 0004: se explicitan arranque seguro, registro de lecturas y "no se guardan fotogramas ni
    audio".
  - 0006: se incorporan como decisión las condiciones de seguridad de T40 que T41 debía
    aplicar (Origin por tenant, `sin_voz_s`, motivos de cierre, contacto con aviso y
    consentimiento, clave pública + desafío, registro de lecturas). Requiere revisión de seg.
- 2026-10-09 — T44 (contrato 0.1.5-borrador), a partir de la revisión de T04b parte 1 y los huecos B/C:
  - 0002: presupuesto como rango min–max con `precio_final_centavos` opcional (B1); versión
    del tarifario `tarifas-<año>@<version>` (B2).
  - 0004: contadores de consumo que no borra la retención ni el ARCO (§10, H2); retención por
    tenant por CLI (C6); retención de asesores y de consentimientos queda **pendiente de
    Rober/abogado** con opciones y recomendación (§8; H4 de T43, C2); C7 en Consecuencias.
  - 0005: dónde vive cada tope y reserva atómica (§4, H3/B3); orden de los límites (§5, H1);
    consumo (§6); IP, IPv6 y una sola instancia con candado (§9, B4/H6); operación por CLI (§10,
    B8/C5/C6); CORS (§11, B6); `Retry-After` calculado (§12, H4).
- Pendiente: revisión independiente (rev + seg) antes de pasar a Aceptado.
