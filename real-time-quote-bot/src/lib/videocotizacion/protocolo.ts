/**
 * Protocolo del WebSocket de medios (`vc-eventos.borrador.1`, NO congelado):
 * sobre JSON de eventos y encabezado binario de 20 bytes (big-endian).
 * Ver proyecto/contracts/eventos-sesion.md §2 y §3.
 */
import type { EventoServidor, ItemVisema, CampoPizarron, Visema } from "./tipos";

export const PROTOCOLO = "vc-eventos.borrador.1";

/** Sin `<`, `>` ni control (mismo patrón de los esquemas). Reemplaza por espacio. */
export function limpiarTexto(t: string): string {
  return (
    t
      // eslint-disable-next-line no-control-regex
      .replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export class Secuenciador {
  private n = 0;
  siguiente(): number {
    const v = this.n;
    this.n = (this.n + 1) >>> 0;
    return v;
  }
}

export function crearEventoCliente(
  tipo: "sesion.autenticar" | "texto.enviar" | "pizarron.corregir" | "sesion.cerrar",
  datos: Record<string, unknown>,
  seq: number,
  ahora: Date = new Date(),
): string {
  return JSON.stringify({ v: 1, tipo, seq, ts: ahora.toISOString(), datos });
}

const VISEMAS: ReadonlySet<string> = new Set([
  "sil",
  "PP",
  "FF",
  "TH",
  "DD",
  "kk",
  "CH",
  "SS",
  "nn",
  "RR",
  "aa",
  "E",
  "I",
  "O",
  "U",
]);

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
const esEntero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const esTexto = (x: unknown): x is string => typeof x === "string";

/** Límite del socket: mensaje de texto ≤ 16 KiB. */
export const MAX_TEXTO_BYTES = 16 * 1024;

/**
 * Valida el sobre y la forma mínima de los datos de cada evento del servidor.
 * Devuelve null si el mensaje no sirve (se ignora; nunca se rompe la llamada
 * por un evento desconocido o mal formado: el protocolo es borrador).
 */
export function parsearEventoServidor(crudo: string): EventoServidor | null {
  if (crudo.length > MAX_TEXTO_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (
    !esObjeto(o) ||
    o["v"] !== 1 ||
    !esTexto(o["tipo"]) ||
    !esEntero(o["seq"]) ||
    !esTexto(o["ts"])
  )
    return null;
  const d = o["datos"];
  if (!esObjeto(d)) return null;
  const base = { v: 1 as const, seq: o["seq"], ts: o["ts"] };

  switch (o["tipo"]) {
    case "sesion.lista":
      if (!esTexto(d["sesion_id"]) || !esObjeto(d["limites"])) return null;
      return { ...base, tipo: "sesion.lista", datos: d as never };
    case "transcripcion.parcial":
    case "transcripcion.final":
      if (!esEntero(d["turno"]) || !esTexto(d["texto"])) return null;
      return {
        ...base,
        tipo: o["tipo"],
        datos: { turno: d["turno"], texto: limpiarTexto(d["texto"]) },
      };
    case "avatar.respuesta": {
      if (!esEntero(d["turno"]) || !esTexto(d["texto"])) return null;
      const datos: { turno: number; texto: string; clip_id?: string } = {
        turno: d["turno"],
        texto: limpiarTexto(d["texto"]),
      };
      if (esTexto(d["clip_id"]) && /^clip_[a-z0-9_]{2,40}$/.test(d["clip_id"]))
        datos.clip_id = d["clip_id"];
      return { ...base, tipo: "avatar.respuesta", datos };
    }
    case "avatar.visemas": {
      if (!esEntero(d["turno"]) || !Array.isArray(d["items"])) return null;
      const items: ItemVisema[] = [];
      for (const it of d["items"].slice(0, 2000)) {
        if (
          !esObjeto(it) ||
          !esTexto(it["v"]) ||
          !VISEMAS.has(it["v"]) ||
          !esEntero(it["t_ms"]) ||
          !esEntero(it["d_ms"])
        )
          continue;
        items.push({ v: it["v"] as Visema, t_ms: it["t_ms"], d_ms: it["d_ms"] });
      }
      return { ...base, tipo: "avatar.visemas", datos: { turno: d["turno"], items } };
    }
    case "pizarron.actualizado": {
      if (!esEntero(d["version"]) || !Array.isArray(d["campos"])) return null;
      const campos: CampoPizarron[] = [];
      for (const c of d["campos"].slice(0, 40)) {
        if (!esObjeto(c) || !esTexto(c["clave"]) || !esTexto(c["etiqueta"]) || !esTexto(c["valor"]))
          continue;
        const estado = c["estado"];
        if (estado !== "anotado" && estado !== "corregido_por_cliente" && estado !== "faltante")
          continue;
        campos.push({
          clave: c["clave"],
          etiqueta: limpiarTexto(c["etiqueta"]),
          valor: limpiarTexto(c["valor"]),
          estado,
        });
      }
      return { ...base, tipo: "pizarron.actualizado", datos: { version: d["version"], campos } };
    }
    case "camara.fotograma":
      if (
        !esEntero(d["seq_fotograma"]) ||
        (d["resultado"] !== "aceptado" && d["resultado"] !== "descartado")
      )
        return null;
      return { ...base, tipo: "camara.fotograma", datos: d as never };
    case "sesion.aviso":
      if (!esTexto(d["aviso"]) || !esEntero(d["segundos_restantes"])) return null;
      return { ...base, tipo: "sesion.aviso", datos: d as never };
    case "cotizacion.emitida":
      if (!esObjeto(d["cotizacion"]) || !esObjeto(d["derivacion"])) return null;
      if (!esEntero(d["cotizacion"]["total_centavos"]) || !Array.isArray(d["cotizacion"]["items"]))
        return null;
      if (!esTexto(d["derivacion"]["url_wa_me"]) || !esTexto(d["derivacion"]["codigo_referencia"]))
        return null;
      return { ...base, tipo: "cotizacion.emitida", datos: d as never };
    case "sesion.cerrada":
      if (!esTexto(d["motivo_cierre"]) || !esEntero(d["duracion_s"])) return null;
      return { ...base, tipo: "sesion.cerrada", datos: d as never };
    case "error":
      if (!esTexto(d["codigo"]) || !esTexto(d["mensaje"])) return null;
      return {
        ...base,
        tipo: "error",
        datos: { codigo: d["codigo"], mensaje: limpiarTexto(d["mensaje"]) },
      };
    default:
      return null;
  }
}

// ---------- encabezado binario ----------

export const TIPO_TRAMA = {
  audio_pcm16_16k: 0x01,
  audio_opus: 0x02,
  fotograma_jpeg: 0x10,
  audio_respuesta_opus: 0x20,
} as const;

export const LARGO_ENCABEZADO = 20;
/** Carga útil máxima de una trama (contrato). */
export const MAX_CARGA = 131072;

export type EncabezadoBinario = {
  version: number;
  tipo: number;
  flags: number;
  seq: number;
  ts_ms: number;
  longitud: number;
};

export function armarTrama(
  tipo: number,
  carga: Uint8Array,
  seq: number,
  tsMs: number,
  flags = 0,
): Uint8Array {
  if (carga.byteLength > MAX_CARGA) throw new RangeError("carga mayor que 131072 bytes");
  const out = new Uint8Array(LARGO_ENCABEZADO + carga.byteLength);
  const dv = new DataView(out.buffer);
  out[0] = 0x56; // V
  out[1] = 0x43; // C
  out[2] = 1;
  out[3] = tipo;
  out[4] = flags;
  // 5..7 reservado = 0
  dv.setUint32(8, seq >>> 0, false);
  dv.setUint32(12, Math.max(0, Math.floor(tsMs)) >>> 0, false);
  dv.setUint32(16, carga.byteLength, false);
  out.set(carga, LARGO_ENCABEZADO);
  return out;
}

export function leerEncabezado(trama: Uint8Array): EncabezadoBinario | null {
  if (trama.byteLength < LARGO_ENCABEZADO || trama[0] !== 0x56 || trama[1] !== 0x43) return null;
  const dv = new DataView(trama.buffer, trama.byteOffset, trama.byteLength);
  return {
    version: trama[2] ?? 0,
    tipo: trama[3] ?? 0,
    flags: trama[4] ?? 0,
    seq: dv.getUint32(8, false),
    ts_ms: dv.getUint32(12, false),
    longitud: dv.getUint32(16, false),
  };
}
