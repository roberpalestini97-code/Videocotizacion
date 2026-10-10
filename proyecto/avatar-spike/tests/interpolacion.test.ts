import { describe, expect, it } from 'vitest';
import { VISEMAS, type ItemVisema } from '../src/contrato/eventos';
import {
  duracionTurno,
  indiceActivo,
  normalizarItems,
  pesoItem,
  pesosEn,
  visemaDominante,
  visemaEsperado,
} from '../src/visemas/interpolacion';

const ejemplo: ItemVisema[] = [
  { v: 'sil', t_ms: 0, d_ms: 80 },
  { v: 'PP', t_ms: 80, d_ms: 60 },
  { v: 'aa', t_ms: 140, d_ms: 120 },
  { v: 'E', t_ms: 260, d_ms: 90 },
];
const suma = (p: Record<string, number>): number => Object.values(p).reduce((s, x) => s + x, 0);

describe('normalizarItems', () => {
  it('ordena por inicio', () => {
    const n = normalizarItems([ejemplo[2]!, ejemplo[0]!, ejemplo[3]!, ejemplo[1]!]);
    expect(n.map((x) => x.v)).toEqual(['sil', 'PP', 'aa', 'E']);
  });
  it('calcula fin = t + d', () => {
    expect(normalizarItems(ejemplo)[2]).toEqual({ v: 'aa', ini: 140, fin: 260 });
  });
  it('recorta solapamientos: manda el siguiente', () => {
    const n = normalizarItems([
      { v: 'aa', t_ms: 0, d_ms: 200 },
      { v: 'O', t_ms: 100, d_ms: 100 },
    ]);
    expect(n[0]!.fin).toBe(100);
    expect(n[1]!.ini).toBe(100);
  });
  it('descarta visemas desconocidos y duraciones inválidas', () => {
    const n = normalizarItems([
      { v: 'xx' as never, t_ms: 0, d_ms: 50 },
      { v: 'aa', t_ms: 10, d_ms: 0 },
      { v: 'E', t_ms: -5, d_ms: 50 },
      { v: 'O', t_ms: 20, d_ms: 6000 },
      { v: 'U', t_ms: 30, d_ms: 40 },
    ]);
    expect(n).toEqual([{ v: 'U', ini: 30, fin: 70 }]);
  });
  it('no muta la entrada', () => {
    const copia = JSON.parse(JSON.stringify(ejemplo));
    normalizarItems(ejemplo);
    expect(ejemplo).toEqual(copia);
  });
  it('elimina ítems que quedan de largo cero tras recortar', () => {
    const n = normalizarItems([
      { v: 'aa', t_ms: 100, d_ms: 50 },
      { v: 'O', t_ms: 100, d_ms: 50 },
    ]);
    expect(n.length).toBe(1);
  });
});

describe('indiceActivo (búsqueda binaria)', () => {
  const n = normalizarItems(ejemplo);
  it('antes del primero → -1', () => expect(indiceActivo(n, -1)).toBe(-1));
  it('en el borde exacto toma el ítem que empieza', () => expect(indiceActivo(n, 140)).toBe(2));
  it('después del último → último', () => expect(indiceActivo(n, 10_000)).toBe(3));
  it('coincide con búsqueda lineal en 2000 ítems', () => {
    const muchos: ItemVisema[] = Array.from({ length: 2000 }, (_, i) => ({ v: VISEMAS[i % 15]!, t_ms: i * 30, d_ms: 30 }));
    const nm = normalizarItems(muchos);
    for (const t of [0, 15, 29, 30, 31, 12_345, 59_970, 59_999]) {
      const lineal = nm.reduce((acc, it, i) => (it.ini <= t ? i : acc), -1);
      expect(indiceActivo(nm, t)).toBe(lineal);
    }
  });
});

describe('pesoItem (trapecio)', () => {
  const it0 = { v: 'aa' as const, ini: 100, fin: 300 };
  it('1 en el medio', () => expect(pesoItem(it0, 200, 60)).toBe(1));
  it('0,5 en el inicio exacto', () => expect(pesoItem(it0, 100, 60)).toBeCloseTo(0.5));
  it('0 fuera de la ventana de transición', () => {
    expect(pesoItem(it0, 69, 60)).toBe(0);
    expect(pesoItem(it0, 331, 60)).toBe(0);
  });
  it('curva suave = smoothstep (0,5 en el borde, más plana en extremos)', () => {
    expect(pesoItem(it0, 100, 60, 'suave')).toBeCloseTo(0.5);
    expect(pesoItem(it0, 80, 60, 'suave')).toBeLessThan(pesoItem(it0, 80, 60, 'lineal'));
  });
  it('ítem más corto que la transición llega a 1 en su centro', () => {
    expect(pesoItem({ v: 'PP', ini: 0, fin: 20 }, 10, 60)).toBeCloseTo(1);
  });
});

describe('pesosEn', () => {
  const n = normalizarItems(ejemplo);
  it('la suma de los 15 pesos es 1 en cualquier t', () => {
    for (let t = -100; t <= 500; t += 7) expect(suma(pesosEn(n, t))).toBeCloseTo(1, 9);
  });
  it('en el centro de un ítem largo el visema pesa 1', () => {
    expect(pesosEn(n, 200).aa).toBeCloseTo(1);
  });
  it('en la frontera entre dos ítems contiguos de igual transición: 0,5 y 0,5', () => {
    const p = pesosEn(n, 260);
    expect(p.aa).toBeCloseTo(0.5);
    expect(p.E).toBeCloseTo(0.5);
  });
  it('antes del inicio y después del fin → silencio', () => {
    expect(pesosEn(n, -500).sil).toBe(1);
    expect(pesosEn(n, 2000).sil).toBe(1);
  });
  it('en un hueco entre ítems → silencio', () => {
    const h = normalizarItems([
      { v: 'aa', t_ms: 0, d_ms: 100 },
      { v: 'O', t_ms: 400, d_ms: 100 },
    ]);
    expect(pesosEn(h, 250).sil).toBe(1);
  });
  it('lista vacía o t no finito → silencio', () => {
    expect(pesosEn([], 100).sil).toBe(1);
    expect(pesosEn(n, Number.NaN).sil).toBe(1);
  });
  it('ningún peso negativo ni mayor que 1', () => {
    for (let t = 0; t < 400; t += 3) {
      for (const v of VISEMAS) {
        const w = pesosEn(n, t, { transicionMs: 120 })[v];
        expect(w).toBeGreaterThanOrEqual(-1e-12);
        expect(w).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });
  it('el dominante coincide con el esperado en el centro de cada ítem', () => {
    for (const it of n) {
      const t = (it.ini + it.fin) / 2;
      expect(visemaDominante(pesosEn(n, t))).toBe(it.v);
    }
  });
  it('transicionMs mayor suaviza más (peso menor cerca del borde)', () => {
    expect(pesosEn(n, 150, { transicionMs: 100 }).aa).toBeLessThan(pesosEn(n, 150, { transicionMs: 20 }).aa);
  });
});

describe('visemaEsperado y duracionTurno', () => {
  const n = normalizarItems(ejemplo);
  it('esperado en cada tramo', () => {
    expect(visemaEsperado(n, 10)).toBe('sil');
    expect(visemaEsperado(n, 100)).toBe('PP');
    expect(visemaEsperado(n, 259)).toBe('aa');
    expect(visemaEsperado(n, 260)).toBe('E');
    expect(visemaEsperado(n, 351)).toBe('sil');
  });
  it('duración = fin del último', () => expect(duracionTurno(n)).toBe(350));
});
