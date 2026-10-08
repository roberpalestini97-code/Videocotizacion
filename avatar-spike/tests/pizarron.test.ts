import { describe, expect, it } from 'vitest';
import type { CampoPizarron, EventoPizarronActualizado } from '../src/contrato/eventos';
import {
  ESTADO_INICIAL,
  eventoCorreccion,
  faltantes,
  pareceMonto,
  reducirPizarron,
  vistaPizarron,
  type EstadoPizarron,
} from '../src/pizarron/reductor';

const c = (clave: string, valor: string, estado: CampoPizarron['estado'] = 'anotado'): CampoPizarron => ({
  clave,
  etiqueta: clave.replace(/_/g, ' '),
  valor,
  estado,
});
const ev = (version: number, campos: CampoPizarron[]): EventoPizarronActualizado => ({
  v: 1, tipo: 'pizarron.actualizado', seq: version, ts: '2026-10-08T13:01:00Z', datos: { version, campos },
});
const aplicar = (s: EstadoPizarron, e: EventoPizarronActualizado) => reducirPizarron(s, { tipo: 'servidor', evento: e });

describe('reducirPizarron: versiones', () => {
  it('aplica la primera versión', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura')]));
    expect(s.version).toBe(1);
    expect(s.campos.length).toBe(1);
  });
  it('ignora versiones iguales o menores (duplicado, desorden, reconexión)', () => {
    let s = aplicar(ESTADO_INICIAL, ev(3, [c('oficio', 'Pintura')]));
    s = aplicar(s, ev(2, [c('oficio', 'Jardinería')]));
    s = aplicar(s, ev(3, [c('oficio', 'Jardinería')]));
    expect(s.campos[0]!.valor).toBe('Pintura');
    expect(s.ignorados).toBe(2);
  });
  it('acepta saltos de versión (se perdieron intermedias: manda el completo)', () => {
    let s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura')]));
    s = aplicar(s, ev(7, [c('oficio', 'Pintura'), c('zona', 'Cobo')]));
    expect(s.version).toBe(7);
    expect(s.campos.length).toBe(2);
  });
  it('no muta el estado anterior', () => {
    const s1 = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura')]));
    const copia = JSON.stringify(s1);
    aplicar(s1, ev(2, [c('oficio', 'Jardinería')]));
    expect(JSON.stringify(s1)).toBe(copia);
  });
  it('evento mal formado se ignora', () => {
    const s = reducirPizarron(ESTADO_INICIAL, { tipo: 'servidor', evento: { ...ev(1, []), datos: { version: 0, campos: [] } } });
    expect(s.version).toBe(0);
    expect(s.ignorados).toBe(1);
  });
});

describe('reducirPizarron: defensa del cliente', () => {
  it('descarta campos inválidos (clave, <>, largo) y cuenta descartados', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [
      c('oficio', 'Pintura'),
      c('Clave-Mala', 'x'),
      c('zona', '<img src=x onerror=alert(1)>'),
      c('nota', 'x'.repeat(201)),
    ]));
    expect(s.campos.map((x) => x.clave)).toEqual(['oficio']);
    expect(s.descartados).toBe(3);
  });
  it('descarta valores que parecen montos (el precio va solo al final)', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura'), c('total', '$ 150.000'), c('estimado', '150 mil pesos')]));
    expect(s.campos.map((x) => x.clave)).toEqual(['oficio']);
  });
  it('pareceMonto: detecta $, pesos, ARS, USD; no confunde m² ni números sueltos', () => {
    expect(pareceMonto('$100')).toBe(true);
    expect(pareceMonto('ARS 10')).toBe(true);
    expect(pareceMonto('u$s 30')).toBe(true);
    expect(pareceMonto('10 dólares')).toBe(true);
    expect(pareceMonto('40 m²')).toBe(false);
    expect(pareceMonto('Altura 3 m')).toBe(false);
    expect(pareceMonto('Parque Lago')).toBe(false);
  });
  it('claves duplicadas: gana la primera', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura'), c('oficio', 'Jardinería')]));
    expect(s.campos).toEqual([c('oficio', 'Pintura')]);
  });
  it('trunca a 40 campos', () => {
    const muchos = Array.from({ length: 45 }, (_, i) => c(`campo_${i}`, 'x'));
    const s = aplicar(ESTADO_INICIAL, ev(1, muchos));
    expect(s.campos.length).toBe(40);
    expect(s.descartados).toBe(5);
  });
});

describe('reducirPizarron: cambios y correcciones', () => {
  it('marca como cambiadas solo las claves nuevas o modificadas', () => {
    let s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura'), c('superficie_m2', 'Falta', 'faltante')]));
    expect(s.cambiadas).toEqual(['oficio', 'superficie_m2']);
    s = aplicar(s, ev(2, [c('oficio', 'Pintura'), c('superficie_m2', '40 m²')]));
    expect(s.cambiadas).toEqual(['superficie_m2']);
  });
  it('corrección del cliente: queda pendiente con version_base y arma pizarron.corregir', () => {
    let s = aplicar(ESTADO_INICIAL, ev(4, [c('superficie_m2', '40 m²')]));
    s = reducirPizarron(s, { tipo: 'corregir', clave: 'superficie_m2', valor: ' 41 m² ' });
    expect(s.pendientes.superficie_m2).toEqual({ valor: '41 m²', version_base: 4 });
    const e = eventoCorreccion(s, 'superficie_m2', 12, new Date('2026-10-08T13:01:00.123Z'))!;
    expect(e).toEqual({ v: 1, tipo: 'pizarron.corregir', seq: 12, ts: '2026-10-08T13:01:00Z', datos: { version_base: 4, clave: 'superficie_m2', valor: '41 m²' } });
  });
  it('la vista muestra la corrección pendiente como corregido_por_cliente', () => {
    let s = aplicar(ESTADO_INICIAL, ev(1, [c('superficie_m2', '40 m²')]));
    s = reducirPizarron(s, { tipo: 'corregir', clave: 'superficie_m2', valor: '41 m²' });
    const v = vistaPizarron(s)[0]!;
    expect(v).toMatchObject({ valor: '41 m²', estado: 'corregido_por_cliente', pendiente: true });
  });
  it('la versión siguiente del servidor resuelve el pendiente (el servidor manda)', () => {
    let s = aplicar(ESTADO_INICIAL, ev(1, [c('superficie_m2', '40 m²')]));
    s = reducirPizarron(s, { tipo: 'corregir', clave: 'superficie_m2', valor: '41 m²' });
    s = aplicar(s, ev(2, [c('superficie_m2', '40 m²')])); // el servidor no la aceptó
    expect(s.pendientes).toEqual({});
    expect(vistaPizarron(s)[0]!.valor).toBe('40 m²');
  });
  it('corrección inválida (clave inexistente, vacía, con <>) no cambia nada', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('superficie_m2', '40 m²')]));
    expect(reducirPizarron(s, { tipo: 'corregir', clave: 'altura', valor: '3 m' })).toBe(s);
    expect(reducirPizarron(s, { tipo: 'corregir', clave: 'superficie_m2', valor: '   ' })).toBe(s);
    expect(reducirPizarron(s, { tipo: 'corregir', clave: 'superficie_m2', valor: '<b>' })).toBe(s);
  });
  it('sin pizarrón del servidor no se puede armar corrección', () => {
    expect(eventoCorreccion(ESTADO_INICIAL, 'x', 1)).toBeNull();
  });
  it('faltantes() lista las claves con estado faltante', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura'), c('altura', 'Falta', 'faltante')]));
    expect(faltantes(s)).toEqual(['altura']);
  });
  it('reiniciar vuelve al estado inicial', () => {
    const s = aplicar(ESTADO_INICIAL, ev(1, [c('oficio', 'Pintura')]));
    expect(reducirPizarron(s, { tipo: 'reiniciar' })).toBe(ESTADO_INICIAL);
  });
});
