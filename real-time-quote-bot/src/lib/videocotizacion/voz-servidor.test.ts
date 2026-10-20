import { describe, expect, it } from "vitest";
import { leerEncabezado, MAX_CARGA } from "./protocolo";
import {
  DetectorVoz,
  HZ_SERVIDOR,
  Remuestreador,
  nivelRMS,
  tramasDeFrase,
  type OpcionesDetector,
} from "./voz-servidor";

/** Bloque de 100 ms de PCM16 16 kHz con amplitud fija (onda cuadrada). */
const bloque = (amp: number) =>
  Int16Array.from({ length: HZ_SERVIDOR / 10 }, (_, i) => (i % 2 ? amp : -amp));

const OPC: OpcionesDetector = {
  umbralMin: 0.01,
  factorRuido: 3,
  silencioFinMs: 300,
  vozMinMs: 200,
  maxMs: 2000,
  previoMs: 200,
  calibracionMs: 0,
};

describe("Remuestreador", () => {
  it("48 kHz → 16 kHz: un tercio de las muestras, con la fase entre bloques", () => {
    const r = new Remuestreador(48000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += r.procesar(new Float32Array(4096).fill(0.5)).length;
    expect(Math.abs(total - (10 * 4096) / 3)).toBeLessThanOrEqual(1);
  });

  it("escala a int16 y recorta fuera de [-1, 1]", () => {
    const out = new Remuestreador(16000).procesar(Float32Array.from([1, -1, 2, -2, 0]));
    expect([...out]).toEqual([32767, -32768, 32767, -32768, 0]);
  });
});

describe("DetectorVoz", () => {
  it("frase: inicio con voz, fin tras el silencio, incluye el audio previo", () => {
    const d = new DetectorVoz(OPC);
    for (let i = 0; i < 5; i++) expect(d.alimentar(bloque(30)).t).toBe("nada"); // ruido bajo
    expect(d.alimentar(bloque(8000)).t).toBe("inicio");
    for (let i = 0; i < 4; i++) d.alimentar(bloque(8000));
    expect(d.alimentar(bloque(30)).t).toBe("nada");
    expect(d.alimentar(bloque(30)).t).toBe("nada");
    const r = d.alimentar(bloque(30));
    expect(r.t).toBe("fin");
    // 200 ms previos + 500 ms de voz + 300 ms de silencio.
    if (r.t === "fin") expect(r.pcm.length).toBe((HZ_SERVIDOR / 10) * 10);
    expect(d.enFrase).toBe(false);
  });

  it("un golpe corto se descarta", () => {
    const d = new DetectorVoz(OPC);
    expect(d.alimentar(bloque(8000)).t).toBe("inicio");
    for (let i = 0; i < 2; i++) d.alimentar(bloque(0));
    expect(d.alimentar(bloque(0)).t).toBe("descarte");
  });

  it("corta en el tope de duración aunque no haya silencio", () => {
    const d = new DetectorVoz(OPC);
    d.alimentar(bloque(8000));
    let r = d.alimentar(bloque(8000));
    for (let i = 0; i < 30 && r.t === "nada"; i++) r = d.alimentar(bloque(8000));
    expect(r.t).toBe("fin");
    if (r.t === "fin") expect(r.pcm.length).toBe((HZ_SERVIDOR / 10) * 20);
  });

  it("calibra con el ruido de fondo: un zumbido parejo desde el arranque no es voz", () => {
    const d = new DetectorVoz({ ...OPC, calibracionMs: 500 });
    for (let i = 0; i < 100; i++) expect(d.alimentar(bloque(600)).t).toBe("nada");
    expect(nivelRMS(bloque(600))).toBeGreaterThan(OPC.umbralMin);
    expect(d.alimentar(bloque(8000)).t).toBe("inicio");
  });
});

describe("tramasDeFrase", () => {
  it("corta en tramas 0x01 de ≤ 128 KiB, seq creciente y fin de turno solo en la última", () => {
    const pcm = new Int16Array(MAX_CARGA); // 256 KiB → 2 tramas
    pcm[0] = 0x0102;
    const tramas = tramasDeFrase(pcm, 7, 1234);
    const h = tramas.map((t) => leerEncabezado(t)!);
    expect(h.map((x) => [x.tipo, x.seq, x.flags, x.longitud, x.ts_ms])).toEqual([
      [0x01, 7, 0, MAX_CARGA, 1234],
      [0x01, 8, 1, MAX_CARGA, 1234],
    ]);
    expect([tramas[0]![20], tramas[0]![21]]).toEqual([0x02, 0x01]); // little-endian
  });

  it("una frase corta va en una sola trama con fin de turno", () => {
    const [t] = tramasDeFrase(new Int16Array(100), 0, 0);
    expect(leerEncabezado(t!)).toMatchObject({ tipo: 0x01, flags: 1, longitud: 200 });
  });
});
