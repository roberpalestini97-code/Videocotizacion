// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Medición de frames: intervalos entre frames, fps, percentiles y frames largos.
 * Pura (recibe tiempos). Se usa en demo.html y en el smoke, y es la misma lógica que hay que
 * usar en los dispositivos reales (T08) para que los números sean comparables.
 */

export interface ResumenFrames {
  frames: number;
  duracionMs: number;
  fpsMedio: number;
  intervaloP50Ms: number;
  intervaloP95Ms: number;
  intervaloP99Ms: number;
  intervaloMaxMs: number;
  /** % de intervalos > 33,4 ms (por debajo de 30 fps). */
  pctSobre33Ms: number;
  /** Intervalos > 50 ms (tirones visibles). */
  framesLargos: number;
}

export function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return 0;
  if (p <= 0) return ordenados[0]!;
  if (p >= 100) return ordenados[ordenados.length - 1]!;
  // Método "nearest-rank".
  const rango = Math.ceil((p / 100) * ordenados.length);
  return ordenados[Math.max(0, rango - 1)]!;
}

export class MedidorFrames {
  private intervalos: number[] = [];
  private ultimo: number | null = null;
  private primero: number | null = null;

  constructor(private readonly capacidad = 10_000) {}

  /** Registrar un frame en el instante `tMs` (performance.now o el timestamp de rAF). */
  registrar(tMs: number): void {
    if (this.ultimo !== null) {
      const dt = tMs - this.ultimo;
      if (dt >= 0) {
        this.intervalos.push(dt);
        if (this.intervalos.length > this.capacidad) this.intervalos.shift();
      }
    } else this.primero = tMs;
    this.ultimo = tMs;
  }

  reiniciar(): void {
    this.intervalos = [];
    this.ultimo = null;
    this.primero = null;
  }

  get muestras(): readonly number[] {
    return this.intervalos;
  }

  resumen(): ResumenFrames {
    const n = this.intervalos.length;
    const ord = [...this.intervalos].sort((a, b) => a - b);
    const suma = this.intervalos.reduce((s, x) => s + x, 0);
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    return {
      frames: n,
      duracionMs: r2(this.ultimo !== null && this.primero !== null ? this.ultimo - this.primero : 0),
      fpsMedio: r2(n && suma > 0 ? (1000 * n) / suma : 0),
      intervaloP50Ms: r2(percentil(ord, 50)),
      intervaloP95Ms: r2(percentil(ord, 95)),
      intervaloP99Ms: r2(percentil(ord, 99)),
      intervaloMaxMs: r2(ord[n - 1] ?? 0),
      pctSobre33Ms: r2(n ? (100 * this.intervalos.filter((x) => x > 33.4).length) / n : 0),
      framesLargos: this.intervalos.filter((x) => x > 50).length,
    };
  }
}

/**
 * Error de sincronía en un frame: diferencia (ms) entre el instante en que el frame se ve y el
 * instante del audio que suena. Con reloj de audio bien estimado, el error residual es
 * ~ el intervalo de frame (el frame se ve hasta 1 intervalo después de calcularlo).
 * Esta función solo agrega; la medición física real (cámara de 240 fps) está en el protocolo.
 */
export class AcumuladorSincronia {
  private errores: number[] = [];
  registrar(errorMs: number): void {
    if (Number.isFinite(errorMs)) this.errores.push(errorMs);
  }
  resumen(): { n: number; medioAbsMs: number; p95AbsMs: number; maxAbsMs: number } {
    const abs = this.errores.map(Math.abs).sort((a, b) => a - b);
    const n = abs.length;
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    return {
      n,
      medioAbsMs: r2(n ? abs.reduce((s, x) => s + x, 0) / n : 0),
      p95AbsMs: r2(percentil(abs, 95)),
      maxAbsMs: r2(abs[n - 1] ?? 0),
    };
  }
}
