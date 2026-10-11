// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Forma de boca por visema, como parámetros articulatorios independientes del modelo.
 * El modelo procedural los usa para generar sus blendshapes; un GLB (T30) trae los suyos
 * ya esculpidos con nombres `viseme_<v>` (convención Oculus/ARKit-compatible usada por
 * Ready Player Me y otros) y estos parámetros dejan de usarse.
 */
import type { Visema } from '../contrato/eventos';

export interface Articulacion {
  /** Apertura de mandíbula 0..1. */
  mandibula: number;
  /** Estiramiento horizontal de labios −1..1 (negativo = juntar). */
  ancho: number;
  /** Redondeo/proyección de labios 0..1 (O, U). */
  redondez: number;
  /** Labios apretados 0..1 (P, B, M). */
  presion: number;
  /** Labio inferior contra dientes 0..1 (F, V). */
  labioInferior: number;
  /** Lengua visible entre dientes 0..1 (TH). */
  lengua: number;
}

export const FORMAS: Record<Visema, Articulacion> = {
  sil: { mandibula: 0, ancho: 0, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  PP: { mandibula: 0, ancho: 0, redondez: 0, presion: 1, labioInferior: 0, lengua: 0 },
  FF: { mandibula: 0.12, ancho: 0.1, redondez: 0, presion: 0, labioInferior: 1, lengua: 0 },
  TH: { mandibula: 0.25, ancho: 0.1, redondez: 0, presion: 0, labioInferior: 0, lengua: 1 },
  DD: { mandibula: 0.3, ancho: 0.2, redondez: 0, presion: 0, labioInferior: 0, lengua: 0.2 },
  kk: { mandibula: 0.35, ancho: 0.1, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  CH: { mandibula: 0.25, ancho: -0.2, redondez: 0.5, presion: 0, labioInferior: 0, lengua: 0 },
  SS: { mandibula: 0.1, ancho: 0.5, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  nn: { mandibula: 0.2, ancho: 0.1, redondez: 0, presion: 0, labioInferior: 0, lengua: 0.1 },
  RR: { mandibula: 0.25, ancho: 0, redondez: 0.35, presion: 0, labioInferior: 0, lengua: 0 },
  aa: { mandibula: 1, ancho: 0.2, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  E: { mandibula: 0.5, ancho: 0.6, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  I: { mandibula: 0.3, ancho: 0.8, redondez: 0, presion: 0, labioInferior: 0, lengua: 0 },
  O: { mandibula: 0.7, ancho: -0.3, redondez: 0.8, presion: 0, labioInferior: 0, lengua: 0 },
  U: { mandibula: 0.3, ancho: -0.5, redondez: 1, presion: 0, labioInferior: 0, lengua: 0 },
};

export const NOMBRE_BLENDSHAPE = (v: Visema): string => `viseme_${v}`;
