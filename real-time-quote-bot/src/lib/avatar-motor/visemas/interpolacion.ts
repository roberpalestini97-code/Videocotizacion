// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Interpolación de visemas: dado un tiempo t (ms del audio del turno) devuelve un peso por
 * visema, con transiciones cruzadas (coarticulación simple) entre visemas consecutivos.
 *
 * Modelo: cada ítem aporta un trapecio que sube de 0 a 1 en [t - T/2, t + T/2], se mantiene
 * en 1 y baja en [fin - T/2, fin + T/2], con T = min(transicionMs, d_ms). Dos ítems contiguos
 * con el mismo T suman exactamente 1 en la frontera. El resto hasta 1 va a `sil`.
 * La suma de todos los pesos (incluido `sil`) es siempre 1.
 */
import { VISEMAS, type ItemVisema, type Visema, esVisema, LIMITES } from '../contrato/eventos';

export type Pesos = Record<Visema, number>;

export interface ItemNormalizado {
  v: Visema;
  ini: number;
  fin: number;
}

export interface OpcionesInterpolacion {
  /** Ancho de la transición entre visemas, en ms (por defecto 60). */
  transicionMs?: number;
  /** Curva de la transición: lineal o smoothstep. */
  curva?: 'lineal' | 'suave';
}

export function pesosVacios(): Pesos {
  const p = {} as Pesos;
  for (const v of VISEMAS) p[v] = 0;
  return p;
}

export function pesosSilencio(): Pesos {
  const p = pesosVacios();
  p.sil = 1;
  return p;
}

/**
 * Ordena por inicio, descarta ítems inválidos y recorta solapamientos (el ítem siguiente
 * manda: el anterior termina donde empieza el siguiente). Devuelve copia, no muta.
 */
export function normalizarItems(items: readonly ItemVisema[]): ItemNormalizado[] {
  const validos = items
    .filter(
      (it) =>
        it &&
        esVisema(it.v) &&
        Number.isFinite(it.t_ms) &&
        Number.isFinite(it.d_ms) &&
        it.t_ms >= 0 &&
        it.t_ms <= LIMITES.tMsMax &&
        it.d_ms >= 1 &&
        it.d_ms <= LIMITES.dMsMax,
    )
    .map((it) => ({ v: it.v, ini: it.t_ms, fin: it.t_ms + it.d_ms }))
    .sort((a, b) => a.ini - b.ini);
  for (let i = 0; i < validos.length - 1; i++) {
    const a = validos[i]!;
    const b = validos[i + 1]!;
    if (a.fin > b.ini) a.fin = Math.max(a.ini, b.ini);
  }
  return validos.filter((x) => x.fin > x.ini);
}

/** Índice del último ítem con ini ≤ t (búsqueda binaria), o -1. */
export function indiceActivo(items: readonly ItemNormalizado[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.ini <= t) {
      res = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return res;
}

function curvar(x: number, curva: 'lineal' | 'suave'): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return curva === 'suave' ? c * c * (3 - 2 * c) : c;
}

/** Peso del trapecio de un ítem en t. */
export function pesoItem(it: ItemNormalizado, t: number, transicionMs: number, curva: 'lineal' | 'suave' = 'lineal'): number {
  const T = Math.max(1e-6, Math.min(transicionMs, it.fin - it.ini));
  const h = T / 2;
  if (t <= it.ini - h || t >= it.fin + h) return 0;
  const sube = (t - (it.ini - h)) / T;
  const baja = (it.fin + h - t) / T;
  return curvar(Math.min(1, sube, baja), curva);
}

/** Pesos de los 15 visemas en t (ms). Suma 1. */
export function pesosEn(items: readonly ItemNormalizado[], t: number, op: OpcionesInterpolacion = {}): Pesos {
  const transicion = op.transicionMs ?? 60;
  const curva = op.curva ?? 'lineal';
  const p = pesosVacios();
  if (items.length === 0 || !Number.isFinite(t)) {
    p.sil = 1;
    return p;
  }
  const i = indiceActivo(items, t + transicion / 2);
  // Tras normalizar, `fin` es no decreciente: al encontrar un ítem que ya terminó (fin + h ≤ t)
  // todos los anteriores también terminaron. Costo O(log n + ítems que se solapan con t).
  let suma = 0;
  for (let k = i; k >= 0; k--) {
    const it = items[k]!;
    if (it.fin + transicion / 2 <= t) break;
    const w = pesoItem(it, t, transicion, curva);
    if (w > 0) {
      p[it.v] += w;
      suma += w;
    }
  }
  if (suma > 1) {
    for (const v of VISEMAS) p[v] /= suma;
    suma = 1;
  }
  p.sil += 1 - suma;
  return p;
}

/** Visema de mayor peso (para medir sincronía y para depurar). */
export function visemaDominante(p: Pesos): Visema {
  let mejor: Visema = 'sil';
  let max = -1;
  for (const v of VISEMAS) {
    if (p[v] > max) {
      max = p[v];
      mejor = v;
    }
  }
  return mejor;
}

/** Visema que el contrato dice que suena en t (sin transiciones): verdad de referencia. */
export function visemaEsperado(items: readonly ItemNormalizado[], t: number): Visema {
  const i = indiceActivo(items, t);
  if (i < 0) return 'sil';
  const it = items[i]!;
  return t < it.fin ? it.v : 'sil';
}

/** Duración total del turno en ms (fin del último ítem). */
export function duracionTurno(items: readonly ItemNormalizado[]): number {
  return items.reduce((m, it) => Math.max(m, it.fin), 0);
}
