import { afterEach, describe, expect, it, vi } from "vitest";
import { ReconocedorNavegador, type ReconocedorCb } from "./voz";

class FakeRec {
  static todos: FakeRec[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 1;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  constructor() {
    FakeRec.todos.push(this);
  }
  decir(t: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: t }], { isFinal: true })],
    });
  }
}

function preparar() {
  FakeRec.todos = [];
  vi.stubGlobal("window", { webkitSpeechRecognition: FakeRec });
  const cb = {
    onFinal: vi.fn(),
    onError: vi.fn(),
    onEscuchando: vi.fn(),
    onVoz: vi.fn(),
  } satisfies ReconocedorCb;
  return cb;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ReconocedorNavegador modo pulsar (celular)", () => {
  it("no abre el micrófono hasta el toque y escucha una sola frase", () => {
    const cb = preparar();
    const r = new ReconocedorNavegador("es-AR", "pulsar");
    r.iniciar(cb);
    expect(FakeRec.todos).toHaveLength(0);

    r.escucharAhora();
    const rec = FakeRec.todos[0]!;
    expect(rec.continuous).toBe(false);
    expect(rec.start).toHaveBeenCalled();
    expect(cb.onEscuchando).toHaveBeenLastCalledWith(true);

    rec.onspeechstart?.();
    expect(cb.onVoz).toHaveBeenLastCalledWith(true);
    rec.decir("quiero pintar el living");
    expect(cb.onFinal).toHaveBeenCalledWith("quiero pintar el living");
    rec.onend?.();
    expect(cb.onEscuchando).toHaveBeenLastCalledWith(false);
    expect(FakeRec.todos).toHaveLength(1); // no se rearma solo
  });

  it("informa network en el celular (en la PC se reintenta en silencio)", () => {
    const cb = preparar();
    const r = new ReconocedorNavegador("es-AR", "pulsar");
    r.iniciar(cb);
    r.escucharAhora();
    FakeRec.todos[0]!.onerror?.({ error: "network" });
    expect(cb.onError).toHaveBeenCalledWith("network");
  });

  it("si se corta al instante sin oír nada, avisa corte-inmediato", () => {
    const cb = preparar();
    const r = new ReconocedorNavegador("es-AR", "pulsar");
    r.iniciar(cb);
    r.escucharAhora();
    FakeRec.todos[0]!.onend?.();
    expect(cb.onError).toHaveBeenCalledWith("corte-inmediato");
  });

  it("modo continuo arranca solo al iniciar (PC)", () => {
    const cb = preparar();
    const r = new ReconocedorNavegador("es-AR");
    r.iniciar(cb);
    expect(FakeRec.todos).toHaveLength(1);
    expect(FakeRec.todos[0]!.continuous).toBe(true);
  });
});
