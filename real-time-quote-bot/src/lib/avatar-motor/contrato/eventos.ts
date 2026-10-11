// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Tipos y validación mínima de los eventos de sesión que usa el avatar.
 *
 * Copia local del BORRADOR `vc-eventos.borrador.1` (contracts/eventos-sesion.md y
 * contracts/schemas/eventos/*). NO CONGELADO: si el contrato cambia, este archivo se
 * regenera. El spike no importa los esquemas JSON para no acoplarse a ajv en el navegador;
 * replica solo las restricciones que el cliente necesita para defenderse.
 */

/** Los 15 visemas del contrato (mismo orden que el enum del esquema). */
export const VISEMAS = [
  'sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U',
] as const;
export type Visema = (typeof VISEMAS)[number];

export interface ItemVisema {
  v: Visema;
  /** Inicio en ms desde el comienzo del audio del turno (0..600000). */
  t_ms: number;
  /** Duración en ms (1..5000). */
  d_ms: number;
}

export interface Sobre<T extends string, D> {
  v: 1;
  tipo: T;
  seq: number;
  ts: string;
  datos: D;
}

export type EventoAvatarVisemas = Sobre<'avatar.visemas', { turno: number; items: ItemVisema[] }>;
export type EventoAvatarRespuesta = Sobre<'avatar.respuesta', { turno: number; texto: string; clip_id?: string }>;

export type EstadoCampo = 'anotado' | 'corregido_por_cliente' | 'faltante';
export interface CampoPizarron {
  clave: string;
  etiqueta: string;
  valor: string;
  estado: EstadoCampo;
}
export type EventoPizarronActualizado = Sobre<'pizarron.actualizado', { version: number; campos: CampoPizarron[] }>;
export type EventoPizarronCorregir = Sobre<'pizarron.corregir', { version_base: number; clave: string; valor: string }>;

export type MotivoDescarteFotograma = 'frecuencia' | 'tamano' | 'dimensiones' | 'formato' | 'tope_sesion';
export type EventoCamaraFotograma = Sobre<
  'camara.fotograma',
  { seq_fotograma: number; resultado: 'aceptado' | 'descartado'; motivo?: MotivoDescarteFotograma }
>;

export const LIMITES = {
  turnoMax: 500,
  itemsVisemasMax: 2000,
  tMsMax: 600_000,
  dMsMax: 5_000,
  camposPizarronMax: 40,
  versionPizarronMax: 100_000,
  etiquetaMax: 60,
  valorMax: 200,
  uint32Max: 4_294_967_295,
} as const;

/** Patrón de texto plano del contrato: sin `<`, `>` ni caracteres de control (salvo \t \n \r). */
// eslint-disable-next-line no-control-regex
export const RE_TEXTO_PLANO = /^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F]*$/;
export const RE_CLAVE = /^[a-z0-9_]{2,60}$/;
export const RE_CLIP_ID = /^clip_[a-z0-9_]{2,40}$/;

const CONJUNTO_VISEMAS: ReadonlySet<string> = new Set(VISEMAS);
export function esVisema(x: unknown): x is Visema {
  return typeof x === 'string' && CONJUNTO_VISEMAS.has(x);
}

function esEntero(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
}

/** Valida un `avatar.visemas` con las mismas cotas que el esquema. */
export function validarEventoVisemas(e: unknown): ResultadoValidacion {
  const errores: string[] = [];
  const ev = e as Partial<EventoAvatarVisemas> | null;
  if (!ev || typeof ev !== 'object') return { ok: false, errores: ['no es objeto'] };
  if (ev.v !== 1) errores.push('v debe ser 1');
  if (ev.tipo !== 'avatar.visemas') errores.push('tipo inválido');
  if (!esEntero(ev.seq, 0, LIMITES.uint32Max)) errores.push('seq inválido');
  const d = ev.datos;
  if (!d || typeof d !== 'object') return { ok: false, errores: [...errores, 'datos ausente'] };
  if (!esEntero(d.turno, 1, LIMITES.turnoMax)) errores.push('turno fuera de rango');
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > LIMITES.itemsVisemasMax) {
    errores.push('items: entre 1 y 2000');
  } else {
    d.items.forEach((it, i) => {
      if (!it || typeof it !== 'object') {
        errores.push(`items[${i}] no es objeto`);
        return;
      }
      const extra = Object.keys(it).filter((k) => k !== 'v' && k !== 't_ms' && k !== 'd_ms');
      if (extra.length) errores.push(`items[${i}] propiedades extra: ${extra.join(',')}`);
      if (!esVisema(it.v)) errores.push(`items[${i}].v desconocido`);
      if (!esEntero(it.t_ms, 0, LIMITES.tMsMax)) errores.push(`items[${i}].t_ms fuera de rango`);
      if (!esEntero(it.d_ms, 1, LIMITES.dMsMax)) errores.push(`items[${i}].d_ms fuera de rango`);
    });
  }
  return { ok: errores.length === 0, errores };
}

/** Valida un campo del pizarrón (clave, etiqueta, valor, estado). */
export function validarCampoPizarron(c: unknown): ResultadoValidacion {
  const errores: string[] = [];
  const x = c as Partial<CampoPizarron> | null;
  if (!x || typeof x !== 'object') return { ok: false, errores: ['no es objeto'] };
  if (typeof x.clave !== 'string' || !RE_CLAVE.test(x.clave)) errores.push('clave inválida');
  if (
    typeof x.etiqueta !== 'string' ||
    x.etiqueta.length < 1 ||
    x.etiqueta.length > LIMITES.etiquetaMax ||
    !RE_TEXTO_PLANO.test(x.etiqueta)
  )
    errores.push('etiqueta inválida');
  if (
    typeof x.valor !== 'string' ||
    x.valor.length < 1 ||
    x.valor.length > LIMITES.valorMax ||
    !RE_TEXTO_PLANO.test(x.valor)
  )
    errores.push('valor inválido');
  if (x.estado !== 'anotado' && x.estado !== 'corregido_por_cliente' && x.estado !== 'faltante')
    errores.push('estado inválido');
  return { ok: errores.length === 0, errores };
}
