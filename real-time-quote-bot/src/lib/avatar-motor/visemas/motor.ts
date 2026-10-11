// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Motor de visemas sin WebGL: une reloj de audio + sincronizador + suavizado.
 * Avatar3D lo llama una vez por frame; las pruebas lo llaman con un RelojManual.
 */
import type { EventoAvatarVisemas, Visema } from '../contrato/eventos';
import type { RelojAudio } from './reloj';
import { SincronizadorVisemas, type OpcionesSincronizador, type ResultadoRecepcion } from './sincronizador';
import { Suavizador, type OpcionesSuavizado } from './suavizado';
import { visemaDominante, type Pesos } from './interpolacion';

export interface InfoFrame {
  /** Tiempo del frame (performance.now / rAF), ms. */
  tFrameMs: number;
  /** Tiempo audible del reloj de audio, ms. */
  tAudioMs: number;
  /** Tiempo dentro del turno activo, o null si no habla. */
  tTurnoMs: number | null;
  turno: number | null;
  pesos: Pesos;
  dominante: Visema;
}

export class MotorVisemas {
  readonly sincronizador: SincronizadorVisemas;
  private readonly suavizador: Suavizador;
  private ultimoFrame: number | null = null;

  constructor(
    private readonly reloj: RelojAudio,
    op: { sincronizador?: OpcionesSincronizador; suavizado?: OpcionesSuavizado } = {},
  ) {
    this.sincronizador = new SincronizadorVisemas(op.sincronizador);
    this.suavizador = new Suavizador(op.suavizado);
  }

  recibirVisemas(ev: EventoAvatarVisemas): ResultadoRecepcion {
    return this.sincronizador.recibirVisemas(ev);
  }

  iniciarTurno(turno: number, inicioRelojMs: number): void {
    this.sincronizador.iniciarTurno(turno, inicioRelojMs);
  }

  cortar(): void {
    this.sincronizador.cortar();
  }

  paso(tFrameMs: number): InfoFrame {
    const dt = this.ultimoFrame === null ? 16.7 : tFrameMs - this.ultimoFrame;
    this.ultimoFrame = tFrameMs;
    const tAudioMs = this.reloj.ahoraMs();
    const objetivo = this.sincronizador.pesos(tAudioMs);
    const pesos = this.suavizador.paso(objetivo, dt);
    return {
      tFrameMs,
      tAudioMs,
      tTurnoMs: this.sincronizador.tiempoEnTurno(tAudioMs),
      turno: this.sincronizador.turnoActivo,
      pesos,
      dominante: visemaDominante(pesos),
    };
  }
}
