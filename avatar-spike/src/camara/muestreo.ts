/**
 * Muestreo de fotogramas de la cámara del cliente (BRIEF 3, ADR 0006 §3, contrato §3).
 * Módulo PURO y testeable: el lienzo, el reloj y el envío se inyectan.
 *
 * Reglas que cumple ANTES de mandar (el servidor igual valida y descarta):
 * - JPEG real (bytes mágicos FF D8 FF);
 * - lado mayor ≤ 1024 px (se escala manteniendo proporción, nunca se agranda);
 * - ≤ 128 KiB: baja calidad JPEG y, si no alcanza, reduce dimensiones (lado mínimo 160 px);
 * - uno cada ≥ 3 s (intervalo medido desde el inicio del muestreo anterior);
 * - tope por sesión (`limites.fotograma.max_por_sesion`);
 * - NO SE GUARDA: los bytes van directo a `enviar` y el módulo no retiene referencias
 *   (ni arrays, ni Blobs, ni URLs de objeto); el lienzo se limpia después de codificar.
 */
import { armarTrama } from '../contrato/encabezado';

export interface Contexto2DMinimo {
  drawImage(fuente: unknown, dx: number, dy: number, dw: number, dh: number): void;
  clearRect?(x: number, y: number, w: number, h: number): void;
}

/** Lo mínimo de HTMLCanvasElement u OffscreenCanvas que se usa. */
export interface LienzoInyectable {
  width: number;
  height: number;
  getContext(id: '2d'): Contexto2DMinimo | null;
  /** OffscreenCanvas */
  convertToBlob?(op: { type: string; quality?: number }): Promise<Blob>;
  /** HTMLCanvasElement */
  toBlob?(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
}

export interface FuenteVideo {
  /** videoWidth / videoHeight del <video>; 0 si todavía no hay imagen. */
  readonly ancho: number;
  readonly alto: number;
  /** Lo que se pasa a drawImage (el <video>, un ImageBitmap, etc.). */
  readonly imagen: unknown;
}

export interface ReglaFotograma {
  lado_max_px: number;
  bytes_max: number;
  intervalo_min_ms: number;
  max_por_sesion: number;
}

export const REGLA_POR_DEFECTO: ReglaFotograma = {
  lado_max_px: 1024,
  bytes_max: 131_072,
  intervalo_min_ms: 3000,
  max_por_sesion: 200,
};

export type ResultadoMuestreo =
  | { resultado: 'enviado'; seq: number; ancho: number; alto: number; bytes: number; calidad: number; intentos: number }
  | {
      resultado: 'omitido';
      motivo: 'frecuencia' | 'tope_sesion' | 'ocupado' | 'sin_video' | 'detenido' | 'tamano' | 'formato' | 'error_codificacion';
    };

export interface DependenciasMuestreo {
  crearLienzo(ancho: number, alto: number): LienzoInyectable;
  ahoraMs(): number;
  /** Recibe la trama (encabezado de 20 bytes + JPEG). No debe guardarla. */
  enviar(trama: Uint8Array): void;
  /** ms desde `sesion.lista` (para ts_ms del encabezado). Por defecto, ahoraMs − inicio. */
  tsSesionMs?(): number;
}

export const CALIDADES = [0.82, 0.7, 0.58, 0.46, 0.35] as const;
export const LADO_MIN_PX = 160;

/** Dimensiones destino: lado mayor ≤ ladoMax, proporción conservada, nunca agranda, enteros ≥ 1. */
export function dimensionesDestino(ancho: number, alto: number, ladoMax: number): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 };
  const mayor = Math.max(ancho, alto);
  const k = mayor > ladoMax ? ladoMax / mayor : 1;
  return {
    ancho: Math.max(1, Math.min(ladoMax, Math.round(ancho * k))),
    alto: Math.max(1, Math.min(ladoMax, Math.round(alto * k))),
  };
}

export function esJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

async function lienzoAJpeg(l: LienzoInyectable, calidad: number): Promise<Uint8Array | null> {
  let blob: Blob | null = null;
  if (typeof l.convertToBlob === 'function') {
    blob = await l.convertToBlob({ type: 'image/jpeg', quality: calidad });
  } else if (typeof l.toBlob === 'function') {
    blob = await new Promise<Blob | null>((res) => l.toBlob!(res, 'image/jpeg', calidad));
  } else {
    throw new Error('el lienzo no sabe codificar (ni convertToBlob ni toBlob)');
  }
  if (!blob) return null;
  // Safari viejo devuelve PNG si no soporta el tipo: se detecta por bytes mágicos después.
  return new Uint8Array(await blob.arrayBuffer());
}

export class MuestreadorFotogramas {
  private ultimoMs = -Infinity;
  private enviados = 0;
  private ocupado = false;
  private detenido = false;
  private seq = 0;
  private readonly inicioMs: number;
  private lienzo: LienzoInyectable | null = null;
  readonly regla: ReglaFotograma;

  constructor(private readonly deps: DependenciasMuestreo, regla: Partial<ReglaFotograma> = {}) {
    this.regla = { ...REGLA_POR_DEFECTO, ...regla };
    // Nunca más permisivo que el contrato.
    this.regla.lado_max_px = Math.min(this.regla.lado_max_px, 1024);
    this.regla.bytes_max = Math.min(this.regla.bytes_max, 131_072);
    this.regla.intervalo_min_ms = Math.max(this.regla.intervalo_min_ms, 3000);
    this.inicioMs = deps.ahoraMs();
  }

  get totalEnviados(): number {
    return this.enviados;
  }

  detener(): void {
    this.detenido = true;
    this.lienzo = null;
  }

  async muestrear(fuente: FuenteVideo): Promise<ResultadoMuestreo> {
    if (this.detenido) return { resultado: 'omitido', motivo: 'detenido' };
    if (this.enviados >= this.regla.max_por_sesion) return { resultado: 'omitido', motivo: 'tope_sesion' };
    const ahora = this.deps.ahoraMs();
    if (ahora - this.ultimoMs < this.regla.intervalo_min_ms) return { resultado: 'omitido', motivo: 'frecuencia' };
    if (this.ocupado) return { resultado: 'omitido', motivo: 'ocupado' };
    const base = dimensionesDestino(fuente.ancho, fuente.alto, this.regla.lado_max_px);
    if (base.ancho === 0) return { resultado: 'omitido', motivo: 'sin_video' };

    this.ocupado = true;
    this.ultimoMs = ahora; // la cadencia cuenta desde que se intentó, aunque falle
    let intentos = 0;
    try {
      let escala = 1;
      for (;;) {
        const ancho = Math.round(base.ancho * escala);
        const alto = Math.round(base.alto * escala);
        if (Math.max(ancho, alto) < LADO_MIN_PX) return { resultado: 'omitido', motivo: 'tamano' };
        const l = this.prepararLienzo(ancho, alto);
        const ctx = l.getContext('2d');
        if (!ctx) return { resultado: 'omitido', motivo: 'error_codificacion' };
        ctx.drawImage(fuente.imagen, 0, 0, ancho, alto);
        try {
          for (const q of CALIDADES) {
            intentos++;
            let bytes: Uint8Array | null = await lienzoAJpeg(l, q);
            if (!bytes) return { resultado: 'omitido', motivo: 'error_codificacion' };
            if (!esJpeg(bytes)) return { resultado: 'omitido', motivo: 'formato' };
            if (bytes.length <= this.regla.bytes_max) {
              const seq = this.seq++;
              const ts = this.deps.tsSesionMs ? this.deps.tsSesionMs() : ahora - this.inicioMs;
              const trama = armarTrama({ tipo: 'fotograma_jpeg', flags: 0, seq, ts_ms: Math.max(0, Math.floor(ts)) >>> 0 }, bytes);
              const n = bytes.length;
              bytes = null; // no retener
              this.deps.enviar(trama);
              this.enviados++;
              return { resultado: 'enviado', seq, ancho, alto, bytes: n, calidad: q, intentos };
            }
          }
        } finally {
          ctx.clearRect?.(0, 0, l.width, l.height);
        }
        escala *= 0.75;
      }
    } catch {
      return { resultado: 'omitido', motivo: 'error_codificacion' };
    } finally {
      this.ocupado = false;
    }
  }

  private prepararLienzo(ancho: number, alto: number): LienzoInyectable {
    if (!this.lienzo) this.lienzo = this.deps.crearLienzo(ancho, alto);
    if (this.lienzo.width !== ancho) this.lienzo.width = ancho;
    if (this.lienzo.height !== alto) this.lienzo.height = alto;
    return this.lienzo;
  }
}

/**
 * Programa el muestreo periódico. Devuelve una función para cancelar.
 * Se agrega un margen (100 ms) al intervalo: los temporizadores del navegador se adelantan o
 * atrasan unos ms y un disparo a 2999 ms sería descartado por `frecuencia`.
 */
export const MARGEN_INTERVALO_MS = 100;
export function programarMuestreo(
  m: MuestreadorFotogramas,
  fuente: () => FuenteVideo,
  programar: (f: () => void, ms: number) => () => void,
  alResultado?: (r: ResultadoMuestreo) => void,
): () => void {
  return programar(() => {
    void m.muestrear(fuente()).then((r) => alResultado?.(r));
  }, m.regla.intervalo_min_ms + MARGEN_INTERVALO_MS);
}
