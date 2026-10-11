// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Suavizado exponencial de pesos independiente del frame rate:
 *   w ← w + (objetivo − w)·(1 − e^(−dt/τ))
 * Con τ distinto para subir (ataque) y bajar (relajación). A 20 fps y a 60 fps el resultado
 * en el tiempo es el mismo (salvo discretización), que es lo que importa en equipos lentos.
 */
import { VISEMAS } from '../contrato/eventos';
import { pesosSilencio, type Pesos } from './interpolacion';

export interface OpcionesSuavizado {
  /** Constante de tiempo al subir (ms). 0 = sin suavizado. */
  ataqueMs?: number;
  /** Constante de tiempo al bajar (ms). */
  relajacionMs?: number;
  /** dt máximo considerado (ms): tras una pestaña en segundo plano no se "salta" raro. */
  dtMaxMs?: number;
}

export function factorSuavizado(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  if (dtMs <= 0) return 0;
  return 1 - Math.exp(-dtMs / tauMs);
}

export class Suavizador {
  private actual: Pesos = pesosSilencio();
  private readonly ataque: number;
  private readonly relajacion: number;
  private readonly dtMax: number;

  constructor(op: OpcionesSuavizado = {}) {
    this.ataque = op.ataqueMs ?? 25;
    this.relajacion = op.relajacionMs ?? 45;
    this.dtMax = op.dtMaxMs ?? 100;
  }

  paso(objetivo: Pesos, dtMs: number): Pesos {
    const dt = Math.min(Math.max(dtMs, 0), this.dtMax);
    const fa = factorSuavizado(dt, this.ataque);
    const fr = factorSuavizado(dt, this.relajacion);
    for (const v of VISEMAS) {
      const w = this.actual[v];
      const o = objetivo[v];
      this.actual[v] = w + (o - w) * (o > w ? fa : fr);
    }
    return { ...this.actual };
  }

  reiniciar(): void {
    this.actual = pesosSilencio();
  }

  get pesos(): Pesos {
    return { ...this.actual };
  }
}
