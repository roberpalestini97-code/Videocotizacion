// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Aplicación de pesos de visemas a cualquier malla con morph targets (procedural o GLB).
 * Trabaja sobre la forma mínima {morphTargetDictionary, morphTargetInfluences} que tienen
 * los THREE.Mesh, así se prueba sin WebGL.
 */
import { VISEMAS, type Visema } from '../contrato/eventos';
import type { Pesos } from '../visemas/interpolacion';
import { FORMAS, NOMBRE_BLENDSHAPE, type Articulacion } from './formas';

export interface MallaConMorphs {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}

export type EsquemaBlendshapes = 'visemas' | 'arkit';

/** Detecta qué convención usa la malla: 15 `viseme_*` (Oculus/RPM) o ARKit (`jawOpen`, ...). */
export function detectarEsquema(m: MallaConMorphs): EsquemaBlendshapes | null {
  const d = m.morphTargetDictionary;
  if (!d) return null;
  const nVisemas = VISEMAS.filter((v) => NOMBRE_BLENDSHAPE(v) in d).length;
  if (nVisemas >= 5) return 'visemas';
  if ('jawOpen' in d) return 'arkit';
  return null;
}

/** Mezcla articulatoria ponderada por los pesos de visemas. */
export function articulacionMezclada(p: Pesos): Articulacion {
  const a: Articulacion = { mandibula: 0, ancho: 0, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 };
  for (const v of VISEMAS) {
    const w = p[v];
    if (!w) continue;
    const f = FORMAS[v];
    a.mandibula += w * f.mandibula;
    a.ancho += w * f.ancho;
    a.redondez += w * f.redondez;
    a.presion += w * f.presion;
    a.labioInferior += w * f.labioInferior;
    a.lengua += w * f.lengua;
  }
  return a;
}

const c01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Pesos ARKit equivalentes (para GLB que solo traen los 52 blendshapes de ARKit). */
export function pesosArkit(p: Pesos): Record<string, number> {
  const a = articulacionMezclada(p);
  const estirar = c01(a.ancho) * 0.6;
  return {
    jawOpen: c01(a.mandibula * 0.7),
    mouthClose: c01(a.presion * 0.3),
    mouthPressLeft: c01(a.presion * 0.7),
    mouthPressRight: c01(a.presion * 0.7),
    mouthFunnel: c01(a.redondez * 0.6),
    mouthPucker: c01(a.redondez * 0.8 + c01(-a.ancho) * 0.3),
    mouthStretchLeft: estirar,
    mouthStretchRight: estirar,
    mouthRollLower: c01(a.labioInferior * 0.7),
    mouthUpperUpLeft: c01(a.labioInferior * 0.3),
    mouthUpperUpRight: c01(a.labioInferior * 0.3),
    tongueOut: c01(a.lengua * 0.6),
  };
}

/**
 * Escribe los pesos en la malla. Devuelve cuántos blendshapes se tocaron y cuáles faltan.
 * Pesos se recortan a [0,1].
 */
export function aplicarPesos(
  m: MallaConMorphs,
  p: Pesos,
  esquema: EsquemaBlendshapes = detectarEsquema(m) ?? 'visemas',
): { aplicados: number; faltantes: string[] } {
  const d = m.morphTargetDictionary;
  const inf = m.morphTargetInfluences;
  if (!d || !inf) return { aplicados: 0, faltantes: [] };
  const faltantes: string[] = [];
  let aplicados = 0;
  const escribir = (nombre: string, w: number): void => {
    const i = d[nombre];
    if (i === undefined || i >= inf.length) {
      faltantes.push(nombre);
      return;
    }
    inf[i] = c01(w);
    aplicados++;
  };
  if (esquema === 'visemas') {
    for (const v of VISEMAS) escribir(NOMBRE_BLENDSHAPE(v as Visema), p[v]);
  } else {
    for (const [k, w] of Object.entries(pesosArkit(p))) escribir(k, w);
  }
  return { aplicados, faltantes };
}
