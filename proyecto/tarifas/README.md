# Tarifario 2026 (provisorio)

**Estado: `referencia_publica_sin_validar`. NO es de producción.** No se puede activar hasta que lo valide un pintor y un jardinero reales. Está hecho para ser reemplazado por los presupuestos de los profesionales de Rober.

Consultado el 2026-10-08. Archivos:

- `tarifas-2026.json`: los datos.
- `verificar.mjs`: validador (Node, sin dependencias).
- Este README.

## Qué contiene

- 47 tareas en 4 oficios (pintura, jardinería, reparaciones, limpieza). 34 tienen rango de precio y 13 están en `null` con el motivo en `motivo_null`. Los `null` son a propósito: no hay fuente pública clara y no se inventó nada.
- Montos en **ARS, centavos `int64`**, sin floats. Cada tarea con precio trae `min_centavos`, `max_centavos`, `confianza` y los `puntos` (qué dijo cada fuente, para qué zona).
- `fuentes`: URL, publicador, fecha de publicación y fecha de consulta de cada una.
- `factores_ajuste`: recargos en puntos básicos enteros (`2000` = +20%). Solo **altura de más de 2,60 m** (+20% a 30%) y **materiales si los pone el profesional** (+25% a 40%) tienen valor. **Zona de la costa, urgencia, humedad/enduido, temporada y traslado están en `null`** porque no hay fuente.
- `referencias_salariales_convenio`: escala UOCRA por hora (con jornal de 8 h), mínimo de casas particulares y UATRE. Son sueldos de convenio, **no precios de venta**: sirven como piso de costo laboral.

## Cómo se usa

1. El backend (Go) lee el JSON y calcula el precio en centavos `int64`: cantidad por rango de la tarea, más los recargos que apliquen. **El LLM no pone montos**: solo extrae la tarea, la cantidad y las condiciones (altura, estado de paredes).
2. Mostrarle al cliente un **rango orientativo**, nunca un número exacto. No hay precio central definido: no lo inventes.
3. Si una tarea es `null` (por ejemplo pintura en altura de edificios, corte de césped por m², mantenimiento de parque grande), el sistema no debe dar precio: derivar a que el profesional cotice por WhatsApp.
4. Con `confianza: "baja"` (un solo portal o puras estimaciones del portal), mostrar el rango con aclaración.
5. Respetar `estado` y `uso_en_produccion`: mientras sean los actuales, usarlo solo en demo y pruebas.

## Cómo se reemplaza con los presupuestos reales

Por cada tarea, agregar los presupuestos del profesional como nuevos `puntos` con una fuente de `tipo: "presupuesto_profesional"` (con fecha y zona real: Mar Chiquita, Cobo, Santa Clara o Parque Lago) y quitar los puntos de portales. Después, completar los `null` y los factores de zona y urgencia. Cuando lo validen un pintor y un jardinero, recién ahí cambiar `estado`, `validado_por_profesional` y `uso_en_produccion`. Correr `node verificar.mjs` antes de cada cambio; sale con código 1 si hay fallas.

## Qué NO es

- **No hay fuente oficial ni de cámara o colegio de la costa.** Se buscó y no apareció nada público con precios de oficio por m² de esa zona.
- Casi todo viene de **un portal comercial (Servidos)** que no explica su metodología y que marca varias cifras como "estimación propia a falta de una fuente de mercado confiable". Esas cifras figuran con `estimacion_propia_del_portal: true`.
- Los precios son de **CABA, Mar del Plata (estimado por el portal desde CABA) y Venado Tuerto (UTN, febrero 2026)**. Ninguno es Mar Chiquita, Cobo, Santa Clara ni Parque Lago.
- Hay una discrepancia sin resolver en las notas de prensa sobre la escala UOCRA (Infobae vs iProfesional). Se usaron Perfil (septiembre) y Servidos citando CAMARCO (octubre); no se pudo abrir la fuente primaria.
- Los valores de UTN son de febrero 2026: hay que actualizarlos por inflación antes de compararlos con los de octubre.

## 10 preguntas de validación (para un pintor y un jardinero)

Al pintor:

1. Latex interior, dos manos, solo mano de obra: ¿qué cobrás hoy por m² en Mar Chiquita, Cobo, Santa Clara o Parque Lago? ¿Cambia si es temporada alta?
2. ¿Cobrás por m², por ambiente o por jornal? ¿Cuánto es tu jornal y cuántos m² rendís por día?
3. Exterior y fachada: ¿qué cobrás por m² y cuándo cotizás aparte el andamio o el balancín?
4. Trabajos en altura: ¿qué recargo aplicás (más de 2,60 m, escalera, andamio, soga o balancín) y desde qué altura cotizás distinto? El tarifario solo tiene +20% a 30% sin validar.
5. ¿Cuánto sumás por enduido total, humedad o techos altos, y cómo lo decidís mirando por videollamada?

Al jardinero:

6. Corte de césped: ¿cobrás por m², por hora o por visita? ¿Cuánto para un terreno de 300, 1.000 y 5.000 m², con y sin desmalezadora?
7. Mantenimiento de un parque grande (tipo Parque Lago o Cobo): ¿cómo lo cotizás por mes y qué incluye?
8. Poda y tala: ¿qué cobrás por arbusto, cerco, árbol mediano y árbol grande, y con qué dificultad sube el precio (altura, cerca de cables, acceso)?
9. ¿Cuánto es tu jornal y qué le sumás por traslado entre localidades?

A los dos:

10. ¿Qué recargo ponés por urgencia, por zona más lejana y por temporada de verano, y qué datos necesitás ver en la videollamada para dar un precio sin ir a la casa?
