// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * AvatarClips: modo de avatar por clips pregrabados (sin GPU, sin TTS). Reproductor que
 * conecta la ColaClips con un "medio" inyectable:
 *  - MedioVideo: <video> real (cuando existan clips grabados, formato a definir en T30);
 *  - MedioPlaceholder: lienzo 2D que dibuja el nombre del clip y una barra de progreso
 *    (hoy no hay clips reales).
 * Los subtítulos se insertan SIEMPRE como texto (textContent), nunca como HTML (R19).
 */
import type { EventoAvatarRespuesta } from '../contrato/eventos';
import { ColaClips, type CatalogoClips, type EventoCola, type Reproduccion, type ResultadoEncolar } from './ColaClips';

export interface MedioClip {
  readonly elemento: HTMLElement;
  reproducir(r: Reproduccion, alTerminar: () => void, alFallar: (e: unknown) => void): void;
  detener(): void;
  liberar(): void;
}

export class MedioVideo implements MedioClip {
  readonly elemento: HTMLVideoElement;
  private actual: Reproduccion | null = null;
  constructor() {
    this.elemento = document.createElement('video');
    this.elemento.playsInline = true;
    this.elemento.muted = false;
    this.elemento.preload = 'auto';
  }
  reproducir(r: Reproduccion, alTerminar: () => void, alFallar: (e: unknown) => void): void {
    this.actual = r;
    const v = this.elemento;
    v.loop = r.loop;
    v.src = r.url;
    v.onended = () => {
      if (this.actual?.id === r.id) alTerminar();
    };
    v.onerror = () => alFallar(v.error);
    v.play().catch(alFallar);
  }
  detener(): void {
    this.actual = null;
    this.elemento.pause();
  }
  liberar(): void {
    this.detener();
    this.elemento.removeAttribute('src');
    this.elemento.load();
  }
}

export class MedioPlaceholder implements MedioClip {
  readonly elemento: HTMLCanvasElement;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(ancho = 480, alto = 360) {
    this.elemento = document.createElement('canvas');
    this.elemento.width = ancho;
    this.elemento.height = alto;
    this.elemento.setAttribute('role', 'img');
    this.elemento.setAttribute('aria-label', 'Avatar en modo clips (marcador de posición)');
  }
  reproducir(r: Reproduccion, alTerminar: () => void): void {
    this.detener();
    const t0 = performance.now();
    const ctx = this.elemento.getContext('2d');
    const dibujar = (): void => {
      if (!ctx) return;
      const { width: w, height: h } = this.elemento;
      const p = ((performance.now() - t0) % r.duracion_ms) / r.duracion_ms;
      ctx.fillStyle = '#1f2a33';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2b705';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, h * 0.22, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#e8e8e8';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`CLIP PLACEHOLDER: ${r.clip_id}`, w / 2, h * 0.72);
      ctx.fillStyle = '#ff6a13';
      ctx.fillRect(w * 0.1, h * 0.8, w * 0.8 * p, 6);
      this.raf = requestAnimationFrame(dibujar);
    };
    dibujar();
    if (!r.loop) this.timer = setTimeout(alTerminar, r.duracion_ms);
  }
  detener(): void {
    cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  liberar(): void {
    this.detener();
  }
}

export interface OpcionesAvatarClips {
  catalogo: CatalogoClips;
  medio?: MedioClip;
  clipEspera?: string;
  capacidad?: number;
  alEvento?: (e: EventoCola) => void;
}

export class AvatarClips {
  readonly cola: ColaClips;
  readonly medio: MedioClip;
  readonly subtitulo: HTMLParagraphElement;
  private readonly raiz: HTMLDivElement;

  constructor(contenedor: HTMLElement, op: OpcionesAvatarClips) {
    this.medio = op.medio ?? new MedioPlaceholder();
    this.cola = new ColaClips(op.catalogo, { clipEspera: op.clipEspera ?? 'clip_espera', capacidad: op.capacidad });
    this.raiz = document.createElement('div');
    this.raiz.className = 'vc-clips';
    this.subtitulo = document.createElement('p');
    this.subtitulo.className = 'vc-clips-subtitulo';
    this.subtitulo.setAttribute('aria-live', 'polite');
    this.raiz.append(this.medio.elemento, this.subtitulo);
    contenedor.appendChild(this.raiz);
    this.cola.alEvento((e) => {
      if (e.tipo === 'iniciar') {
        const r = e.reproduccion;
        this.subtitulo.textContent = r.texto ?? '';
        this.medio.reproducir(
          r,
          () => this.cola.terminado(r.id),
          () => this.cola.fallo(r.id),
        );
      } else if (e.tipo === 'detener') {
        this.medio.detener();
      } else if (e.tipo === 'faltante') {
        // Sin clip: el turno se muestra solo como subtítulo.
        this.subtitulo.textContent = e.pedido.texto ?? '';
      }
      op.alEvento?.(e);
    });
    this.cola.arrancar();
  }

  /** Entrada desde el socket: `avatar.respuesta` con `clip_id`. */
  recibirRespuesta(ev: EventoAvatarRespuesta): ResultadoEncolar | 'sin_clip' {
    const { turno, texto, clip_id } = ev.datos;
    if (!clip_id) {
      this.subtitulo.textContent = texto;
      return 'sin_clip';
    }
    return this.cola.encolar({ clip_id, turno, texto });
  }

  interrumpir(): void {
    this.cola.interrumpir();
  }

  destruir(): void {
    this.medio.liberar();
    this.raiz.remove();
  }
}
