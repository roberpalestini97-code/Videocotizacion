/**
 * Encabezado binario de 20 bytes, big-endian (contracts/eventos-sesion.md §3). NO CONGELADO.
 *
 * | off | tam | campo    |
 * |   0 |   2 | magia "VC" (0x56 0x43)
 * |   2 |   1 | version = 1
 * |   3 |   1 | tipo
 * |   4 |   1 | flags (bit 0 = fin de turno de voz; resto en 0)
 * |   5 |   3 | reservado = 0
 * |   8 |   4 | seq (uint32 por tipo de trama)
 * |  12 |   4 | ts_ms (uint32, ms desde sesion.lista)
 * |  16 |   4 | longitud (uint32, ≤ 131072)
 */

export const TAM_ENCABEZADO = 20;
export const CARGA_MAX = 131_072;
export const FLAG_FIN_TURNO = 0x01;

export const TIPOS_TRAMA = {
  audio_pcm16_16k: 0x01,
  audio_opus: 0x02,
  fotograma_jpeg: 0x10,
  audio_respuesta_opus: 0x20,
} as const;
export type TipoTrama = keyof typeof TIPOS_TRAMA;

const TIPO_POR_CODIGO = new Map<number, TipoTrama>(
  (Object.entries(TIPOS_TRAMA) as [TipoTrama, number][]).map(([k, v]) => [v, k]),
);

export interface Encabezado {
  tipo: TipoTrama;
  flags: number;
  seq: number;
  ts_ms: number;
  longitud: number;
}

export class ErrorEncabezado extends Error {
  constructor(public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorEncabezado';
  }
}

function u32(nombre: string, x: number): number {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffffff) {
    throw new ErrorEncabezado('rango', `${nombre} fuera de uint32: ${x}`);
  }
  return x;
}

export function codificarEncabezado(e: Encabezado): Uint8Array {
  const codigo = TIPOS_TRAMA[e.tipo];
  if (codigo === undefined) throw new ErrorEncabezado('tipo', `tipo desconocido: ${String(e.tipo)}`);
  if (e.flags !== (e.flags & FLAG_FIN_TURNO)) throw new ErrorEncabezado('flags', 'solo el bit 0 está definido');
  if (u32('longitud', e.longitud) > CARGA_MAX) throw new ErrorEncabezado('longitud', 'carga > 131072');
  const b = new Uint8Array(TAM_ENCABEZADO);
  const dv = new DataView(b.buffer);
  b[0] = 0x56;
  b[1] = 0x43;
  b[2] = 1;
  b[3] = codigo;
  b[4] = e.flags;
  // 5..7 reservados en 0
  dv.setUint32(8, u32('seq', e.seq), false);
  dv.setUint32(12, u32('ts_ms', e.ts_ms), false);
  dv.setUint32(16, e.longitud, false);
  return b;
}

export function decodificarEncabezado(bytes: Uint8Array): Encabezado {
  if (bytes.length < TAM_ENCABEZADO) throw new ErrorEncabezado('corto', 'menos de 20 bytes');
  if (bytes[0] !== 0x56 || bytes[1] !== 0x43) throw new ErrorEncabezado('magia', 'magia distinta de VC');
  if (bytes[2] !== 1) throw new ErrorEncabezado('version', `versión ${bytes[2]} no soportada`);
  const tipo = TIPO_POR_CODIGO.get(bytes[3] ?? -1);
  if (!tipo) throw new ErrorEncabezado('tipo', `tipo 0x${(bytes[3] ?? 0).toString(16)} desconocido`);
  const flags = bytes[4] ?? 0;
  if (flags & ~FLAG_FIN_TURNO) throw new ErrorEncabezado('flags', 'bits de flags reservados en 1');
  if (bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) throw new ErrorEncabezado('reservado', 'reservado ≠ 0');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, TAM_ENCABEZADO);
  const longitud = dv.getUint32(16, false);
  if (longitud > CARGA_MAX) throw new ErrorEncabezado('longitud', 'carga > 131072');
  return { tipo, flags, seq: dv.getUint32(8, false), ts_ms: dv.getUint32(12, false), longitud };
}

/** Arma encabezado + carga en un solo buffer (lo que se manda por el WebSocket). */
export function armarTrama(e: Omit<Encabezado, 'longitud'>, carga: Uint8Array): Uint8Array {
  const enc = codificarEncabezado({ ...e, longitud: carga.length });
  const t = new Uint8Array(TAM_ENCABEZADO + carga.length);
  t.set(enc, 0);
  t.set(carga, TAM_ENCABEZADO);
  return t;
}

/** Separa una trama recibida; verifica que `longitud` coincida con la carga real. */
export function separarTrama(trama: Uint8Array): { encabezado: Encabezado; carga: Uint8Array } {
  const encabezado = decodificarEncabezado(trama);
  const carga = trama.subarray(TAM_ENCABEZADO);
  if (carga.length !== encabezado.longitud) {
    throw new ErrorEncabezado('longitud', `longitud declarada ${encabezado.longitud} ≠ real ${carga.length}`);
  }
  return { encabezado, carga };
}
