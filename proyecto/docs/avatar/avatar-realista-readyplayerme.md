# Avatar realista (Ready Player Me) — cómo activarlo

Pasamos del muñeco procedural (esferas por código) a un **humano 3D realista** con lip-sync,
manteniendo el **casco de obra**. El motor (`Avatar3D`) no cambia de interfaz: solo recibe un
modelo GLB en vez del procedural, y cae de nuevo al procedural si algo falla.

## 1. Crear el avatar

1. Entrá a <https://readyplayer.me> y creá tu avatar (cara, peinado, ropa; es gratis y permite
   uso comercial). Elegí un look **profesional / de obra** — la ropa va acá; el **casco** lo
   agrega el front encima (RPM no trae cascos).
2. Copiá el link del modelo, que termina en `.glb`. Queda así:
   `https://models.readyplayer.me/TU_ID.glb`

No hace falta agregarle nada al link: el front le suma solo los visemas
(`?morphTargets=Oculus Visemes,ARKit`), que son los que mueven la boca.

## 2. Enchufarlo en el front

En `real-time-quote-bot/.env.local` (copiá de `.env.example` si no existe):

```
VITE_AVATAR_GLB_URL=https://models.readyplayer.me/TU_ID.glb
VITE_AVATAR_CASCO=1     # 0 para verlo sin casco
```

Reiniciá el dev server. En la videollamada: arranca con el procedural y, en cuanto baja el
GLB, lo reemplaza en caliente (cara realista, parpadeo, boca sincronizada). Si no hay red,
el GLB no tiene visemas o el equipo no tiene WebGL, se queda con el procedural (no se rompe).

## 3. Previsualizar antes (spike)

Sin tocar el front, en `proyecto/avatar-spike` (`npm run dev`):

```
demo.html?glb=https://models.readyplayer.me/TU_ID.glb        # con casco
demo.html?glb=https://models.readyplayer.me/TU_ID.glb&casco=0 # sin casco
```

## Qué quedó hecho

- `src/lib/avatar-motor/modelo/glb.ts` — carga GLB + `normalizarUrlRPM` (agrega los visemas).
- `src/lib/avatar-motor/modelo/obrero.ts` — casco de obra colgado del hueso `Head` y encuadre
  retrato (cabeza + hombros).
- `Avatar3D` — carga el GLB en segundo plano con fallback, y luz de estudio PBR
  (RoomEnvironment/PMREM + ACES + key/fill/contraluz) que mejora los dos modelos.
- Config `VITE_AVATAR_GLB_URL` / `VITE_AVATAR_CASCO`.

## Ajustes finos

Los visemas vienen de ARKit (ya mapeados en `blendshapes.pesosArkit`). Si con tu avatar el
**casco** queda un poco alto/bajo o chico/grande, se ajusta en `obrero.ts` (`agregarCascoObra`:
`radioCabeza` y `offset`), o lo apagás con `VITE_AVATAR_CASCO=0`. Requisitos del GLB para que
rinda en gama baja: ≤ ~30k triángulos y ≤ ~3 MB; RPM con `textureAtlas=1024&lod=1` (que el
front ya pide) queda liviano.

## Pendiente (T30 "modelo propio")

RPM es el camino rápido y de buena calidad. Si más adelante querés un **modelo 100% propio**
(marca, personaje a medida), se exporta a GLB con los mismos visemas (`viseme_*` Oculus o los
52 de ARKit) y entra por la misma `VITE_AVATAR_GLB_URL`, sin tocar código.
