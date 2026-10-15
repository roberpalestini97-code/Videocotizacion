// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Cambio a un GLB con blendshapes (T30). Se carga con GLTFLoader y se buscan las mallas que
 * tengan morph targets `viseme_*` (15 visemas, convención Oculus/RPM) o ARKit (`jawOpen`...).
 * El resto de Avatar3D no cambia: solo recibe otro ModeloAvatar.
 *
 * Requisitos del GLB (ver docs/avatar/spike-resultados.md §GLB):
 * - morph targets con nombres exactos `viseme_sil` … `viseme_U` (o ARKit 52);
 * - peso objetivo ≤ 3 MB comprimido (Draco/meshopt opcional) y ≤ ~30k triángulos;
 * - licencia que permita uso comercial y modificación.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { detectarEsquema, type MallaConMorphs } from './blendshapes';
import { parpadeo, type ModeloAvatar } from './procedural';

export function mallasConVisemas(raiz: THREE.Object3D): (THREE.Mesh & MallaConMorphs)[] {
  const out: (THREE.Mesh & MallaConMorphs)[] = [];
  raiz.traverse((o) => {
    const m = o as THREE.Mesh & MallaConMorphs;
    if ((m as THREE.Mesh).isMesh && detectarEsquema(m)) out.push(m);
  });
  return out;
}

export function modeloDesdeEscena(raiz: THREE.Object3D): ModeloAvatar {
  const mallas = mallasConVisemas(raiz);
  // Parpadeo por blendshape si existe (ARKit eyeBlinkLeft/Right).
  const conParpadeo = mallas.filter((m) => m.morphTargetDictionary && 'eyeBlinkLeft' in m.morphTargetDictionary);
  return {
    raiz,
    mallasVisemas: mallas,
    animarOcio(tMs) {
      const b = parpadeo(tMs);
      for (const m of conParpadeo) {
        const d = m.morphTargetDictionary!;
        const inf = m.morphTargetInfluences!;
        for (const k of ['eyeBlinkLeft', 'eyeBlinkRight']) {
          const i = d[k];
          if (i !== undefined) inf[i] = b;
        }
      }
    },
    liberar() {
      raiz.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const ms = Array.isArray(m.material) ? m.material : [m.material];
        ms.forEach((x) => x.dispose());
      });
    },
    estadisticas() {
      let triangulos = 0;
      let mallasN = 0;
      raiz.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        mallasN++;
        const g = m.geometry;
        triangulos += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      });
      return {
        triangulos,
        mallas: mallasN,
        morphTargets: mallas.reduce((s, m) => s + (m.morphTargetInfluences?.length ?? 0), 0),
      };
    },
  };
}

/**
 * Normaliza una URL de Ready Player Me (`https://models.readyplayer.me/<id>.glb`):
 * si no trae `morphTargets`, le agrega los visemas de Oculus + ARKit (necesarios para el
 * lip-sync) y un atlas de texturas liviano. Para cualquier otra URL la devuelve igual.
 * Así el usuario pega el link "pelado" del avatar y el lip-sync funciona solo.
 */
export function normalizarUrlRPM(url: string): string {
  if (!url) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url; // relativa o inválida: no tocar
  }
  if (!/(^|\.)readyplayer\.me$/i.test(u.hostname) || !/\.glb$/i.test(u.pathname)) return url;
  if (!u.searchParams.has('morphTargets')) u.searchParams.set('morphTargets', 'Oculus Visemes,ARKit');
  if (!u.searchParams.has('textureAtlas')) u.searchParams.set('textureAtlas', '1024');
  if (!u.searchParams.has('lod')) u.searchParams.set('lod', '1');
  return u.toString();
}

/** Carga un GLB desde URL (mismo origen o CORS) y lo envuelve como ModeloAvatar. */
export async function cargarModeloGLB(url: string): Promise<ModeloAvatar> {
  const gltf = await new GLTFLoader().loadAsync(normalizarUrlRPM(url));
  const modelo = modeloDesdeEscena(gltf.scene);
  if (modelo.mallasVisemas.length === 0) {
    modelo.liberar();
    throw new Error('El GLB no tiene morph targets viseme_* ni ARKit (jawOpen)');
  }
  return modelo;
}

/** Igual que cargarModeloGLB pero desde bytes (pruebas de ida y vuelta en el smoke). */
export async function cargarModeloGLBDesdeBytes(bytes: ArrayBuffer): Promise<ModeloAvatar> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  return modeloDesdeEscena(gltf.scene);
}
