/**
 * Pizarrón en vivo: estado de los datos que el asistente va anotando.
 * Se actualiza con `pizarron.actualizado` (versión creciente) y NUNCA corta la
 * conversación. Defensa en profundidad: el contrato dice que no trae montos
 * (precio solo al final); si llegara uno igual, no se muestra.
 */
import type { CampoPizarron } from "./tipos";

export type Pizarron = { version: number; campos: CampoPizarron[] };

export const PIZARRON_VACIO: Pizarron = { version: 0, campos: [] };

const CLAVE_DE_MONTO = /(precio|monto|importe|costo|cost|total|presupuesto|tarifa|valor_hora|honorario)/i;
const VALOR_DE_MONTO = /(\$\s?\d|\d\s?(pesos|ars|usd|dolares|dólares)\b|\bmil\s+pesos)/i;

export function esCampoDeMonto(c: Pick<CampoPizarron, "clave" | "valor">): boolean {
  return CLAVE_DE_MONTO.test(c.clave) || VALOR_DE_MONTO.test(c.valor);
}

export function aplicarPizarron(actual: Pizarron, version: number, campos: CampoPizarron[]): Pizarron {
  if (version <= actual.version) return actual; // viejo o repetido (reenvío tras reconexión)
  return { version, campos: campos.filter((c) => !esCampoDeMonto(c)) };
}

export function camposVisibles(p: Pizarron): { anotados: CampoPizarron[]; faltantes: CampoPizarron[] } {
  return {
    anotados: p.campos.filter((c) => c.estado !== "faltante"),
    faltantes: p.campos.filter((c) => c.estado === "faltante"),
  };
}
