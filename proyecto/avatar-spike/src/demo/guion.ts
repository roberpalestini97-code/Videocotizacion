/**
 * Guion de ejemplo del harness: tres turnos del avatar con visemas (formato del contrato)
 * y eventos de pizarrón. Todo es SINTÉTICO: no hay TTS ni LLM.
 */
import type { EventoAvatarVisemas, EventoPizarronActualizado, CampoPizarron } from '../contrato/eventos';
import { itemsDesdeTexto } from '../visemas/desdeTexto';

export const TURNOS_DEMO = [
  'Hola, soy Beto, del equipo de cotización. ¿Qué trabajo necesitás?',
  'Perfecto, pintura interior. ¿Cuántos metros cuadrados son, más o menos?',
  'Bárbaro. Mostrame la pared con la cámara, así veo cómo está.',
] as const;

const ts = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function eventoVisemas(turno: number, texto: string, seq: number): EventoAvatarVisemas {
  return { v: 1, tipo: 'avatar.visemas', seq, ts: ts(), datos: { turno, items: itemsDesdeTexto(texto) } };
}

export function eventoPizarron(version: number, campos: CampoPizarron[], seq: number): EventoPizarronActualizado {
  return { v: 1, tipo: 'pizarron.actualizado', seq, ts: ts(), datos: { version, campos } };
}

/** Versiones del pizarrón que se van mandando durante el demo (una por turno). */
export const PIZARRON_DEMO: CampoPizarron[][] = [
  [
    { clave: 'oficio', etiqueta: 'Oficio', valor: 'A definir', estado: 'faltante' },
    { clave: 'zona', etiqueta: 'Zona', valor: 'Parque Lago', estado: 'anotado' },
  ],
  [
    { clave: 'oficio', etiqueta: 'Oficio', valor: 'Pintura', estado: 'anotado' },
    { clave: 'tarea', etiqueta: 'Tarea', valor: 'Pintura interior', estado: 'anotado' },
    { clave: 'zona', etiqueta: 'Zona', valor: 'Parque Lago', estado: 'anotado' },
    { clave: 'superficie_m2', etiqueta: 'Superficie', valor: 'Falta', estado: 'faltante' },
  ],
  [
    { clave: 'oficio', etiqueta: 'Oficio', valor: 'Pintura', estado: 'anotado' },
    { clave: 'tarea', etiqueta: 'Tarea', valor: 'Pintura interior', estado: 'anotado' },
    { clave: 'zona', etiqueta: 'Zona', valor: 'Parque Lago', estado: 'anotado' },
    { clave: 'superficie_m2', etiqueta: 'Superficie', valor: '40 m²', estado: 'anotado' },
    { clave: 'estado_superficie', etiqueta: 'Estado de la pared', valor: 'Falta ver con la cámara', estado: 'faltante' },
  ],
];
