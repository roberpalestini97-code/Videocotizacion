# ADR 0003 — Proveedores externos reemplazables (STT, LLM, TTS, WhatsApp)

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01)

## Contexto
Los servicios de IA cambian de precio, calidad y condiciones con frecuencia; casi todos están
fuera de Argentina (transferencia internacional de datos, Ley 25.326 — a validar con abogado)
y Rober todavía no definió cómo los paga ni el gasto máximo mensual. No hay proveedor elegido
con costos verificados (eso es T13). El producto no puede quedar atado a uno.

## Decisión
1. Un puerto Go por capacidad, con tipos propios del dominio (nunca tipos del SDK del
   proveedor en la firma):
   - `Transcriptor` (audio en streaming → parciales y finales, idioma es-AR).
   - `Extractor` (transcripción + fotogramas opcionales → JSON validado, ver 0002).
   - `Sintetizador` (texto → audio + marcas de tiempo opcionales para visemas).
   - `Mensajeria` (armado del enlace `wa.me`; sin envío automático por ahora, ver 0006).
2. Cada puerto tiene: adaptador falso (determinista, fallas inyectables) y adaptador real
   seleccionable por configuración (`PROVEEDOR_STT=...`). Producción rechaza los falsos.
3. Cada llamada a un proveedor lleva: tiempo límite, reintento acotado solo en errores
   transitorios, cortacircuito por proveedor y medición de consumo (segundos de audio,
   tokens, caracteres) por tenant para cuotas y costos (0005).
4. Los prompts y el esquema de salida están versionados en el repositorio (`conductas/`),
   no en la consola del proveedor; la versión usada se guarda con cada cotización.
5. Minimización: al proveedor se manda solo lo necesario para el turno; nada de identificadores
   del cliente ni del tenant. Se prefieren opciones del proveedor sin retención/entrenamiento
   con los datos, cuando existan (a confirmar por proveedor).
6. Elegir o cambiar de proveedor es una decisión registrada (anexo o ADR nuevo) con costo por
   minuto medido, fuente y fecha.

## Alternativas consideradas
- Un solo proveedor "todo en uno" (voz a voz): menos piezas, pero sin control de montos y con
  dependencia total; descartado por ahora (ver 0002).
- Modelos propios en la VM: sin costo por uso, pero la VM inicial no tiene GPU y la calidad
  en español rioplatense es incierta; se reevalúa con datos.
- Integrar SDKs directamente en el dominio: más rápido al inicio, caro de cambiar.

## Consecuencias
- (+) Cambiar de proveedor no toca dominio ni contrato público.
- (+) Pruebas sin costo ni red; se pueden simular caídas.
- (−) El mínimo común entre proveedores puede dejar sin usar funciones propias de alguno.
- (−) Hay que mantener un adaptador por proveedor y su prueba de conformidad.

## Verificación
- Batería de conformidad por puerto que corre contra el falso y, en un job manual con
  credenciales, contra el real.
- Prueba: con el cortacircuito abierto, la sesión cierra con motivo `error_proveedor` y el
  cliente ve un mensaje claro (no un cuelgue).
- Prueba: el payload enviado al proveedor (capturado por el falso) no contiene `tenant_id`,
  teléfono, nombre ni el código de referencia.
- Revisión de imports: ningún paquete de dominio importa SDKs de proveedores.

## Supuestos
- Ningún proveedor está elegido; no hay precios en este ADR (sin precios inventados).
- Forma de pago al exterior y gasto máximo mensual: pendientes de Rober.
- La transferencia internacional de datos de voz e imagen queda "a validar con abogado".
