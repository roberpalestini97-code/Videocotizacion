/**
 * Reducción de eventos del pizarrón en vivo (ADR 0006 §4, contrato `pizarron.actualizado`
 * y `pizarron.corregir`). PURA: estado → acción → estado nuevo (no muta).
 *
 * Reglas:
 * - El servidor manda el pizarrón COMPLETO con `version` creciente. Versiones ≤ a la actual
 *   se ignoran (duplicados, desorden, reenvío tras reconexión).
 * - Campos inválidos según el contrato se descartan (defensa: el cliente no confía).
 * - Defensa en profundidad: un valor que parece un MONTO ($, "pesos", ARS, USD) se descarta
 *   aunque el contrato ya lo prohíba (el precio va solo al final, BRIEF 5).
 * - Claves duplicadas: gana la primera. Más de 40 campos: se truncan.
 * - `cambiadas`: claves cuyo valor o estado cambió respecto de la versión anterior (para
 *   resaltarlas sin interrumpir la conversación).
 * - Correcciones del cliente: se muestran como pendientes hasta que llega una versión del
 *   servidor mayor que `version_base`; el servidor manda (si rechazó, se ve su valor).
 */
import {
  LIMITES,
  RE_TEXTO_PLANO,
  validarCampoPizarron,
  type CampoPizarron,
  type EventoPizarronActualizado,
  type EventoPizarronCorregir,
} from '../contrato/eventos';

export interface Pendiente {
  valor: string;
  version_base: number;
}

export interface EstadoPizarron {
  version: number;
  campos: readonly CampoPizarron[];
  cambiadas: readonly string[];
  pendientes: Readonly<Record<string, Pendiente>>;
  descartados: number;
  ignorados: number;
}

export type AccionPizarron =
  | { tipo: 'servidor'; evento: EventoPizarronActualizado }
  | { tipo: 'corregir'; clave: string; valor: string }
  | { tipo: 'reiniciar' };

export const ESTADO_INICIAL: EstadoPizarron = Object.freeze({
  version: 0,
  campos: [],
  cambiadas: [],
  pendientes: {},
  descartados: 0,
  ignorados: 0,
});

const RE_MONTO = /\$|\b(ars|usd|u\$s|pesos?|d[oó]lares?)\b/i;
export function pareceMonto(texto: string): boolean {
  return RE_MONTO.test(texto);
}

export function reducirPizarron(s: EstadoPizarron, a: AccionPizarron): EstadoPizarron {
  switch (a.tipo) {
    case 'reiniciar':
      return ESTADO_INICIAL;
    case 'servidor': {
      const ev = a.evento;
      const d = ev?.datos;
      if (
        !ev ||
        ev.tipo !== 'pizarron.actualizado' ||
        !d ||
        !Number.isInteger(d.version) ||
        d.version < 1 ||
        d.version > LIMITES.versionPizarronMax ||
        !Array.isArray(d.campos)
      ) {
        return { ...s, ignorados: s.ignorados + 1 };
      }
      if (d.version <= s.version) return { ...s, ignorados: s.ignorados + 1 };
      const vistos = new Set<string>();
      const campos: CampoPizarron[] = [];
      let descartados = 0;
      for (const c of d.campos) {
        if (campos.length >= LIMITES.camposPizarronMax) {
          descartados++;
          continue;
        }
        if (!validarCampoPizarron(c).ok || vistos.has(c.clave) || pareceMonto(c.valor) || pareceMonto(c.etiqueta)) {
          descartados++;
          continue;
        }
        vistos.add(c.clave);
        campos.push({ clave: c.clave, etiqueta: c.etiqueta, valor: c.valor, estado: c.estado });
      }
      const previo = new Map(s.campos.map((c) => [c.clave, c]));
      const cambiadas = campos
        .filter((c) => {
          const p = previo.get(c.clave);
          return !p || p.valor !== c.valor || p.estado !== c.estado;
        })
        .map((c) => c.clave);
      const pendientes: Record<string, Pendiente> = {};
      for (const [k, p] of Object.entries(s.pendientes)) {
        if (d.version <= p.version_base) pendientes[k] = p; // todavía no la procesó
      }
      return { version: d.version, campos, cambiadas, pendientes, descartados: s.descartados + descartados, ignorados: s.ignorados };
    }
    case 'corregir': {
      if (!s.campos.some((c) => c.clave === a.clave)) return s;
      const v = a.valor.trim();
      if (v.length < 1 || v.length > LIMITES.valorMax || !RE_TEXTO_PLANO.test(v)) return s;
      return { ...s, pendientes: { ...s.pendientes, [a.clave]: { valor: v, version_base: s.version } } };
    }
  }
}

/** Vista para pantalla: aplica pendientes encima de lo del servidor. */
export interface FilaVista extends CampoPizarron {
  pendiente: boolean;
  cambiada: boolean;
}

export function vistaPizarron(s: EstadoPizarron): FilaVista[] {
  const cambiadas = new Set(s.cambiadas);
  return s.campos.map((c) => {
    const p = s.pendientes[c.clave];
    return p
      ? { ...c, valor: p.valor, estado: 'corregido_por_cliente', pendiente: true, cambiada: true }
      : { ...c, pendiente: false, cambiada: cambiadas.has(c.clave) };
  });
}

/** Arma el evento `pizarron.corregir` para mandar al servidor (o null si no aplica). */
export function eventoCorreccion(s: EstadoPizarron, clave: string, seq: number, ahora: Date = new Date()): EventoPizarronCorregir | null {
  const p = s.pendientes[clave];
  if (!p || p.version_base < 1) return null;
  return {
    v: 1,
    tipo: 'pizarron.corregir',
    seq,
    ts: ahora.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    datos: { version_base: p.version_base, clave, valor: p.valor },
  };
}

/** Faltantes (para que el avatar sepa qué preguntar y para mostrarlo destacado). */
export function faltantes(s: EstadoPizarron): string[] {
  return s.campos.filter((c) => c.estado === 'faltante').map((c) => c.clave);
}
