/**
 * Puerto del avatar. La tarea 5 va a enchufar acá el avatar 3D en vivo (visemas)
 * o el de clips pregrabados; hoy hay un placeholder 2D con las fotos de src/assets.
 *
 * Contrato de uso (el flujo no sabe qué avatar hay detrás):
 *   montar() → hablar(turno) [+ aplicarVisemas(turno, items)] → callar() → desmontar()
 */
import type { ItemVisema, Visema } from "./tipos";

export type TurnoAvatar = { turno: number; texto: string; clipId?: string };

export type EstadoAvatar = { hablando: boolean; visema: Visema; turno: number | null };

export type ConfigAvatar = { avatarId: string; nombre: string; foto: string; descripcion: string };

export interface AvatarPuerto {
  readonly modo: "placeholder-2d" | "3d" | "clips";
  montar(contenedor: HTMLElement, cfg: ConfigAvatar): void;
  desmontar(): void;
  /** El asesor empieza a hablar este turno (el audio lo da `Voz`). */
  hablar(t: TurnoAvatar): void;
  /** Visemas del turno (si el servidor los manda); t_ms es relativo al inicio de `hablar`. */
  aplicarVisemas(turno: number, items: ItemVisema[]): void;
  /** Deja de hablar (fin del audio o corte). */
  callar(): void;
  suscribir(fn: (e: EstadoAvatar) => void): () => void;
}

/** Abertura de la boca (0..1) para cada visema; el placeholder la dibuja como una barra. */
export const ABERTURA_VISEMA: Record<Visema, number> = {
  sil: 0,
  PP: 0.05,
  FF: 0.15,
  TH: 0.2,
  DD: 0.25,
  kk: 0.3,
  CH: 0.3,
  SS: 0.2,
  nn: 0.2,
  RR: 0.35,
  aa: 1,
  E: 0.6,
  I: 0.4,
  O: 0.85,
  U: 0.5,
};

export class AvatarPlaceholder2D implements AvatarPuerto {
  readonly modo = "placeholder-2d" as const;
  private raiz: HTMLElement | null = null;
  private boca: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;
  private estado: EstadoAvatar = { hablando: false, visema: "sil", turno: null };
  private oyentes = new Set<(e: EstadoAvatar) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pulso: ReturnType<typeof setInterval> | null = null;

  montar(contenedor: HTMLElement, cfg: ConfigAvatar): void {
    this.desmontar();
    const img = document.createElement("img");
    img.src = cfg.foto;
    img.alt = cfg.descripcion;
    img.className = "absolute inset-0 size-full object-cover";
    img.draggable = false;
    const boca = document.createElement("div");
    boca.setAttribute("aria-hidden", "true");
    boca.className =
      "absolute left-1/2 bottom-[22%] w-[14%] -translate-x-1/2 rounded-full bg-ink/70 transition-[height] duration-75";
    boca.style.height = "0px";
    boca.style.opacity = "0";
    contenedor.append(img, boca);
    this.raiz = contenedor;
    this.img = img;
    this.boca = boca;
    this.dibujar();
  }

  desmontar(): void {
    this.callar();
    this.img?.remove();
    this.boca?.remove();
    this.img = this.boca = this.raiz = null;
  }

  private emitir() {
    for (const fn of this.oyentes) fn({ ...this.estado });
    this.dibujar();
  }

  private dibujar() {
    if (!this.boca) return;
    const a = this.estado.hablando ? ABERTURA_VISEMA[this.estado.visema] : 0;
    this.boca.style.height = `${Math.round(a * 22)}px`;
    this.boca.style.opacity = this.estado.hablando ? "1" : "0";
  }

  private limpiarTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.pulso) clearInterval(this.pulso);
    this.pulso = null;
  }

  hablar(t: TurnoAvatar): void {
    this.limpiarTimers();
    this.estado = { hablando: true, visema: "aa", turno: t.turno };
    this.emitir();
    // Sin visemas del servidor: la boca oscila para que se note que habla.
    const seq: Visema[] = ["aa", "E", "O", "nn", "I", "aa", "U", "sil"];
    let i = 0;
    this.pulso = setInterval(() => {
      i = (i + 1) % seq.length;
      this.estado = { ...this.estado, visema: seq[i] ?? "sil" };
      this.emitir();
    }, 140);
  }

  aplicarVisemas(turno: number, items: ItemVisema[]): void {
    if (!this.estado.hablando || this.estado.turno !== turno) return;
    // Llegaron visemas reales: reemplazan la oscilación.
    this.limpiarTimers();
    for (const it of items) {
      this.timers.push(
        setTimeout(() => {
          this.estado = { ...this.estado, visema: it.v };
          this.emitir();
        }, it.t_ms),
      );
    }
  }

  callar(): void {
    this.limpiarTimers();
    if (!this.estado.hablando && this.estado.visema === "sil") return;
    this.estado = { hablando: false, visema: "sil", turno: this.estado.turno };
    this.emitir();
  }

  suscribir(fn: (e: EstadoAvatar) => void): () => void {
    this.oyentes.add(fn);
    fn({ ...this.estado });
    return () => this.oyentes.delete(fn);
  }
}
