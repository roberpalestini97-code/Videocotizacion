import { describe, expect, it } from 'vitest';
import { CLIP_POR_ACCION, ColaClips, catalogoPlaceholder, type EventoCola } from '../src/clips/ColaClips';

function nueva(op: { capacidad?: number; espera?: boolean } = {}) {
  const eventos: EventoCola[] = [];
  const cola = new ColaClips(catalogoPlaceholder(), { capacidad: op.capacidad, clipEspera: op.espera === false ? undefined : 'clip_espera' });
  cola.alEvento((e) => eventos.push(e));
  return { cola, eventos };
}
const inicios = (ev: EventoCola[]) => ev.filter((e) => e.tipo === 'iniciar').map((e) => (e as Extract<EventoCola, { tipo: 'iniciar' }>).reproduccion.clip_id);

describe('ColaClips', () => {
  it('arrancar() pone el clip de espera en loop', () => {
    const { cola } = nueva();
    cola.arrancar();
    expect(cola.reproduciendo?.clip_id).toBe('clip_espera');
    expect(cola.reproduciendo?.loop).toBe(true);
  });
  it('un pedido corta la espera y empieza enseguida', () => {
    const { cola, eventos } = nueva();
    cola.arrancar();
    expect(cola.encolar({ clip_id: 'clip_saludo', turno: 1 })).toBe('reproduciendo');
    expect(eventos.some((e) => e.tipo === 'detener')).toBe(true);
    expect(cola.reproduciendo?.clip_id).toBe('clip_saludo');
  });
  it('FIFO dentro del mismo turno y vuelta a espera al final', () => {
    const { cola, eventos } = nueva();
    cola.arrancar();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    expect(cola.encolar({ clip_id: 'clip_preguntar', turno: 1 })).toBe('en_cola');
    cola.terminado(cola.reproduciendo!.id);
    expect(cola.reproduciendo?.clip_id).toBe('clip_preguntar');
    cola.terminado(cola.reproduciendo!.id);
    expect(cola.reproduciendo?.clip_id).toBe('clip_espera');
    expect(inicios(eventos)).toEqual(['clip_espera', 'clip_saludo', 'clip_preguntar', 'clip_espera']);
  });
  it('avisos de terminado con id viejo se ignoran', () => {
    const { cola } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    const viejo = cola.reproduciendo!.id;
    cola.encolar({ clip_id: 'clip_cerrar', turno: 2 }); // corta saludo
    cola.terminado(viejo);
    expect(cola.reproduciendo?.clip_id).toBe('clip_cerrar');
  });
  it('turno nuevo descarta pendientes del turno anterior y corta el clip en curso', () => {
    const { cola, eventos } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    cola.encolar({ clip_id: 'clip_preguntar', turno: 1 });
    cola.encolar({ clip_id: 'clip_pedir_ver', turno: 2 });
    expect(cola.reproduciendo?.clip_id).toBe('clip_pedir_ver');
    expect(cola.enCola.length).toBe(0);
    expect(eventos.filter((e) => e.tipo === 'descartado').length).toBe(1);
  });
  it('turno viejo → rechazado', () => {
    const { cola } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 5 });
    expect(cola.encolar({ clip_id: 'clip_preguntar', turno: 4 })).toBe('turno_viejo');
  });
  it('clip_id fuera de patrón → id_invalido; no está en catálogo → faltante', () => {
    const { cola, eventos } = nueva();
    expect(cola.encolar({ clip_id: 'Clip-Malo', turno: 1 })).toBe('id_invalido');
    expect(cola.encolar({ clip_id: 'clip_no_existe', turno: 1, texto: 'hola' })).toBe('faltante');
    expect(eventos.find((e) => e.tipo === 'faltante')).toBeTruthy();
  });
  it('cola acotada: descarta el pendiente más viejo', () => {
    const { cola, eventos } = nueva({ capacidad: 2 });
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 }); // suena
    cola.encolar({ clip_id: 'clip_preguntar', turno: 1 });
    cola.encolar({ clip_id: 'clip_pedir_ver', turno: 1 });
    cola.encolar({ clip_id: 'clip_confirmar_datos', turno: 1 });
    expect(cola.enCola.map((p) => p.clip_id)).toEqual(['clip_pedir_ver', 'clip_confirmar_datos']);
    const d = eventos.find((e) => e.tipo === 'descartado') as Extract<EventoCola, { tipo: 'descartado' }>;
    expect(d.motivo).toBe('cola_llena');
    expect(d.pedido.clip_id).toBe('clip_preguntar');
  });
  it('interrumpir (barge-in) vacía la cola y vuelve a espera', () => {
    const { cola } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    cola.encolar({ clip_id: 'clip_preguntar', turno: 1 });
    cola.interrumpir();
    expect(cola.enCola.length).toBe(0);
    expect(cola.reproduciendo?.clip_id).toBe('clip_espera');
  });
  it('fallo de reproducción salta al siguiente e informa faltante', () => {
    const { cola, eventos } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    cola.encolar({ clip_id: 'clip_preguntar', turno: 1 });
    cola.fallo(cola.reproduciendo!.id);
    expect(cola.reproduciendo?.clip_id).toBe('clip_preguntar');
    expect(eventos.some((e) => e.tipo === 'faltante')).toBe(true);
  });
  it('sin clip de espera queda en reposo (null) al terminar', () => {
    const { cola } = nueva({ espera: false });
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    cola.terminado(cola.reproduciendo!.id);
    expect(cola.reproduciendo).toBeNull();
  });
  it('el texto del turno reemplaza al subtítulo por defecto del catálogo', () => {
    const { cola } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1, texto: 'Buenas, ¿qué necesitás?' });
    expect(cola.reproduciendo?.texto).toBe('Buenas, ¿qué necesitás?');
  });
  it('proximoParaPrecargar devuelve la URL del siguiente pendiente', () => {
    const { cola } = nueva();
    cola.encolar({ clip_id: 'clip_saludo', turno: 1 });
    expect(cola.proximoParaPrecargar()).toBeNull();
    cola.encolar({ clip_id: 'clip_cerrar', turno: 1 });
    expect(cola.proximoParaPrecargar()).toBe('placeholder:cerrar');
  });
  it('hay clip placeholder para cada acción de siguiente_paso (ADR 0002 §9)', () => {
    const cat = catalogoPlaceholder();
    expect(Object.keys(CLIP_POR_ACCION).sort()).toEqual(
      ['confirmar_datos', 'derivar_whatsapp', 'emitir_presupuesto', 'fuera_de_alcance', 'fuera_de_zona', 'pedir_ver', 'preguntar', 'cerrar'].sort(),
    );
    for (const id of Object.values(CLIP_POR_ACCION)) {
      expect(cat[id]).toBeTruthy();
      expect(id).toMatch(/^clip_[a-z0-9_]{2,40}$/);
    }
  });
});
