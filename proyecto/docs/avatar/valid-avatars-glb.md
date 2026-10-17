# Avatares VALID (c-frame/valid-avatars-glb)

Demo local con personajes 3D de la biblioteca [VALID](https://github.com/xrtlab/Validated-Avatar-Library-for-Inclusion-and-Diversity---VALID), convertidos a GLB en [c-frame/valid-avatars-glb](https://github.com/c-frame/valid-avatars-glb) (**licencia MIT**).

## CDN (por defecto)

El front carga los GLB desde jsDelivr, commit fijado en `real-time-quote-bot/src/lib/avatar-motor/valid-avatars/catalogo.ts`:

`https://cdn.jsdelivr.net/gh/c-frame/valid-avatars-glb@c539a28/`

Override opcional en `.env.local`:

```env
VITE_VALID_AVATARS_BASE=https://cdn.jsdelivr.net/gh/c-frame/valid-avatars-glb@c539a28/
```

## Tres demos (semilla `SEMILLA_LOCAL=1`)

| Enlace | Panel | `avatar_id` | GLB |
|--------|-------|-------------|-----|
| `/c/demoLocalVideocotiz001` | `demo@videocotizacion.local` | `av_valid_laura` | `Hispanic/Hispanic_F_2_Util.glb` |
| `/c/demoLocalVideocotiz002` | `demo2@videocotizacion.local` | `av_valid_tito` | `Asian/Asian_M_1_Util.glb` |
| `/c/demoLocalVideocotiz003` | `demo3@videocotizacion.local` | `av_valid_juan` | `White/White_M_3_Medi.glb` |

Contraseña panel (los tres): `frase-larga-de-demo-0`. Recuperación (Laura): `DEMO-LOCA-2026`.

## Labios

Los GLB usan morphs `h_expressions.*` en la malla `H_DDS_HighRes` (no visemas Oculus). El motor mapea los visemas del backend a esos morphs; ver `pesosValid` en `blendshapes.ts`.

## Cambiar personaje

Editar entradas en `catalogo.ts` (paths relativos al `avatars.json` del repo upstream). No commitear GLB de terceros sin revisar licencia.

## Atribución

- VALID / XRT Lab (origen académico de la biblioteca).
- Conversión GLB: c-frame/valid-avatars-glb (MIT, copyright Tiffany Do en LICENSE del repo).
