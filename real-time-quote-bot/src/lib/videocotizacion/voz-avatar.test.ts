import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarPlaceholder2D, ABERTURA_VISEMA } from "./avatar";
import { VozNavegador, duracionEstimadaMs, textoParaEnviar } from "./voz";

describe("textoParaEnviar", () => {
  it("limpia y respeta el tope de 500 caracteres por mensaje", () => {
    expect(textoParaEnviar("  hola   <b>mundo</b> ")).toEqual(["hola b mundo /b"]);
    expect(textoParaEnviar("   ")).toEqual([]);
    const partes = textoParaEnviar("a".repeat(1200));
    expect(partes.every((p) => p.length <= 500)).toBe(true);
    expect(partes.join("")).toHaveLength(1200);
  });
});

describe("VozNavegador sin speechSynthesis (headless, navegadores viejos)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("no se cuelga: termina por tiempo estimado", () => {
    const v = new VozNavegador();
    expect(v.disponible()).toBe(false);
    const onInicio = vi.fn();
    const onFin = vi.fn();
    v.hablar("Hola, soy Juan", { onInicio, onFin });
    expect(onInicio).toHaveBeenCalled();
    expect(onFin).not.toHaveBeenCalled();
    vi.advanceTimersByTime(duracionEstimadaMs("Hola, soy Juan") + 1);
    expect(onFin).toHaveBeenCalledTimes(1);
  });
  it("cancelar() evita el fin diferido", () => {
    const v = new VozNavegador();
    const onFin = vi.fn();
    v.hablar("Hola", { onFin });
    v.cancelar();
    vi.advanceTimersByTime(60_000);
    expect(onFin).not.toHaveBeenCalled();
  });
  it("texto vacío termina enseguida", () => {
    const onFin = vi.fn();
    new VozNavegador().hablar("<>", { onFin });
    expect(onFin).toHaveBeenCalled();
  });
});

describe("AvatarPlaceholder2D (puerto AvatarPuerto)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("emite estado hablando/callado y sigue los visemas del servidor", () => {
    const a = new AvatarPlaceholder2D();
    const estados: string[] = [];
    a.suscribir((e) => estados.push(`${e.hablando}:${e.visema}`));
    a.hablar({ turno: 1, texto: "hola" });
    expect(estados.at(-1)).toBe("true:aa");
    a.aplicarVisemas(1, [
      { v: "O", t_ms: 100, d_ms: 80 },
      { v: "PP", t_ms: 200, d_ms: 80 },
    ]);
    vi.advanceTimersByTime(110);
    expect(estados.at(-1)).toBe("true:O");
    vi.advanceTimersByTime(100);
    expect(estados.at(-1)).toBe("true:PP");
    a.callar();
    expect(estados.at(-1)).toBe("false:sil");
  });
  it("ignora visemas de otro turno o cuando no habla", () => {
    const a = new AvatarPlaceholder2D();
    const fn = vi.fn();
    a.suscribir(fn);
    fn.mockClear();
    a.aplicarVisemas(1, [{ v: "aa", t_ms: 0, d_ms: 10 }]);
    a.hablar({ turno: 2, texto: "x" });
    fn.mockClear();
    a.aplicarVisemas(1, [{ v: "aa", t_ms: 0, d_ms: 10 }]);
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalledWith(expect.objectContaining({ turno: 1 }));
  });
  it("define abertura para los 15 visemas del contrato", () => {
    expect(Object.keys(ABERTURA_VISEMA)).toHaveLength(15);
  });
});
