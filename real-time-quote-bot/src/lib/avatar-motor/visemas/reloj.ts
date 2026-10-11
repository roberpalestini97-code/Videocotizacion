// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Reloj de audio. Los visemas se posicionan contra el reloj del AudioContext (no contra
 * performance.now ni contra requestAnimationFrame): es el único reloj que sabe qué muestra
 * está sonando. performance.now y el reloj de audio derivan entre sí (cristales distintos).
 */

export interface RelojAudio {
  /** Tiempo (ms) del reloj de audio que se está ESCUCHANDO ahora (con latencia de salida descontada). */
  ahoraMs(): number;
}

export interface MarcaSalida {
  /** AudioTimestamp.contextTime (s). */
  contextTime: number;
  /** AudioTimestamp.performanceTime (ms, base performance.now). */
  performanceTime: number;
}

/**
 * Estima el tiempo de contexto audible en `perfAhoraMs`.
 * - Con `getOutputTimestamp()` válido: contextTime + (perfAhora − performanceTime).
 * - Sin eso (Safari viejo, o marca en 0): currentTime − outputLatency − baseLatency.
 * Devuelve ms. Pura y testeable.
 */
export function estimarTiempoAudibleMs(params: {
  perfAhoraMs: number;
  marca?: MarcaSalida | null;
  currentTimeS: number;
  outputLatencyS?: number;
  baseLatencyS?: number;
}): number {
  const { perfAhoraMs, marca, currentTimeS } = params;
  if (marca && marca.performanceTime > 0 && marca.contextTime > 0) {
    const adelanto = perfAhoraMs - marca.performanceTime;
    // Si la marca es vieja (>250 ms) o del futuro, no es confiable: caemos al método simple.
    if (adelanto >= 0 && adelanto < 250) return marca.contextTime * 1000 + adelanto;
  }
  const lat = (params.outputLatencyS ?? 0) + (params.baseLatencyS ?? 0);
  return Math.max(0, (currentTimeS - lat) * 1000);
}

/** Adaptador del AudioContext real. */
export class RelojAudioContext implements RelojAudio {
  constructor(private readonly ctx: AudioContext) {}
  ahoraMs(): number {
    const c = this.ctx as AudioContext & { getOutputTimestamp?: () => AudioTimestamp; outputLatency?: number };
    let marca: MarcaSalida | null = null;
    if (typeof c.getOutputTimestamp === 'function') {
      const ts = c.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined) {
        marca = { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
      }
    }
    return estimarTiempoAudibleMs({
      perfAhoraMs: performance.now(),
      marca,
      currentTimeS: c.currentTime,
      outputLatencyS: c.outputLatency ?? 0,
      baseLatencyS: c.baseLatency ?? 0,
    });
  }
}

/** Reloj manual para pruebas y para el modo clips. */
export class RelojManual implements RelojAudio {
  constructor(public t = 0) {}
  ahoraMs(): number {
    return this.t;
  }
  avanzar(ms: number): void {
    this.t += ms;
  }
}
