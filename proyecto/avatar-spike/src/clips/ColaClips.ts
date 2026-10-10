/**
 * Cola de clips pregrabados (modo `clips` del avatar, BRIEF 1). Máquina de estados PURA:
 * no toca el DOM ni el tiempo; el reproductor (AvatarClips) le avisa cuándo termina un clip.
 *
 * Reglas:
 * - `encolar` valida `clip_id` (patrón del contrato) y que exista en el catálogo; si no
 *   existe, el turno se resuelve con subtítulo (texto) y se informa `faltante`.
 * - Cola acotada (por defecto 6). Si se llena, se descarta el pendiente más VIEJO.
 * - Un turno más nuevo descarta los pendientes de turnos anteriores (el avatar no se queda
 *   "debiendo" respuestas viejas). Turnos más viejos que el actual se ignoran.
 * - `interrumpir()` (el cliente habla encima) vacía la cola y corta el clip actual.
 * - Sin nada que reproducir, vuelve al clip de espera (loop) si el catálogo lo tiene.
 */
import { RE_CLIP_ID } from '../contrato/eventos';

export interface ClipCatalogo {
  url: string;
  duracion_ms: number;
  /** Subtítulo por defecto del clip. */
  texto?: string;
  /** El clip de espera se repite en loop. */
  loop?: boolean;
}
export type CatalogoClips = Record<string, ClipCatalogo>;

export interface PedidoClip {
  clip_id: string;
  turno: number;
  /** Texto del turno (subtítulo). Viene de `avatar.respuesta.texto`. */
  texto?: string;
}

export interface Reproduccion {
  /** Id único de esta reproducción (para ignorar avisos tardíos de clips ya cortados). */
  id: number;
  clip_id: string;
  turno: number | null;
  url: string;
  duracion_ms: number;
  texto: string | null;
  loop: boolean;
}

export type EventoCola =
  | { tipo: 'iniciar'; reproduccion: Reproduccion }
  | { tipo: 'detener'; id: number }
  | { tipo: 'faltante'; pedido: PedidoClip }
  | { tipo: 'descartado'; pedido: PedidoClip; motivo: 'cola_llena' | 'turno_viejo' | 'reemplazado' | 'id_invalido' };

export type ResultadoEncolar = 'en_cola' | 'reproduciendo' | 'faltante' | 'turno_viejo' | 'id_invalido';

export interface OpcionesCola {
  capacidad?: number;
  clipEspera?: string;
}

export class ColaClips {
  private pendientes: PedidoClip[] = [];
  private actual: Reproduccion | null = null;
  private siguienteId = 1;
  private turnoActual = 0;
  private readonly capacidad: number;
  private readonly clipEspera: string | null;
  private oyentes: ((e: EventoCola) => void)[] = [];

  constructor(private readonly catalogo: CatalogoClips, op: OpcionesCola = {}) {
    this.capacidad = Math.max(1, op.capacidad ?? 6);
    this.clipEspera = op.clipEspera ?? null;
  }

  alEvento(f: (e: EventoCola) => void): () => void {
    this.oyentes.push(f);
    return () => {
      this.oyentes = this.oyentes.filter((x) => x !== f);
    };
  }

  get reproduciendo(): Reproduccion | null {
    return this.actual;
  }

  get enCola(): readonly PedidoClip[] {
    return this.pendientes;
  }

  /** Arranca el clip de espera (si hay) cuando no hay nada sonando. */
  arrancar(): void {
    if (!this.actual) this.siguiente();
  }

  encolar(p: PedidoClip): ResultadoEncolar {
    if (!RE_CLIP_ID.test(p.clip_id)) {
      this.emitir({ tipo: 'descartado', pedido: p, motivo: 'id_invalido' });
      return 'id_invalido';
    }
    if (p.turno < this.turnoActual) {
      this.emitir({ tipo: 'descartado', pedido: p, motivo: 'turno_viejo' });
      return 'turno_viejo';
    }
    if (!this.catalogo[p.clip_id]) {
      this.emitir({ tipo: 'faltante', pedido: p });
      return 'faltante';
    }
    if (p.turno > this.turnoActual) {
      // Turno nuevo: descarta pendientes de turnos anteriores.
      const viejos = this.pendientes.filter((x) => x.turno < p.turno);
      this.pendientes = this.pendientes.filter((x) => x.turno >= p.turno);
      viejos.forEach((x) => this.emitir({ tipo: 'descartado', pedido: x, motivo: 'reemplazado' }));
      this.turnoActual = p.turno;
      // Si suena un clip de un turno anterior (no el de espera), se corta.
      if (this.actual && this.actual.turno !== null && this.actual.turno < p.turno) {
        this.detenerActual();
      }
    }
    this.pendientes.push(p);
    while (this.pendientes.length > this.capacidad) {
      const fuera = this.pendientes.shift()!;
      this.emitir({ tipo: 'descartado', pedido: fuera, motivo: 'cola_llena' });
    }
    if (!this.actual || this.actual.loop) {
      if (this.actual?.loop) this.detenerActual();
      this.siguiente();
      return 'reproduciendo';
    }
    return 'en_cola';
  }

  /** El reproductor avisa que terminó la reproducción `id`. Avisos de ids viejos se ignoran. */
  terminado(id: number): void {
    if (!this.actual || this.actual.id !== id) return;
    if (this.actual.loop && this.pendientes.length === 0) {
      // El clip de espera vuelve a empezar (mismo id: el reproductor lo maneja en loop).
      return;
    }
    this.actual = null;
    this.siguiente();
  }

  /** Error al reproducir: se salta al siguiente. */
  fallo(id: number): void {
    if (!this.actual || this.actual.id !== id) return;
    const r = this.actual;
    this.actual = null;
    this.emitir({ tipo: 'faltante', pedido: { clip_id: r.clip_id, turno: r.turno ?? 0, texto: r.texto ?? undefined } });
    this.siguiente();
  }

  /** Barge-in: el cliente habla. Vacía la cola y vuelve a espera. */
  interrumpir(): void {
    const vaciados = this.pendientes;
    this.pendientes = [];
    vaciados.forEach((x) => this.emitir({ tipo: 'descartado', pedido: x, motivo: 'reemplazado' }));
    if (this.actual && !this.actual.loop) {
      this.detenerActual();
      this.siguiente();
    }
  }

  /** URL del próximo clip para precargar, si hay. */
  proximoParaPrecargar(): string | null {
    const p = this.pendientes[0];
    return p ? (this.catalogo[p.clip_id]?.url ?? null) : null;
  }

  private detenerActual(): void {
    if (!this.actual) return;
    const id = this.actual.id;
    this.actual = null;
    this.emitir({ tipo: 'detener', id });
  }

  private siguiente(): void {
    const p = this.pendientes.shift();
    if (p) {
      const c = this.catalogo[p.clip_id]!;
      this.iniciar(p.clip_id, p.turno, c, p.texto ?? c.texto ?? null);
      return;
    }
    if (this.clipEspera && this.catalogo[this.clipEspera]) {
      const c = this.catalogo[this.clipEspera]!;
      this.iniciar(this.clipEspera, null, { ...c, loop: true }, null);
    }
  }

  private iniciar(clip_id: string, turno: number | null, c: ClipCatalogo, texto: string | null): void {
    this.actual = {
      id: this.siguienteId++,
      clip_id,
      turno,
      url: c.url,
      duracion_ms: c.duracion_ms,
      texto,
      loop: !!c.loop,
    };
    this.emitir({ tipo: 'iniciar', reproduccion: this.actual });
  }

  private emitir(e: EventoCola): void {
    for (const f of this.oyentes) f(e);
  }
}

/** Clip sugerido por `siguiente_paso.accion` (ADR 0002 §9). Lo decide el servidor; esto es respaldo. */
export const CLIP_POR_ACCION: Record<string, string> = {
  preguntar: 'clip_preguntar',
  pedir_ver: 'clip_pedir_ver',
  confirmar_datos: 'clip_confirmar_datos',
  emitir_presupuesto: 'clip_emitir_presupuesto',
  fuera_de_zona: 'clip_fuera_de_zona',
  fuera_de_alcance: 'clip_fuera_de_alcance',
  derivar_whatsapp: 'clip_derivar_whatsapp',
  cerrar: 'clip_cerrar',
};

/** Catálogo PLACEHOLDER: no hay clips reales todavía (no hay grabaciones ni actor). */
export function catalogoPlaceholder(): CatalogoClips {
  const c: CatalogoClips = {
    clip_espera: { url: 'placeholder:espera', duracion_ms: 4000, loop: true },
    clip_saludo: { url: 'placeholder:saludo', duracion_ms: 3000, texto: 'Hola, soy el asistente de cotización.' },
  };
  for (const [accion, id] of Object.entries(CLIP_POR_ACCION)) {
    c[id] = { url: `placeholder:${accion}`, duracion_ms: 2500, texto: `(${accion.replace(/_/g, ' ')})` };
  }
  return c;
}
