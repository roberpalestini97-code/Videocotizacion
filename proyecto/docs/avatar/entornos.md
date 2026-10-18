# T46 · Entornos para los avatares (oficina y plaza)

Hoy los asesores 3D (VALID) flotan sobre un degradé liso. Objetivo: que se vean
sentados en un lugar real, como en una videollamada. Laura y Juan en una oficina,
Tito (jardinería) en una plaza.

## Enfoque

El encuadre es de busto (cabeza y hombros, `Avatar3D.aplicarCamara`), así que lo que
se ve del lugar es el fondo detrás de la cabeza y la parte alta de la silla. Por eso:

1. **Fondo e iluminación desde HDRI** (Poly Haven, licencia CC0, sin atribución):
   - Oficina: `hotel_room` (sector escritorio y ventanal; se gira el fondo para no ver la cama).
   - Plaza: `greenwich_park_02` (árbol grande, sendero, luz de día).
   - **Luz:** el `.hdr` de 1k es `scene.environment` (luz y reflejos que coinciden con el
     lugar). Las luces de estudio bajan para no "lavar" la escena.
   - **Fondo:** una vista en perspectiva del mismo lugar recortada del panorama 8k y apenas
     desenfocada (`oficina.jpg`, `plaza.jpg`, ~40 y ~120 KB), ajustada a "cover" según el
     lienzo. Primero se probó el HDRI de 1k como fondo con `backgroundBlurriness`: con el
     plano de busto (fov 28°) se veía como una mancha de baja resolución.
   - Todo en `real-time-quote-bot/public/entornos/` (no dependemos del CDN de Poly Haven en
     producción). Se regenera con `node scripts/generar-fondos-entornos.mjs`.
2. **Sentado:**
   - Oficina: respaldo alto de silla de escritorio (procedural, tela oscura) detrás de los hombros.
   - Plaza: sin respaldo. Con el plano de busto la cámara ve de y ≈ −0,18 a +0,30 detrás
     de la cabeza y el respaldo de un banco queda debajo de los hombros: no se vería.
3. **Catálogo:** cada avatar VALID declara su `entorno` en `valid-avatars/catalogo.ts`
   (`oficina` | `plaza`). Sin entorno o si falla la carga del HDRI, se queda el degradé de
   siempre (no se rompe la llamada).
4. **Rendimiento (celular):** HDRI de 1k (~1,5 MB), PMREM una sola vez por llamada, el
   desenfoque lo hace three al muestrear el PMREM (sin pasada extra).
5. **Fotos de los asesores:** se regeneran con `node scripts/generar-fotos-avatares.mjs`
   para que el retrato muestre el mismo lugar.

## Hecho = verificado

- [x] `Avatar3D.usarEntorno()`; si falla la carga, `avatar-vivo-navegador` lo loguea y queda el degradé.
- [x] Catálogo con entorno por avatar y tests (`entornos.test.ts`, también el ajuste "cover").
- [x] Capturas headless de los tres avatares con su entorno (las mismas fotos del retrato).
- [x] typecheck, vitest 174, build `NITRO_PRESET=vercel` (incluye `public/entornos`).
- [ ] Prod: los tres asesores con fondo en la llamada (celular y PC).

## No incluido

- Cuerpo completo sentado (piernas, escritorio en primer plano): con plano de busto no
  se ve y costaría poses nuevas del esqueleto. Si se abre el plano, es otra tarea.
