import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VISEMAS } from '../src/contrato/eventos';
import { pesosSilencio, pesosVacios } from '../src/visemas/interpolacion';
import { Suavizador, factorSuavizado } from '../src/visemas/suavizado';
import { FORMAS } from '../src/modelo/formas';
import { aplicarPesos, articulacionMezclada, detectarEsquema, pesosArkit } from '../src/modelo/blendshapes';
import { BOCA, agregarMorphsVisemas, crearModeloProcedural, deformarBoca, parpadeo } from '../src/modelo/procedural';
import { modeloDesdeEscena } from '../src/modelo/glb';
import { relacionPixeles } from '../src/Avatar3D';

const solo = (v: (typeof VISEMAS)[number], w = 1) => {
  const p = pesosVacios();
  p[v] = w;
  if (w < 1) p.sil = 1 - w;
  return p;
};

describe('Suavizador', () => {
  it('factor independiente del frame rate: 3 pasos de 10 ms = 1 paso de 30 ms', () => {
    const a = 1 - (1 - factorSuavizado(10, 25)) ** 3;
    expect(a).toBeCloseTo(factorSuavizado(30, 25), 12);
  });
  it('tau 0 = sin suavizado; dt 0 = no se mueve', () => {
    expect(factorSuavizado(16, 0)).toBe(1);
    expect(factorSuavizado(0, 25)).toBe(0);
  });
  it('se acerca al objetivo sin pasarse', () => {
    const s = new Suavizador({ ataqueMs: 25 });
    let p = s.pesos;
    for (let i = 0; i < 10; i++) {
      p = s.paso(solo('aa'), 16);
      expect(p.aa).toBeLessThanOrEqual(1);
    }
    expect(p.aa).toBeGreaterThan(0.99);
  });
  it('dt enorme (pestaña en segundo plano) se recorta a dtMaxMs', () => {
    const s = new Suavizador({ ataqueMs: 1000, dtMaxMs: 100 });
    expect(s.paso(solo('aa'), 60_000).aa).toBeCloseTo(factorSuavizado(100, 1000));
  });
  it('reiniciar vuelve a silencio', () => {
    const s = new Suavizador();
    s.paso(solo('O'), 50);
    s.reiniciar();
    expect(s.pesos).toEqual(pesosSilencio());
  });
});

describe('Formas y mezcla articulatoria', () => {
  it('hay forma para los 15 visemas y sil es neutra', () => {
    expect(Object.keys(FORMAS).sort()).toEqual([...VISEMAS].sort());
    expect(Object.values(FORMAS.sil).every((x) => x === 0)).toBe(true);
  });
  it('aa abre más la mandíbula que cualquier otro visema', () => {
    for (const v of VISEMAS) if (v !== 'aa') expect(FORMAS.aa.mandibula).toBeGreaterThan(FORMAS[v].mandibula);
  });
  it('mezcla lineal: 50% aa da la mitad de apertura', () => {
    expect(articulacionMezclada(solo('aa', 0.5)).mandibula).toBeCloseTo(0.5);
  });
  it('ARKit: PP aprieta labios, U frunce, aa abre la mandíbula', () => {
    expect(pesosArkit(solo('PP')).mouthPressLeft).toBeGreaterThan(0.5);
    expect(pesosArkit(solo('U')).mouthPucker).toBeGreaterThan(0.7);
    expect(pesosArkit(solo('aa')).jawOpen).toBeGreaterThan(0.6);
    expect(Object.values(pesosArkit(solo('sil'))).every((x) => x === 0)).toBe(true);
  });
});

describe('aplicarPesos y detectarEsquema', () => {
  const mallaVisemas = () => ({
    morphTargetDictionary: Object.fromEntries(VISEMAS.map((v, i) => [`viseme_${v}`, i])),
    morphTargetInfluences: new Array(15).fill(0),
  });
  it('detecta convención visemas y ARKit', () => {
    expect(detectarEsquema(mallaVisemas())).toBe('visemas');
    expect(detectarEsquema({ morphTargetDictionary: { jawOpen: 0 }, morphTargetInfluences: [0] })).toBe('arkit');
    expect(detectarEsquema({ morphTargetDictionary: { otra: 0 } })).toBeNull();
    expect(detectarEsquema({})).toBeNull();
  });
  it('escribe los 15 pesos en los índices correctos', () => {
    const m = mallaVisemas();
    const r = aplicarPesos(m, solo('O', 0.7));
    expect(r.aplicados).toBe(15);
    expect(m.morphTargetInfluences[VISEMAS.indexOf('O')]).toBeCloseTo(0.7);
    expect(m.morphTargetInfluences[0]).toBeCloseTo(0.3);
  });
  it('recorta a [0,1] y reporta faltantes', () => {
    const m = { morphTargetDictionary: { viseme_aa: 0, viseme_sil: 1, viseme_E: 2, viseme_I: 3, viseme_O: 4 }, morphTargetInfluences: [0, 0, 0, 0, 0] };
    const p = pesosVacios();
    p.aa = 1.7;
    const r = aplicarPesos(m, p);
    expect(m.morphTargetInfluences[0]).toBe(1);
    expect(r.faltantes).toContain('viseme_PP');
    expect(r.aplicados).toBe(5);
  });
  it('malla sin morphs → no hace nada', () => {
    expect(aplicarPesos({}, pesosSilencio())).toEqual({ aplicados: 0, faltantes: [] });
  });
  it('esquema ARKit escribe jawOpen', () => {
    const m = { morphTargetDictionary: { jawOpen: 0, mouthPucker: 1 }, morphTargetInfluences: [0, 0] };
    aplicarPesos(m, solo('aa'));
    expect(m.morphTargetInfluences[0]).toBeGreaterThan(0.6);
  });
});

describe('Modelo procedural (sin WebGL)', () => {
  const modelo = crearModeloProcedural();
  it('tiene mallas con los 15 morph targets viseme_* en el orden del contrato', () => {
    expect(modelo.mallasVisemas.length).toBe(4);
    for (const m of modelo.mallasVisemas) {
      expect(Object.keys(m.morphTargetDictionary!)).toEqual(VISEMAS.map((v) => `viseme_${v}`));
      expect(m.geometry.morphTargetsRelative).toBe(true);
    }
  });
  it('el morph de sil es nulo (delta 0)', () => {
    const labios = modelo.mallasVisemas[0]!;
    const sil = labios.geometry.morphAttributes.position![0]!;
    expect(Array.from(sil.array as Float32Array).every((x) => x === 0)).toBe(true);
  });
  it('aa baja el labio inferior ≈ apertura completa; PP achica la altura de la boca', () => {
    const [nx, ny] = deformarBoca(0, -BOCA.ry, 0, FORMAS.aa);
    expect(nx).toBe(0);
    expect(ny).toBeCloseTo(-BOCA.ry - BOCA.apertura, 5);
    const [, yp] = deformarBoca(0, BOCA.ry, 0, FORMAS.PP);
    expect(Math.abs(yp)).toBeLessThan(BOCA.ry * 0.2);
  });
  it('U angosta la boca y la proyecta hacia adelante', () => {
    const [x, , z] = deformarBoca(BOCA.rx * 0.5, 0, 0, FORMAS.U);
    expect(x).toBeLessThan(BOCA.rx * 0.5);
    expect(z).toBeGreaterThan(0);
  });
  it('desplazamientos acotados (sin vértices que "vuelen")', () => {
    for (const m of modelo.mallasVisemas) {
      for (const attr of m.geometry.morphAttributes.position!) {
        for (const x of attr.array as Float32Array) expect(Math.abs(x)).toBeLessThan(0.3);
      }
    }
  });
  it('liviano para gama baja: < 20k triángulos; detalle bajo usa menos', () => {
    const e = modelo.estadisticas();
    expect(e.triangulos).toBeLessThan(20_000);
    expect(e.morphTargets).toBe(60);
    expect(crearModeloProcedural({ detalle: 'baja' }).estadisticas().triangulos).toBeLessThan(e.triangulos);
  });
  it('agregarMorphsVisemas funciona con cualquier geometría', () => {
    const g = agregarMorphsVisemas(new THREE.PlaneGeometry(0.1, 0.1), deformarBoca);
    expect(g.morphAttributes.position!.length).toBe(15);
    expect(g.morphAttributes.position![10]!.name).toBe('viseme_aa');
  });
  it('envuelto como escena (camino GLB) encuentra las mismas mallas', () => {
    const m2 = modeloDesdeEscena(crearModeloProcedural().raiz);
    expect(m2.mallasVisemas.length).toBe(4);
  });
});

describe('parpadeo y relación de píxeles', () => {
  it('parpadeo: 0 casi siempre, 1 en el medio del parpadeo', () => {
    expect(parpadeo(75)).toBeCloseTo(1);
    expect(parpadeo(1000)).toBe(0);
    expect(parpadeo(-5)).toBe(0);
    const cerrados = Array.from({ length: 3700 }, (_, t) => parpadeo(t)).filter((x) => x > 0).length;
    expect(cerrados / 3700).toBeLessThan(0.06);
  });
  it('pixelRatio: tope por calidad', () => {
    expect(relacionPixeles('baja', 3)).toBe(1);
    expect(relacionPixeles('media', 3)).toBe(1.5);
    expect(relacionPixeles('alta', 3)).toBe(2);
    expect(relacionPixeles('alta', 1)).toBe(1);
    expect(relacionPixeles('media', 0)).toBe(1);
  });
});
