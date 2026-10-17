/**
 * AvatarVivo: AvatarPuerto con cascada 3d → clips → placeholder 2D.
 * Los motores reales (three.js, lienzo de clips) se inyectan desde
 * avatar-vivo-navegador.ts para que las pruebas no arrastren WebGL.
 */
import {
  AvatarPlaceholder2D,
  type AvatarPuerto,
  type ConfigAvatar,
  type EstadoAvatar,
  type ModoAvatarPreferido,
  type TurnoAvatar,
} from "./avatar";
import { itemsDesdeTexto } from "../avatar-motor/visemas/desdeTexto";
import type { ItemVisema, Visema } from "./tipos";

export interface RelojAvatar {
  ahoraMs(): number;
}

/** Reloj del turno cuando la voz es speechSynthesis (no hay AudioContext). */
export class RelojPerformance implements RelojAvatar {
  ahoraMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }
}

export type InfoFrameMin = { dominante: Visema };

export interface Motor3DPuerto {
  recibirVisemas(turno: number, items: ItemVisema[], seq: number): void;
  iniciarTurno(turno: number, inicioRelojMs: number): void;
  cortar(): void;
  destruir(): void;
}

export interface MotorClipsPuerto {
  recibirRespuesta(turno: number, texto: string, clipId?: string): void;
  interrumpir(): void;
  destruir(): void;
}

export type MotoresAvatar = {
  intentar3d: (
    contenedor: HTMLElement,
    op: {
      reloj: RelojAvatar;
      descripcion: string;
      avatarId: string;
      alFrame: (info: InfoFrameMin) => void;
    },
  ) => Motor3DPuerto;
  intentarClips: (contenedor: HTMLElement) => MotorClipsPuerto;
  crear2d?: () => AvatarPuerto;
  esSinWebGL?: (e: unknown) => boolean;
};

const CLIP_SALUDO = "clip_saludo";
const RE_CLIP = /^clip_[a-z0-9_]{2,40}$/;

function esSinWebGLDefecto(e: unknown): boolean {
  return e instanceof Error && e.name === "ErrorSinWebGL";
}

export class AvatarVivo implements AvatarPuerto {
  private _modo: ModoAvatarPreferido = "placeholder-2d";
  private raiz: HTMLElement | null = null;
  private motor3d: Motor3DPuerto | null = null;
  private motorClips: MotorClipsPuerto | null = null;
  private fallback2d: AvatarPuerto | null = null;
  private readonly reloj: RelojAvatar = new RelojPerformance();
  private seq = 0;
  private estado: EstadoAvatar = { hablando: false, visema: "sil", turno: null };
  private oyentes = new Set<(e: EstadoAvatar) => void>();
  private visemasPendientes: { turno: number; items: ItemVisema[] } | null = null;

  constructor(private readonly motores: MotoresAvatar) {}

  get modo(): ModoAvatarPreferido {
    return this._modo;
  }

  montar(contenedor: HTMLElement, cfg: ConfigAvatar): void {
    this.desmontar();
    this.raiz = contenedor;
    const pref = cfg.modoPreferido ?? "3d";
    if (pref === "placeholder-2d") {
      this.usar2d(contenedor, cfg);
      return;
    }
    if (pref === "3d") {
      try {
        this.motor3d = this.motores.intentar3d(contenedor, {
          reloj: this.reloj,
          descripcion: cfg.descripcion,
          avatarId: cfg.avatarId,
          alFrame: (info) => {
            if (!this.estado.hablando) return;
            if (info.dominante === this.estado.visema) return;
            this.estado = { ...this.estado, visema: info.dominante };
            this.emitir();
          },
        });
        this._modo = "3d";
        this.marcar(contenedor);
        return;
      } catch (e) {
        const test = this.motores.esSinWebGL ?? esSinWebGLDefecto;
        if (!test(e)) throw e;
      }
    }
    try {
      this.motorClips = this.motores.intentarClips(contenedor);
      this._modo = "clips";
      this.marcar(contenedor);
    } catch {
      this.usar2d(contenedor, cfg);
    }
  }

  desmontar(): void {
    this.callar();
    this.motor3d?.destruir();
    this.motorClips?.destruir();
    this.fallback2d?.desmontar();
    this.motor3d = null;
    this.motorClips = null;
    this.fallback2d = null;
    if (this.raiz?.dataset["avatarModo"]) delete this.raiz.dataset["avatarModo"];
    this.raiz = null;
    this.visemasPendientes = null;
    this._modo = "placeholder-2d";
  }

  hablar(t: TurnoAvatar): void {
    this.estado = { hablando: true, visema: "aa", turno: t.turno };
    this.emitir();
    if (this.motor3d) {
      const items =
        this.visemasPendientes?.turno === t.turno
          ? this.visemasPendientes.items
          : itemsDesdeTexto(t.texto);
      this.visemasPendientes = null;
      this.motor3d.recibirVisemas(t.turno, items, ++this.seq);
      this.motor3d.iniciarTurno(t.turno, this.reloj.ahoraMs());
      return;
    }
    if (this.motorClips) {
      const clip = t.clipId && RE_CLIP.test(t.clipId) ? t.clipId : CLIP_SALUDO;
      this.motorClips.recibirRespuesta(t.turno, t.texto, clip);
      return;
    }
    this.fallback2d?.hablar(t);
  }

  aplicarVisemas(turno: number, items: ItemVisema[]): void {
    if (this.motor3d) {
      if (this.estado.hablando && this.estado.turno === turno) {
        this.motor3d.recibirVisemas(turno, items, ++this.seq);
      } else {
        this.visemasPendientes = { turno, items };
      }
      return;
    }
    this.fallback2d?.aplicarVisemas(turno, items);
  }

  callar(): void {
    this.motor3d?.cortar();
    this.motorClips?.interrumpir();
    this.fallback2d?.callar();
    if (!this.estado.hablando && this.estado.visema === "sil") return;
    this.estado = { hablando: false, visema: "sil", turno: this.estado.turno };
    this.emitir();
  }

  suscribir(fn: (e: EstadoAvatar) => void): () => void {
    this.oyentes.add(fn);
    fn({ ...this.estado });
    return () => {
      this.oyentes.delete(fn);
    };
  }

  private usar2d(contenedor: HTMLElement, cfg: ConfigAvatar) {
    this.fallback2d = (this.motores.crear2d ?? (() => new AvatarPlaceholder2D()))();
    this.fallback2d.montar(contenedor, cfg);
    this._modo = "placeholder-2d";
    this.marcar(contenedor);
    this.fallback2d.suscribir((e) => {
      this.estado = e;
      this.emitir();
    });
  }

  private marcar(el: HTMLElement) {
    el.dataset["avatarModo"] = this._modo;
  }

  private emitir() {
    for (const fn of this.oyentes) fn({ ...this.estado });
  }
}
