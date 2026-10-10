// Utilidades compartidas por el generador del contrato. No contiene reglas de negocio.
import { createHash } from 'node:crypto';

export const VERSION = '0.1.5-borrador';
export const BASE = 'https://videocotizacion.local/contracts/schemas/';
export const RUTA_SALIDA_LLM = '../../conductas/esquema-salida-llm.schema.json';
export const ID_SALIDA_LLM = new URL(RUTA_SALIDA_LLM, BASE + 'x.schema.json').href;

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, sin I L O U
const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytes(semilla, n) {
  let out = Buffer.alloc(0);
  let i = 0;
  while (out.length < n) {
    out = Buffer.concat([out, createHash('sha256').update(`${semilla}#${i++}`).digest()]);
  }
  return out.subarray(0, n);
}
export const b32 = (semilla, n) => [...bytes(semilla, n)].map((b) => B32[b % 32]).join('');
export const b64u = (semilla, n) => [...bytes(semilla, n)].map((b) => B64U[b % 64]).join('');
export const hex = (semilla, n) => bytes(semilla, Math.ceil(n / 2)).toString('hex').slice(0, n);

/** Id público opaco con prefijo: 26 caracteres Crockford (≈130 bits), no secuencial (R7). */
export const id = (prefijo, semilla) => `${prefijo}_${b32(`${prefijo}:${semilla}`, 26)}`;
export const idEnlace = (semilla) => b64u(`enlace:${semilla}`, 22);
export const codigoRef = (semilla) => {
  const s = b32(`ref:${semilla}`, 10);
  return `VC-${s.slice(0, 4)}-${s.slice(4)}`;
};
export const traza = (semilla) => `tr_${hex(`traza:${semilla}`, 16)}`;

const T0 = Date.parse('2026-10-08T13:00:00Z');
/** Fecha-hora determinista: minutos después de la base. */
export const fh = (min = 0) => new Date(T0 + min * 60000).toISOString().replace('.000Z', 'Z');
export const fecha = (dias = 0) => new Date(T0 + dias * 86400000).toISOString().slice(0, 10);

export const clone = (x) => structuredClone(x);
