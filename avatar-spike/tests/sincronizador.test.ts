import { describe, expect, it } from 'vitest';
import type { EventoAvatarVisemas, ItemVisema } from '../src/contrato/eventos';
import { SincronizadorVisemas } from '../src/visemas/sincronizador';
import { MotorVisemas } from '../src/visemas/motor';
import { RelojManual, estimarTiempoAudibleMs } from '../src/visemas/reloj';
import { visemaDominante } from '../src/visemas/interpolacion';

const items: ItemVisema[] = [
  { v: 'sil', t_ms: 0, d_ms: 80 },
  { v: 'PP', t_ms: 80, d_ms: 60 },
  { v: 'aa', t_ms: 140, d_ms: 120 },
  { v: 'E', t_ms: 260, d_ms: 90 },
];
const ev = (turno: number, seq = turno, its: ItemVisema[] = items): EventoAvatarVisemas => ({
  v: 1,
  tipo: 'avatar.visemas',
  seq,
  ts: '2026-10-08T13:01:00Z',
  datos: { turno, items: its },
});

describe('SincronizadorVisemas: reloj de audio', () => {
  it('sin turno activo → silencio', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    expect(s.pesos(1000).sil).toBe(1);
  });
  it('posiciona los visemas relativos al inicio del audio del turno', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 5000);
    expect(visemaDominante(s.pesos(5000 + 200))).toBe('aa');
    expect(visemaDominante(s.pesos(5000 + 300))).toBe('E');
  });
  it('antes de que empiece el audio → silencio', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 5000);
    expect(s.pesos(4000).sil).toBe(1);
  });
  it('audio antes que visemas: cuando llegan, se alinean con el inicio ya fijado', () => {
    const s = new SincronizadorVisemas();
    s.iniciarTurno(1, 1000);
    expect(s.pesos(1200).sil).toBe(1);
    expect(s.recibirVisemas(ev(1))).toBe('anexado');
    expect(visemaDominante(s.pesos(1200))).toBe('aa');
  });
  it('adelantoMs corre la boca hacia adelante', () => {
    const s = new SincronizadorVisemas({ adelantoMs: 100 });
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 0);
    expect(visemaDominante(s.pesos(200))).toBe('E'); // 200 + 100 = 300 → E
  });
  it('terminado() tras el fin del último ítem + media transición', () => {
    const s = new SincronizadorVisemas({ transicionMs: 60 });
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 0);
    expect(s.terminado(370)).toBe(false);
    expect(s.terminado(380)).toBe(true);
  });
  it('es determinista: misma hora de reloj → mismos pesos, sin importar el orden de consultas', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 0);
    const a = s.pesos(150);
    s.pesos(300);
    s.pesos(10);
    expect(s.pesos(150)).toEqual(a);
  });
});

describe('SincronizadorVisemas: turnos', () => {
  it('un turno nuevo corta al anterior', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    s.recibirVisemas(ev(2, 2, [{ v: 'O', t_ms: 0, d_ms: 500 }]));
    s.iniciarTurno(1, 0);
    s.iniciarTurno(2, 100);
    expect(s.turnoActivo).toBe(2);
    expect(visemaDominante(s.pesos(300))).toBe('O');
  });
  it('ignora visemas de un turno anterior al activo', () => {
    const s = new SincronizadorVisemas();
    s.iniciarTurno(3, 0);
    expect(s.recibirVisemas(ev(2))).toBe('turno_viejo');
  });
  it('ignora iniciarTurno de un turno viejo', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(2));
    s.iniciarTurno(2, 0);
    s.iniciarTurno(1, 50);
    expect(s.turnoActivo).toBe(2);
  });
  it('rechaza eventos inválidos', () => {
    const s = new SincronizadorVisemas();
    expect(s.recibirVisemas({ ...ev(1), datos: { turno: 0, items } })).toBe('invalido');
    expect(s.recibirVisemas({ ...ev(1), datos: { turno: 1, items: [] } })).toBe('invalido');
  });
  it('mismo seq repetido → duplicado', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1, 7));
    expect(s.recibirVisemas(ev(1, 7))).toBe('duplicado');
  });
  it('trozos del mismo turno (TTS en streaming) se anexan sin duplicar', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1, 1, items.slice(0, 2)));
    expect(s.recibirVisemas(ev(1, 2, items.slice(1)))).toBe('anexado');
    expect(s.itemsDe(1).length).toBe(4);
  });
  it('cortar() deja la boca en silencio', () => {
    const s = new SincronizadorVisemas();
    s.recibirVisemas(ev(1));
    s.iniciarTurno(1, 0);
    s.cortar();
    expect(s.pesos(200).sil).toBe(1);
    expect(s.turnoActivo).toBeNull();
  });
  it('memoria acotada: guarda como máximo maxTurnos', () => {
    const s = new SincronizadorVisemas({ maxTurnos: 3 });
    for (let t = 1; t <= 10; t++) s.recibirVisemas(ev(t));
    expect(s.turnosGuardados).toEqual([8, 9, 10]);
  });
});

describe('estimarTiempoAudibleMs', () => {
  it('usa getOutputTimestamp cuando es reciente', () => {
    expect(
      estimarTiempoAudibleMs({ perfAhoraMs: 1010, marca: { contextTime: 2, performanceTime: 1000 }, currentTimeS: 2.05 }),
    ).toBe(2010);
  });
  it('si la marca es vieja o del futuro, cae a currentTime − latencias', () => {
    const base = { currentTimeS: 3, outputLatencyS: 0.04, baseLatencyS: 0.01 };
    expect(estimarTiempoAudibleMs({ ...base, perfAhoraMs: 2000, marca: { contextTime: 1, performanceTime: 1000 } })).toBeCloseTo(2950);
    expect(estimarTiempoAudibleMs({ ...base, perfAhoraMs: 900, marca: { contextTime: 1, performanceTime: 1000 } })).toBeCloseTo(2950);
  });
  it('sin marca (Safari viejo) descuenta outputLatency y baseLatency', () => {
    expect(estimarTiempoAudibleMs({ perfAhoraMs: 0, marca: null, currentTimeS: 1, outputLatencyS: 0.1 })).toBeCloseTo(900);
  });
  it('nunca devuelve negativo', () => {
    expect(estimarTiempoAudibleMs({ perfAhoraMs: 0, currentTimeS: 0.01, outputLatencyS: 0.2 })).toBe(0);
  });
});

describe('MotorVisemas (reloj + sincronía + suavizado)', () => {
  it('sigue al reloj de audio, no al tiempo de frame', () => {
    const reloj = new RelojManual(0);
    const m = new MotorVisemas(reloj, { suavizado: { ataqueMs: 0, relajacionMs: 0 } });
    m.recibirVisemas(ev(1));
    m.iniciarTurno(1, 1000);
    reloj.t = 1200;
    // tFrameMs arbitrario (p. ej. rAF desfasado): el visema depende del reloj de audio.
    expect(m.paso(999_999).dominante).toBe('aa');
    reloj.t = 1300;
    expect(m.paso(5).dominante).toBe('E');
  });
  it('a 20 fps y a 60 fps converge al mismo visema en el centro de un ítem', () => {
    for (const fps of [20, 60]) {
      const reloj = new RelojManual(0);
      const m = new MotorVisemas(reloj);
      m.recibirVisemas(ev(1, 1, [{ v: 'aa', t_ms: 0, d_ms: 400 }]));
      m.iniciarTurno(1, 0);
      let info = m.paso(0);
      for (let t = 0; t <= 200; t += 1000 / fps) {
        reloj.t = t;
        info = m.paso(t);
      }
      expect(info.pesos.aa).toBeGreaterThan(0.95);
    }
  });
  it('informa tTurnoMs y turno', () => {
    const reloj = new RelojManual(500);
    const m = new MotorVisemas(reloj);
    m.recibirVisemas(ev(4));
    m.iniciarTurno(4, 300);
    const i = m.paso(0);
    expect(i.turno).toBe(4);
    expect(i.tTurnoMs).toBe(200);
  });
});
