import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MuestreadorFotogramas,
  REGLA_POR_DEFECTO,
  codificarDentroDeLimites,
  dimensionesEscaladas,
  esJpeg,
  type CodificadorJpeg,
} from "./fotogramas";
import { LARGO_ENCABEZADO, leerEncabezado } from "./protocolo";

const jpeg = (n: number) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};

describe("dimensiones y formato", () => {
  it("escala conservando proporción hasta 1024 px de lado", () => {
    expect(dimensionesEscaladas(1920, 1080, 1024)).toEqual({ ancho: 1024, alto: 576 });
    expect(dimensionesEscaladas(1080, 1920, 1024)).toEqual({ ancho: 576, alto: 1024 });
    expect(dimensionesEscaladas(640, 480, 1024)).toEqual({ ancho: 640, alto: 480 });
    expect(dimensionesEscaladas(0, 480, 1024)).toEqual({ ancho: 0, alto: 0 });
  });
  it("reconoce la firma JPEG FF D8 FF", () => {
    expect(esJpeg(jpeg(10))).toBe(true);
    expect(esJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});

describe("codificación dentro de límites (≤1024 px, ≤128 KiB)", () => {
  it("baja la calidad hasta entrar en 128 KiB", async () => {
    const llamadas: number[] = [];
    const cod: CodificadorJpeg = async (_a, _h, q) => {
      llamadas.push(q);
      return jpeg(q > 0.5 ? 300_000 : 100_000);
    };
    const r = await codificarDentroDeLimites(1920, 1080, REGLA_POR_DEFECTO, cod);
    expect(r?.jpeg.byteLength).toBeLessThanOrEqual(131072);
    expect(Math.max(r!.ancho, r!.alto)).toBeLessThanOrEqual(1024);
    expect(llamadas[0]).toBe(0.8);
  });
  it("si la calidad sola no alcanza, reduce la resolución", async () => {
    const cod: CodificadorJpeg = async (a) => jpeg(a > 700 ? 200_000 : 50_000);
    const r = await codificarDentroDeLimites(1920, 1080, REGLA_POR_DEFECTO, cod);
    expect(r!.ancho).toBeLessThanOrEqual(700);
  });
  it("si nunca entra, devuelve null (jamás se manda un cuadro fuera de límite)", async () => {
    expect(await codificarDentroDeLimites(1920, 1080, REGLA_POR_DEFECTO, async () => jpeg(500_000))).toBeNull();
  });
  it("descarta lo que no es JPEG real", async () => {
    expect(await codificarDentroDeLimites(640, 480, REGLA_POR_DEFECTO, async () => new Uint8Array(1000))).toBeNull();
  });
  it("respeta una regla del servidor más chica que la del producto", async () => {
    const regla = { ...REGLA_POR_DEFECTO, lado_max_px: 512, bytes_max: 20_000 };
    const cod: CodificadorJpeg = async (a) => jpeg(a * 40);
    const r = await codificarDentroDeLimites(1920, 1080, regla, cod);
    expect(r!.ancho).toBeLessThanOrEqual(512);
    expect(r!.jpeg.byteLength).toBeLessThanOrEqual(20_000);
  });
});

describe("muestreador: uno cada 3 s, nunca guarda", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function armar(over: Partial<ConstructorParameters<typeof MuestreadorFotogramas>[1]> = {}, regla = REGLA_POR_DEFECTO) {
    const enviadas: Uint8Array[] = [];
    let ahora = 0;
    const m = new MuestreadorFotogramas(regla, {
      leerFuente: () => ({ ancho: 1280, alto: 720, listo: true }),
      codificar: async () => jpeg(40_000),
      enviar: (t) => (enviadas.push(t), true),
      ahoraMs: () => ahora,
      ...over,
    });
    return { m, enviadas, avanzar: (ms: number) => (ahora += ms), ahora: () => ahora };
  }

  it("manda tramas 0x10 con el encabezado correcto y seq creciente", async () => {
    const { m, enviadas, avanzar } = armar();
    expect(await m.tick()).toBe("enviado");
    avanzar(3000);
    expect(await m.tick()).toBe("enviado");
    const h0 = leerEncabezado(enviadas[0]!)!;
    const h1 = leerEncabezado(enviadas[1]!)!;
    expect([h0.tipo, h0.seq, h1.seq, h1.ts_ms]).toEqual([0x10, 0, 1, 3000]);
    expect(h0.longitud).toBe(enviadas[0]!.byteLength - LARGO_ENCABEZADO);
    expect(enviadas[0]!.byteLength - LARGO_ENCABEZADO).toBeLessThanOrEqual(131072);
  });

  it("no manda dos cuadros a menos de 3 s", async () => {
    const { m, enviadas, avanzar } = armar();
    await m.tick();
    avanzar(2900);
    expect(await m.tick()).toBe("omitido");
    expect(enviadas).toHaveLength(1);
  });

  it("aunque el servidor pida menos de 3 s, el cliente mantiene 3 s", async () => {
    const { m } = armar({}, { ...REGLA_POR_DEFECTO, intervalo_min_ms: 500 });
    expect(m.regla.intervalo_min_ms).toBe(3000);
  });

  it("respeta el tope de la sesión", async () => {
    const { m, avanzar } = armar({}, { ...REGLA_POR_DEFECTO, max_por_sesion: 2 });
    for (let i = 0; i < 4; i++) {
      await m.tick();
      avanzar(3000);
    }
    expect(m.enviados).toBe(2);
  });

  it("omite si el video no está listo o el socket no está listo", async () => {
    const a = armar({ leerFuente: () => ({ ancho: 0, alto: 0, listo: false }) });
    expect(await a.m.tick()).toBe("omitido");
    const b = armar({ enviar: () => false });
    expect(await b.m.tick()).toBe("omitido");
    expect(b.m.enviados).toBe(0);
  });

  it("no se pisa con un cuadro en curso", async () => {
    let soltar: (v: Uint8Array) => void = () => undefined;
    const { m } = armar({ codificar: () => new Promise((r) => (soltar = r)) });
    const primero = m.tick();
    expect(await m.tick()).toBe("omitido");
    soltar(jpeg(1000));
    expect(await primero).toBe("enviado");
  });

  it("con el reloj real de timers: arranca y se detiene sin dejar intervalos", async () => {
    const { m, enviadas } = armar({ ahoraMs: () => Date.now() });
    m.iniciar();
    await vi.advanceTimersByTimeAsync(9100);
    m.detener();
    const n = enviadas.length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enviadas).toHaveLength(n);
    expect(m.activo).toBe(false);
  });

  it("no persiste nada en el cliente: sin storage ni referencias a los bytes", async () => {
    const guardado = vi.fn();
    vi.stubGlobal("localStorage", { setItem: guardado });
    vi.stubGlobal("sessionStorage", { setItem: guardado });
    const { m } = armar();
    await m.tick();
    expect(guardado).not.toHaveBeenCalled();
    // el muestreador solo expone contadores, no los cuadros
    expect(Object.values(m).some((v) => v instanceof Uint8Array)).toBe(false);
    vi.unstubAllGlobals();
  });
});
