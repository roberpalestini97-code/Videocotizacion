import { describe, expect, it } from 'vitest';
import { itemsDesdeTexto, visemasDeTexto } from '../src/visemas/desdeTexto';
import { prng, rmsVentana, sintetizarAudio } from '../src/demo/audioSintetico';
import { validarEventoVisemas } from '../src/contrato/eventos';
import { TURNOS_DEMO, eventoVisemas } from '../src/demo/guion';
import { normalizarItems, pesosEn } from '../src/visemas/interpolacion';
import { articulacionMezclada } from '../src/modelo/blendshapes';

describe('visemas desde texto (rioplatense)', () => {
  it('vocales y bilabiales', () => expect(visemasDeTexto('mamá')).toEqual(['PP', 'aa', 'PP', 'aa']));
  it('seseo: ce/ci/z → SS; ca/co/cu → kk', () => {
    expect(visemasDeTexto('cielo')[0]).toBe('SS');
    expect(visemasDeTexto('casa')).toEqual(['kk', 'aa', 'SS', 'aa']);
    expect(visemasDeTexto('zona')[0]).toBe('SS');
  });
  it('ch y ll → CH; y + vocal → CH; h muda', () => {
    expect(visemasDeTexto('chau')[0]).toBe('CH');
    expect(visemasDeTexto('lluvia')[0]).toBe('CH');
    expect(visemasDeTexto('yo')[0]).toBe('CH');
    expect(visemasDeTexto('hola')).toEqual(['O', 'nn', 'aa']);
  });
  it('rr cuenta una sola vez; puntuación → silencios', () => {
    expect(visemasDeTexto('perro').filter((v) => v === 'RR').length).toBe(1);
    expect(visemasDeTexto('a.').slice(1)).toEqual(['sil', 'sil', 'sil']);
  });
  it('items con tiempos contiguos, silencios colapsados y válidos según el contrato', () => {
    const it = itemsDesdeTexto('Hola,   ¿qué tal?');
    for (let i = 1; i < it.length; i++) expect(it[i]!.t_ms).toBe(it[i - 1]!.t_ms + it[i - 1]!.d_ms);
    for (let i = 1; i < it.length; i++) expect(it[i]!.v === 'sil' && it[i - 1]!.v === 'sil').toBe(false);
    expect(validarEventoVisemas({ v: 1, tipo: 'avatar.visemas', seq: 0, ts: 'x', datos: { turno: 1, items: it } }).ok).toBe(true);
  });
  it('los eventos del guion del demo validan contra el contrato', () => {
    TURNOS_DEMO.forEach((t, i) => expect(validarEventoVisemas(eventoVisemas(i + 1, t, i)).ok).toBe(true));
  });
});

describe('audio sintético', () => {
  const items = itemsDesdeTexto('Hola, soy Beto.');
  const sr = 16000;
  const audio = sintetizarAudio(items, { sampleRate: sr });
  it('largo = fin del último ítem + cola', () => {
    const fin = items.at(-1)!.t_ms + items.at(-1)!.d_ms;
    expect(audio.length).toBe(Math.ceil(((fin + 100) / 1000) * sr));
  });
  it('determinista con la misma semilla', () => {
    expect(sintetizarAudio(items, { sampleRate: sr })).toEqual(audio);
  });
  it('sin clipping (|x| ≤ 1)', () => {
    let max = 0;
    for (const x of audio) max = Math.max(max, Math.abs(x));
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThan(0.05);
  });
  it('energía en vocales ≫ energía en silencios', () => {
    const vocales = items.filter((i) => ['aa', 'E', 'I', 'O', 'U'].includes(i.v));
    const silencios = items.filter((i) => i.v === 'sil');
    const rv = vocales.reduce((s, i) => s + rmsVentana(audio, sr, i.t_ms + 15, i.t_ms + i.d_ms - 15), 0) / vocales.length;
    const rs = silencios.reduce((s, i) => s + rmsVentana(audio, sr, i.t_ms + 12, i.t_ms + i.d_ms - 12), 0) / silencios.length;
    expect(rv).toBeGreaterThan(0.05);
    expect(rs).toBeLessThan(rv / 20);
  });
  it('coherencia audio↔boca: apertura de mandíbula correlaciona con la energía (r > 0,5)', () => {
    const n = normalizarItems(items);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let t = 0; t < n.at(-1)!.fin; t += 10) {
      xs.push(articulacionMezclada(pesosEn(n, t)).mandibula);
      ys.push(rmsVentana(audio, sr, t - 10, t + 10));
    }
    const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const mx = m(xs), my = m(ys);
    let num = 0, dx = 0, dy = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); dx += (x - mx) ** 2; dy += (ys[i]! - my) ** 2; });
    expect(num / Math.sqrt(dx * dy)).toBeGreaterThan(0.5);
  });
  it('prng en [0,1) y con semilla 0 no se traba', () => {
    const r = prng(0);
    const xs = Array.from({ length: 1000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    expect(new Set(xs).size).toBeGreaterThan(990);
  });
});
