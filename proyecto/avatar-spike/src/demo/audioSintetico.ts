/**
 * Audio de prueba SINTÉTICO generado desde los visemas (no es voz real ni TTS).
 * Vocales: armónicos de una f0 ~120 Hz con dos formantes por vocal. Fricativas: ruido
 * determinista (PRNG con semilla). Oclusivas: ráfaga corta. Nasales/R: zumbido grave.
 * Silencio: ceros. Sirve para (a) el harness demo.html y (b) verificar en pruebas que la
 * energía del audio coincide con los tramos donde la boca debe abrirse.
 */
import type { ItemVisema, Visema } from '../contrato/eventos';

const FORMANTES: Partial<Record<Visema, [number, number]>> = {
  aa: [800, 1200],
  E: [500, 1900],
  I: [300, 2300],
  O: [500, 900],
  U: [320, 800],
};

const FRICATIVAS: ReadonlySet<Visema> = new Set(['SS', 'CH', 'FF', 'TH']);
const OCLUSIVAS: ReadonlySet<Visema> = new Set(['PP', 'DD', 'kk']);
const SONORAS: ReadonlySet<Visema> = new Set(['nn', 'RR']);

export function prng(semilla: number): () => number {
  let s = semilla >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

export interface OpcionesAudio {
  sampleRate?: number;
  f0?: number;
  semilla?: number;
  colaMs?: number;
}

export function sintetizarAudio(items: readonly ItemVisema[], op: OpcionesAudio = {}): Float32Array {
  const sr = op.sampleRate ?? 24000;
  const f0 = op.f0 ?? 120;
  const azar = prng(op.semilla ?? 7);
  const fin = items.reduce((m, it) => Math.max(m, it.t_ms + it.d_ms), 0) + (op.colaMs ?? 100);
  const n = Math.ceil((fin / 1000) * sr);
  const out = new Float32Array(n);
  const rampa = Math.floor(0.01 * sr); // 10 ms de fundido para evitar clics
  for (const it of items) {
    const i0 = Math.floor((it.t_ms / 1000) * sr);
    const i1 = Math.min(n, Math.floor(((it.t_ms + it.d_ms) / 1000) * sr));
    const largo = i1 - i0;
    if (largo <= 0 || it.v === 'sil') continue;
    const form = FORMANTES[it.v];
    for (let i = i0; i < i1; i++) {
      const k = i - i0;
      const env = Math.min(1, k / rampa, (largo - k) / rampa);
      const t = i / sr;
      // leve entonación descendente
      const f = f0 * (1 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t));
      let x = 0;
      if (form) {
        for (let h = 1; h <= 20; h++) {
          const fh = f * h;
          const g1 = Math.exp(-(((fh - form[0]) / 150) ** 2));
          const g2 = 0.6 * Math.exp(-(((fh - form[1]) / 200) ** 2));
          x += (g1 + g2 + 0.02) * Math.sin(2 * Math.PI * fh * t);
        }
        x *= 0.35;
      } else if (FRICATIVAS.has(it.v)) {
        x = (azar() * 2 - 1) * 0.12;
      } else if (OCLUSIVAS.has(it.v)) {
        x = k < 0.02 * sr ? (azar() * 2 - 1) * 0.3 : 0;
      } else if (SONORAS.has(it.v)) {
        x = 0.12 * Math.sin(2 * Math.PI * f * t) + 0.05 * Math.sin(4 * Math.PI * f * t);
      }
      out[i] = (out[i] ?? 0) + x * env;
    }
  }
  return out;
}

/** RMS de una ventana [desdeMs, hastaMs). */
export function rmsVentana(audio: Float32Array, sr: number, desdeMs: number, hastaMs: number): number {
  const i0 = Math.max(0, Math.floor((desdeMs / 1000) * sr));
  const i1 = Math.min(audio.length, Math.floor((hastaMs / 1000) * sr));
  if (i1 <= i0) return 0;
  let s = 0;
  for (let i = i0; i < i1; i++) s += (audio[i] ?? 0) ** 2;
  return Math.sqrt(s / (i1 - i0));
}
