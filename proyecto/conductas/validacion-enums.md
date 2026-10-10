# Validación de enums con un técnico real (T05)

Estado: **pendiente**. Ninguna respuesta todavía. Los enums de `esquema-salida-llm.schema.json`
los propuso cot sin datos de campo.

## Visto de Rober
- [ ] Rober revisó los enums (`oficio`, `trabajo.tipo`, `unidad`, `estado_superficie`,
      `zona.localidad`, `tipo_cliente`, `plazo.tipo`, `siguiente_paso.accion`) — **pendiente** (P5).
- Fecha: ____ · Comentarios: ____

## 10 preguntas para un pintor y un jardinero de la zona
1. ¿Qué trabajos te piden más seguido que no están en la lista de `trabajo.tipo`? (p. ej.
   hidrolavado, enduido completo, tratamiento de hongos, cercos vivos, colocación de césped en panes)
2. ¿En qué unidad cotizás cada trabajo: m², metro lineal, por ambiente, por árbol, por jornada
   o por visita? ¿Hay alguno que cotizás "por bulto" sin medir?
3. ¿A partir de qué altura dejás la escalera y armás andamio o usás silleta? ¿Cuándo hace
   falta hidroelevador?
4. ¿Qué estados de superficie cambian el trabajo y cuáles dan lo mismo? (bueno, regular,
   malo, humedad, descascarado, hongos, salitre, ¿falta alguno?)
5. ¿Qué localidades atienden sin recargo y cuáles con traslado? ¿Mar del Plata, Vivoratá,
   Camet Norte, Mar de Cobo vs. Cobo pueblo?
6. ¿Qué tipos de cliente distinguen en la práctica (particular, dueño que no vive acá,
   consorcio, inmobiliaria, comercio, constructora)? ¿Falta alguno?
7. ¿Qué señales te dicen que el cliente está apurado de verdad y cuándo es "apuro" de
   negociación?
8. ¿Qué trabajos nunca cotizarías sin ver en persona o sin plano?
9. ¿Desde cuántas semanas de anticipación el precio deja de ser confiable por inflación de
   materiales y mano de obra?
10. ¿Qué no hacen nunca (gas, electricidad, estructura, techos de chapa) y a quién derivan?

## Respuestas
| # | Pintor | Jardinero | Cambio propuesto al esquema |
|---|---|---|---|
| 1–10 | pendiente | pendiente | — |
