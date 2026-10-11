// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Sincronizador de visemas por turno contra el reloj de audio.
 *
 * Flujo esperado (contrato borrador):
 *   1. llega `avatar.visemas` (turno N, items con t_ms relativos al inicio del audio del turno);
 *   2. el reproductor de audio programa el audio del turno N para empezar en el instante
 *      `inicioMs` del reloj de audio y avisa con `iniciarTurno(N, inicioMs)`;
 *   3. en cada frame, `pesos(ahoraMs)` devuelve los pesos de los 15 visemas.
 * Los pasos 1 y 2 pueden llegar en cualquier orden. Un turno nuevo corta al anterior
 * (el avatar no habla dos turnos a la vez). Turnos viejos se ignoran.
 */
import type { EventoAvatarVisemas, ItemVisema } from '../contrato/eventos';
import { validarEventoVisemas } from '../contrato/eventos';
import {
  duracionTurno,
  normalizarItems,
  pesosEn,
  pesosSilencio,
  type ItemNormalizado,
  type OpcionesInterpolacion,
  type Pesos,
} from './interpolacion';

export interface OpcionesSincronizador extends OpcionesInterpolacion {
  /**
   * Corrimiento fijo (ms) que se suma al tiempo del audio. Positivo = la boca se adelanta.
   * Sirve para compensar un frame de pantalla (~16 ms) o calibrar por dispositivo (T08).
   */
  adelantoMs?: number;
  /** Turnos guardados como máximo (cota de memoria). */
  maxTurnos?: number;
}

export type ResultadoRecepcion = 'aceptado' | 'anexado' | 'invalido' | 'turno_viejo' | 'duplicado';

interface Turno {
  turno: number;
  items: ItemVisema[];
  normalizados: ItemNormalizado[];
  inicioMs: number | null;
  duracionMs: number;
  seqs: Set<number>;
}

export class SincronizadorVisemas {
  private turnos = new Map<number, Turno>();
  private activo: number | null = null;
  private ultimoTurnoVisto = 0;
  private readonly op: Required<Pick<OpcionesSincronizador, 'adelantoMs' | 'maxTurnos'>> & OpcionesInterpolacion;

  constructor(op: OpcionesSincronizador = {}) {
    this.op = { adelantoMs: 0, maxTurnos: 4, ...op };
  }

  recibirVisemas(ev: EventoAvatarVisemas): ResultadoRecepcion {
    if (!validarEventoVisemas(ev).ok) return 'invalido';
    const { turno, items } = ev.datos;
    if (this.activo !== null && turno < this.activo) return 'turno_viejo';
    if (turno < this.ultimoTurnoVisto - this.op.maxTurnos) return 'turno_viejo';
    const existente = this.turnos.get(turno);
    if (existente) {
      if (existente.seqs.has(ev.seq)) return 'duplicado';
      // TTS en streaming: el mismo turno puede llegar en varios trozos.
      const vistos = new Set(existente.items.map((i) => `${i.t_ms}:${i.v}`));
      for (const it of items) if (!vistos.has(`${it.t_ms}:${it.v}`)) existente.items.push(it);
      existente.normalizados = normalizarItems(existente.items);
      existente.duracionMs = duracionTurno(existente.normalizados);
      existente.seqs.add(ev.seq);
      return 'anexado';
    }
    const normalizados = normalizarItems(items);
    this.turnos.set(turno, {
      turno,
      items: [...items],
      normalizados,
      inicioMs: null,
      duracionMs: duracionTurno(normalizados),
      seqs: new Set([ev.seq]),
    });
    this.ultimoTurnoVisto = Math.max(this.ultimoTurnoVisto, turno);
    this.podar();
    return 'aceptado';
  }

  /** El audio del turno empieza (o empezó) en `inicioMs` del reloj de audio. */
  iniciarTurno(turno: number, inicioMs: number): void {
    if (this.activo !== null && turno < this.activo) return;
    let t = this.turnos.get(turno);
    if (!t) {
      // El audio llegó antes que los visemas: reservamos el turno vacío.
      t = { turno, items: [], normalizados: [], inicioMs: null, duracionMs: 0, seqs: new Set() };
      this.turnos.set(turno, t);
      this.ultimoTurnoVisto = Math.max(this.ultimoTurnoVisto, turno);
    }
    t.inicioMs = inicioMs;
    this.activo = turno;
    this.podar();
  }

  /** Corte (barge-in: el cliente habla encima, o se cerró la sesión). */
  cortar(): void {
    if (this.activo !== null) {
      const t = this.turnos.get(this.activo);
      if (t) t.inicioMs = null;
    }
    this.activo = null;
  }

  /** Tiempo relativo al turno activo en el instante `ahoraMs` del reloj de audio, o null. */
  tiempoEnTurno(ahoraMs: number): number | null {
    if (this.activo === null) return null;
    const t = this.turnos.get(this.activo);
    if (!t || t.inicioMs === null) return null;
    return ahoraMs - t.inicioMs + this.op.adelantoMs;
  }

  pesos(ahoraMs: number): Pesos {
    if (this.activo === null) return pesosSilencio();
    const t = this.turnos.get(this.activo)!;
    const rel = this.tiempoEnTurno(ahoraMs);
    if (rel === null || rel < -(this.op.transicionMs ?? 60)) return pesosSilencio();
    return pesosEn(t.normalizados, rel, this.op);
  }

  /** ¿El turno activo terminó de sonar en `ahoraMs`? */
  terminado(ahoraMs: number): boolean {
    if (this.activo === null) return true;
    const t = this.turnos.get(this.activo)!;
    const rel = this.tiempoEnTurno(ahoraMs);
    return rel !== null && rel >= t.duracionMs + (this.op.transicionMs ?? 60) / 2;
  }

  get turnoActivo(): number | null {
    return this.activo;
  }

  get turnosGuardados(): number[] {
    return [...this.turnos.keys()].sort((a, b) => a - b);
  }

  itemsDe(turno: number): readonly ItemNormalizado[] {
    return this.turnos.get(turno)?.normalizados ?? [];
  }

  private podar(): void {
    const claves = [...this.turnos.keys()].sort((a, b) => a - b);
    while (claves.length > this.op.maxTurnos) {
      const k = claves.shift()!;
      if (k === this.activo) continue;
      this.turnos.delete(k);
    }
  }
}
