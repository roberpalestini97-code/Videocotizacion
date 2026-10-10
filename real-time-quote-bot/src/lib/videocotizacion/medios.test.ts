import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorVC } from "./errores";
import { SesionMedios, type EstadoMedios, type SocketLike } from "./medios";
import type { EventoServidor, TokenMedios } from "./tipos";

const ID_SESION = "ses_01HZX3K9Q8V7M2N4P5R6S7T8W9";

class SocketFalso implements SocketLike {
  static todos: SocketFalso[] = [];
  readyState = 0;
  binaryType = "blob";
  enviados: unknown[] = [];
  cierres: { codigo?: number | undefined }[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(readonly url: string) {
    SocketFalso.todos.push(this);
  }
  send(d: unknown) {
    this.enviados.push(d);
  }
  close(codigo?: number) {
    this.cierres.push({ codigo });
    this.readyState = 3;
  }
  // ayudas de prueba
  abrir() {
    this.readyState = 1;
    this.onopen?.({});
  }
  recibir(tipo: string, datos: unknown = {}) {
    this.onmessage?.({ data: JSON.stringify({ v: 1, tipo, seq: 0, ts: "2026-10-10T12:00:00Z", datos }) });
  }
  lista() {
    this.recibir("sesion.lista", { sesion_id: ID_SESION, limites: {} });
  }
  caer(codigo = 1006) {
    this.readyState = 3;
    this.onclose?.({ code: codigo });
  }
}

let n = 0;
const token = (): TokenMedios =>
  ({
    token: `vc_med_${String(++n).padStart(43, "0")}`,
    ws_url: `wss://api.test/v1/sesiones/${ID_SESION}/medios`,
    vence_en: "2026-10-10T12:01:00Z",
    vence_en_s: 60,
    un_solo_uso: true,
    protocolo_eventos: "vc-eventos.borrador.1",
  }) as TokenMedios;

function armar(over: Partial<ConstructorParameters<typeof SesionMedios>[0]> = {}) {
  const estados: { e: EstadoMedios; intento: number; proximoEnMs?: number | undefined; error?: ErrorVC | undefined }[] = [];
  const eventos: EventoServidor[] = [];
  const obtenerToken = vi.fn(async () => token());
  const s = new SesionMedios({
    obtenerToken,
    onEvento: (e) => eventos.push(e),
    onEstado: (e, d) => estados.push({ e, ...d }),
    crearSocket: (u) => new SocketFalso(u),
    random: () => 0.5, // jitter 0
    ...over,
  });
  return { s, estados, eventos, obtenerToken, ultimo: () => SocketFalso.todos[SocketFalso.todos.length - 1]! };
}
const nombres = (a: { e: EstadoMedios }[]) => a.map((x) => x.e);

beforeEach(() => {
  vi.useFakeTimers();
  SocketFalso.todos = [];
  n = 0;
});
afterEach(() => vi.useRealTimers());

describe("SesionMedios", () => {
  it("autentica con el token en el PRIMER mensaje (no en la URL) y queda lista con sesion.lista", async () => {
    const { s, estados, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    const ws = ultimo();
    expect(ws.url).not.toContain("vc_med_");
    ws.abrir();
    const primero = JSON.parse(ws.enviados[0] as string);
    expect(primero).toMatchObject({ v: 1, tipo: "sesion.autenticar", seq: 0 });
    expect(primero.datos.token_medios).toMatch(/^vc_med_/);
    expect(s.lista).toBe(false); // todavía no hubo sesion.lista
    ws.lista();
    expect(s.lista).toBe(true);
    expect(nombres(estados)).toEqual(["conectando", "lista"]);
  });

  it("solo envía texto cuando está lista, con seq creciente", async () => {
    const { s, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    const ws = ultimo();
    ws.abrir();
    expect(s.enviarTexto("hola")).toBe(false);
    ws.lista();
    expect(s.enviarTexto("hola")).toBe(true);
    expect(s.corregirPizarron(3, "zona", "Cobo")).toBe(true);
    const a = JSON.parse(ws.enviados[1] as string);
    const b = JSON.parse(ws.enviados[2] as string);
    expect([a.tipo, a.seq, b.tipo, b.seq]).toEqual(["texto.enviar", 1, "pizarron.corregir", 2]);
    expect(b.datos).toEqual({ version_base: 3, clave: "zona", valor: "Cobo" });
  });

  it("reconecta con backoff exponencial y pide un token NUEVO cada vez", async () => {
    const { s, estados, obtenerToken, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().lista();
    ultimo().caer(1006);
    expect(estados.at(-1)).toMatchObject({ e: "reconectando", intento: 1, proximoEnMs: 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(SocketFalso.todos).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(SocketFalso.todos).toHaveLength(2);
    expect(obtenerToken).toHaveBeenCalledTimes(2);
    ultimo().caer(1006); // falla antes de abrir
    expect(estados.at(-1)).toMatchObject({ e: "reconectando", intento: 2, proximoEnMs: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    ultimo().caer(1006);
    expect(estados.at(-1)).toMatchObject({ intento: 3, proximoEnMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    ultimo().abrir();
    ultimo().lista();
    expect(estados.at(-1)).toMatchObject({ e: "lista", intento: 0 }); // se reinicia el contador
    expect(obtenerToken).toHaveBeenCalledTimes(4);
    const tokens = SocketFalso.todos
      .filter((w) => w.enviados.length > 0)
      .map((w) => JSON.parse(w.enviados[0] as string).datos.token_medios as string);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("el backoff tiene tope y jitter acotado a ±25 %", () => {
    const { s } = armar({ random: () => 1 });
    expect(s.esperaPara(1)).toBe(1250);
    expect(s.esperaPara(10)).toBe(15_000);
    const bajo = armar({ random: () => 0 }).s;
    expect(bajo.esperaPara(1)).toBe(750);
  });

  it("después de los intentos máximos queda fallida (ws_fallido)", async () => {
    const { s, estados, ultimo } = armar({ intentosMax: 3 });
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      ultimo().caer(1006);
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(estados.at(-1)?.e).toBe("fallida");
    expect(estados.at(-1)?.error?.codigo).toBe("ws_fallido");
    const antes = SocketFalso.todos.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(SocketFalso.todos.length).toBe(antes); // no sigue intentando
  });

  it("sesion.cerrada del servidor + cierre del socket = cerrada, sin reconectar", async () => {
    const { s, estados, eventos, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().lista();
    ultimo().recibir("sesion.cerrada", { motivo_cierre: "completada", duracion_s: 90 });
    ultimo().caer(1000);
    expect(estados.at(-1)?.e).toBe("cerrada");
    expect(eventos.map((e) => e.tipo)).toContain("sesion.cerrada");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(SocketFalso.todos).toHaveLength(1);
  });

  it.each([
    [4403, "fallida", "origen_no_permitido"],
    [4409, "cerrada", undefined],
  ])("código de cierre %i → %s", async (codigo, esperado, cod) => {
    const { s, estados, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().caer(codigo);
    expect(estados.at(-1)?.e).toBe(esperado);
    if (cod) expect(estados.at(-1)?.error?.codigo).toBe(cod);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(SocketFalso.todos).toHaveLength(1);
  });

  it("4401 (token vencido/reusado) reintenta con un token nuevo", async () => {
    const { s, obtenerToken, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().caer(4401);
    await vi.advanceTimersByTimeAsync(1000);
    expect(obtenerToken).toHaveBeenCalledTimes(2);
  });

  it("4429 (ritmo excedido) espera el doble", async () => {
    const { s, estados, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().caer(4429);
    expect(estados.at(-1)?.proximoEnMs).toBe(2000);
  });

  it("si no llega sesion.lista a tiempo, cierra con 4408 y reintenta", async () => {
    const { s, estados, ultimo } = armar({ tiempoAutenticarMs: 5000 });
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    const ws = ultimo();
    ws.abrir();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ws.cierres[0]?.codigo).toBe(4408);
    ws.caer(4408);
    expect(estados.at(-1)?.e).toBe("reconectando");
  });

  it.each(["cuota_agotada", "simultaneas_agotadas", "sesion_vencida", "sesion_cerrada"] as const)(
    "si el token-medios responde %s no insiste: falla con ese código",
    async (codigo) => {
      const { s, estados } = armar({
        obtenerToken: vi.fn(async () => {
          throw new ErrorVC(codigo, { status: 429 });
        }),
      });
      s.conectar();
      await vi.advanceTimersByTimeAsync(0);
      expect(estados.at(-1)).toMatchObject({ e: "fallida" });
      expect(estados.at(-1)?.error?.codigo).toBe(codigo);
    },
  );

  it("una falla de red al pedir el token se reintenta", async () => {
    let i = 0;
    const { s, estados } = armar({
      obtenerToken: vi.fn(async () => {
        if (i++ === 0) throw new ErrorVC("red");
        return token();
      }),
    });
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)?.e).toBe("reconectando");
    await vi.advanceTimersByTimeAsync(1000);
    expect(SocketFalso.todos).toHaveLength(1);
  });

  it("no abre un socket ws:// remoto ni con otro protocolo", async () => {
    const mal = { ...token(), ws_url: `ws://evil.test/v1/sesiones/${ID_SESION}/medios` } as TokenMedios;
    const a = armar({ obtenerToken: async () => mal });
    a.s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.estados.at(-1)?.e).toBe("fallida");
    expect(SocketFalso.todos).toHaveLength(0);
    const b = armar({ obtenerToken: async () => ({ ...token(), protocolo_eventos: "otro" }) as never });
    b.s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.estados.at(-1)?.e).toBe("fallida");
  });

  it("cerrar(): manda sesion.cerrar, cierra 1000 y no reconecta", async () => {
    const { s, estados, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    const ws = ultimo();
    ws.abrir();
    ws.lista();
    s.cerrar();
    expect(JSON.parse(ws.enviados.at(-1) as string)).toMatchObject({ tipo: "sesion.cerrar", datos: { motivo: "cliente_cerro" } });
    expect(ws.cierres[0]?.codigo).toBe(1000);
    ws.caer(1000);
    expect(estados.at(-1)?.e).toBe("cerrada");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(SocketFalso.todos).toHaveLength(1);
  });

  it("cerrar() durante la espera de reconexión cancela el reintento", async () => {
    const { s, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    ultimo().abrir();
    ultimo().lista();
    ultimo().caer(1006);
    s.cerrar();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(SocketFalso.todos).toHaveLength(1);
  });

  it("ignora mensajes de un socket viejo y eventos mal formados", async () => {
    const { s, eventos, ultimo } = armar();
    s.conectar();
    await vi.advanceTimersByTimeAsync(0);
    const viejo = ultimo();
    viejo.abrir();
    viejo.lista();
    viejo.caer(1006);
    await vi.advanceTimersByTimeAsync(1000);
    const antes = eventos.length;
    viejo.recibir("avatar.respuesta", { turno: 1, texto: "fantasma" });
    expect(eventos.length).toBe(antes);
    ultimo().abrir();
    ultimo().onmessage?.({ data: "no es json" });
    ultimo().onmessage?.({ data: new ArrayBuffer(8) });
    expect(eventos.length).toBe(antes);
  });
});
