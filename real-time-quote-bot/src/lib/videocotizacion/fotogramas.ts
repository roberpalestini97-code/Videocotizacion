/**
 * Muestreo de fotogramas de la cámara (BRIEF 3, ADR 0006 §3).
 * Reglas: JPEG real, lado ≤ 1024 px, ≤ 128 KiB, uno cada ≥ 3 s, tope por sesión.
 * NUNCA se guardan: el JPEG vive solo en memoria hasta que se manda por el socket;
 * no se escribe en storage, no se descarga, no se loguea y no se retiene ninguna referencia.
 */
import { TIPO_TRAMA, armarTrama } from "./protocolo";
import type { ReglaFotograma } from "./tipos";

export const REGLA_POR_DEFECTO: ReglaFotograma = {
  formato: "image/jpeg",
  lado_max_px: 1024,
  bytes_max: 131072,
  intervalo_min_ms: 3000,
  max_por_sesion: 400,
};

export function dimensionesEscaladas(
  ancho: number,
  alto: number,
  ladoMax: number,
): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 };
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMax) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const f = ladoMax / mayor;
  return { ancho: Math.max(1, Math.floor(ancho * f)), alto: Math.max(1, Math.floor(alto * f)) };
}

export function esJpeg(b: Uint8Array): boolean {
  return b.byteLength > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** Codifica el cuadro actual a JPEG con ese tamaño y calidad (0..1). */
export type CodificadorJpeg = (
  ancho: number,
  alto: number,
  calidad: number,
) => Promise<Uint8Array | null>;

const CALIDADES = [0.8, 0.65, 0.5, 0.38, 0.28, 0.2];

/**
 * Baja la calidad y, si hace falta, la resolución, hasta entrar en `bytes_max`.
 * Devuelve null si no se logra (el cuadro se descarta; jamás se manda uno fuera de límite).
 */
export async function codificarDentroDeLimites(
  anchoOrigen: number,
  altoOrigen: number,
  regla: ReglaFotograma,
  codificar: CodificadorJpeg,
): Promise<{ jpeg: Uint8Array; ancho: number; alto: number } | null> {
  let { ancho, alto } = dimensionesEscaladas(anchoOrigen, altoOrigen, regla.lado_max_px);
  if (!ancho || !alto) return null;
  for (let ronda = 0; ronda < 4; ronda++) {
    for (const q of CALIDADES) {
      const jpeg = await codificar(ancho, alto, q);
      if (!jpeg) return null;
      if (
        esJpeg(jpeg) &&
        jpeg.byteLength <= regla.bytes_max &&
        Math.max(ancho, alto) <= regla.lado_max_px
      ) {
        return { jpeg, ancho, alto };
      }
    }
    ancho = Math.floor(ancho * 0.75);
    alto = Math.floor(alto * 0.75);
    if (ancho < 64 || alto < 64) return null;
  }
  return null;
}

export type FuenteVideo = { ancho: number; alto: number; listo: boolean };

export type DepsMuestreador = {
  leerFuente: () => FuenteVideo;
  codificar: CodificadorJpeg;
  /** Manda la trama binaria completa; devuelve false si el socket no está listo. */
  enviar: (trama: Uint8Array) => boolean;
  ahoraMs?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  /** Para no pisar mientras habla el cliente, etc. */
  puedeMuestrear?: () => boolean;
};

export class MuestreadorFotogramas {
  private id: unknown = null;
  private enCurso = false;
  private seq = 0;
  private inicioMs = 0;
  private ultimoMs = -Infinity;
  readonly regla: ReglaFotograma;
  enviados = 0;
  omitidos = 0;

  constructor(
    regla: ReglaFotograma,
    private readonly deps: DepsMuestreador,
  ) {
    // El intervalo y el tamaño nunca pueden ser más permisivos que lo del producto.
    this.regla = {
      ...regla,
      intervalo_min_ms: Math.max(3000, regla.intervalo_min_ms),
      lado_max_px: Math.min(1024, regla.lado_max_px),
      bytes_max: Math.min(131072, regla.bytes_max),
    };
  }

  get activo(): boolean {
    return this.id !== null;
  }

  iniciar(): void {
    if (this.id !== null) return;
    const ahora = this.deps.ahoraMs ?? (() => Date.now());
    this.inicioMs = ahora();
    const si = this.deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    // +150 ms de margen: el reloj del navegador no es exacto y el servidor descarta lo que llegue antes de tiempo.
    this.id = si(() => void this.tick(), this.regla.intervalo_min_ms + 150);
  }

  detener(): void {
    if (this.id === null) return;
    (this.deps.clearInterval ?? ((i) => clearInterval(i as ReturnType<typeof setInterval>)))(
      this.id,
    );
    this.id = null;
  }

  /** Un ciclo de muestreo. Público para pruebas. */
  async tick(): Promise<"enviado" | "omitido"> {
    const ahora = (this.deps.ahoraMs ?? (() => Date.now()))();
    if (
      this.enCurso ||
      this.enviados >= this.regla.max_por_sesion ||
      ahora - this.ultimoMs < this.regla.intervalo_min_ms ||
      (this.deps.puedeMuestrear && !this.deps.puedeMuestrear())
    ) {
      this.omitidos++;
      return "omitido";
    }
    const fuente = this.deps.leerFuente();
    if (!fuente.listo) {
      this.omitidos++;
      return "omitido";
    }
    this.enCurso = true;
    try {
      const r = await codificarDentroDeLimites(
        fuente.ancho,
        fuente.alto,
        this.regla,
        this.deps.codificar,
      );
      if (!r) {
        this.omitidos++;
        return "omitido";
      }
      const trama = armarTrama(TIPO_TRAMA.fotograma_jpeg, r.jpeg, this.seq, ahora - this.inicioMs);
      if (!this.deps.enviar(trama)) {
        this.omitidos++;
        return "omitido";
      }
      this.seq++;
      this.enviados++;
      this.ultimoMs = ahora;
      return "enviado";
    } finally {
      this.enCurso = false;
    }
  }
}

/** Codificador real: dibuja el <video> en un canvas (fuera de pantalla) y exporta JPEG. */
export function crearCodificadorCanvas(video: HTMLVideoElement): CodificadorJpeg {
  const canvas = document.createElement("canvas");
  return async (ancho, alto, calidad) => {
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
    // Se limpia el lienzo: no queda el cuadro en memoria del canvas.
    ctx.clearRect(0, 0, ancho, alto);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  };
}
