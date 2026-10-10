// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Pizarron } from '../src/pizarron/Pizarron';
import type { EventoPizarronActualizado, EventoPizarronCorregir } from '../src/contrato/eventos';
import { AvatarClips, type MedioClip } from '../src/clips/AvatarClips';
import { catalogoPlaceholder } from '../src/clips/ColaClips';

const ev = (version: number, valor: string): EventoPizarronActualizado => ({
  v: 1, tipo: 'pizarron.actualizado', seq: version, ts: '2026-10-08T13:01:00Z',
  datos: { version, campos: [{ clave: 'superficie_m2', etiqueta: 'Superficie', valor, estado: 'anotado' }] },
});

describe('Pizarron (DOM)', () => {
  it('renderiza como texto, región aria-live polite', () => {
    const cont = document.createElement('div');
    const p = new Pizarron(cont);
    expect(p.recibir(ev(1, '40 m²'))).toBe(true);
    expect(cont.querySelector('dl')!.getAttribute('aria-live')).toBe('polite');
    expect(cont.querySelector('dd')!.textContent).toBe('40 m²');
  });
  it('no interpreta HTML aunque llegue (texto plano, R19)', () => {
    const cont = document.createElement('div');
    const p = new Pizarron(cont);
    // El reductor ya descarta <>; forzamos un valor con & y comillas, que sí son válidos.
    p.recibir(ev(1, 'Pared "A" & techo'));
    expect(cont.querySelector('dd')!.textContent).toBe('Pared "A" & techo');
    expect(cont.querySelectorAll('dd *').length).toBe(0);
  });
  it('versión vieja no re-renderiza', () => {
    const cont = document.createElement('div');
    const p = new Pizarron(cont);
    p.recibir(ev(2, '40 m²'));
    expect(p.recibir(ev(1, '99 m²'))).toBe(false);
    expect(cont.querySelector('dd')!.textContent).toBe('40 m²');
  });
  it('corregir emite pizarron.corregir y marca pendiente', () => {
    const cont = document.createElement('div');
    const enviados: EventoPizarronCorregir[] = [];
    const p = new Pizarron(cont, { alCorregir: (e) => enviados.push(e), siguienteSeq: () => 77 });
    p.recibir(ev(3, '40 m²'));
    p.corregir('superficie_m2', '41 m²');
    expect(enviados[0]!.datos).toEqual({ version_base: 3, clave: 'superficie_m2', valor: '41 m²' });
    expect(enviados[0]!.seq).toBe(77);
    expect(cont.querySelector('dd')!.getAttribute('data-pendiente')).toBe('si');
  });
});

describe('AvatarClips (DOM con medio falso)', () => {
  function medioFalso() {
    const llamadas: string[] = [];
    let terminar: (() => void) | null = null;
    const medio: MedioClip = {
      elemento: document.createElement('div'),
      reproducir: (r, fin) => { llamadas.push(r.clip_id); terminar = fin; },
      detener: () => llamadas.push('detener'),
      liberar: () => {},
    };
    return { medio, llamadas, terminar: () => terminar?.() };
  }
  it('respuesta con clip_id lo reproduce y pone el subtítulo como texto', () => {
    const cont = document.createElement('div');
    const f = medioFalso();
    const a = new AvatarClips(cont, { catalogo: catalogoPlaceholder(), medio: f.medio });
    a.recibirRespuesta({ v: 1, tipo: 'avatar.respuesta', seq: 1, ts: 'x', datos: { turno: 1, texto: '¿Qué trabajo necesitás?', clip_id: 'clip_preguntar' } });
    expect(f.llamadas).toEqual(['clip_espera', 'detener', 'clip_preguntar']);
    expect(a.subtitulo.textContent).toBe('¿Qué trabajo necesitás?');
    f.terminar();
    expect(a.cola.reproduciendo?.clip_id).toBe('clip_espera');
  });
  it('respuesta sin clip_id: solo subtítulo', () => {
    const cont = document.createElement('div');
    const a = new AvatarClips(cont, { catalogo: catalogoPlaceholder(), medio: medioFalso().medio });
    expect(a.recibirRespuesta({ v: 1, tipo: 'avatar.respuesta', seq: 1, ts: 'x', datos: { turno: 1, texto: 'Hola' } })).toBe('sin_clip');
    expect(a.subtitulo.textContent).toBe('Hola');
  });
});
