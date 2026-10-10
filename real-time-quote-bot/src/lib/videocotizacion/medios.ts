/**
 * Conexión WebSocket de medios con reconexión y backoff.
 * Reglas del protocolo (eventos-sesion.md §1, §5):
 *  - cada conexión necesita un token NUEVO (un solo uso, ≤ 60 s) → `obtenerToken`;
 *  - el token va en el primer mensaje (`sesion.autenticar`), nunca en la URL;
 *  - `sesion.lista` confirma; recién ahí se habla/manda fotogramas;
 *  - cierres propios: 4401 token inválido, 4403 Origin, 4408 sin autenticar a tiempo,
 *    4409 sesión cerrada, 4429 ritmo excedido, 1000 normal tras `sesion.cerrada`.
 */
import { CODIGOS_FATALES, ErrorVC } from "./errores";
import { urlSocketPermitida } from "./cliente";
import { PROTOCOLO, Secuenciador, crearEventoCliente, parsearEventoServidor } from "./protocolo";
import type { EventoServidor, TokenMedios } from "./tipos";

export type SocketLike = {
  readyState: number;
  binaryType: string;
  send(datos: string | ArrayBufferLike | ArrayBufferView): void;
  close(codigo?: number, motivo?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

export type EstadoMedios =
  "inactivo" | "conectando" | "lista" | "reconectando" | "cerrada" | "fallida";

export type DetalleEstado = { intento: number; proximoEnMs?: number; error?: ErrorVC };

export type OpcionesMedios = {
  obtenerToken: () => Promise<TokenMedios>;
  onEvento: (e: EventoServidor) => void;
  onEstado: (e: EstadoMedios, d: DetalleEstado) => void;
  crearSocket?: (url: string) => SocketLike;
  baseMs?: number;
  maxMs?: number;
  intentosMax?: number;
  random?: () => number;
  tiempoAutenticarMs?: number;
};

const ABIERTO = 1;

export class SesionMedios {
  private socket: SocketLike | null = null;
  private estado: EstadoMedios = "inactivo";
  private intento = 0;
  private timerReintento: ReturnType<typeof setTimeout> | null = null;
  private timerAuth: ReturnType<typeof setTimeout> | null = null;
  private cerradaPorServidor = false;
  private cerrandoYo = false;
  private haEstadoLista = false;
  private seq = new Secuenciador();
  private ritmoLento = false;

  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly intentosMax: number;
  private readonly random: () => number;
  private readonly tiempoAuth: number;

  constructor(private readonly o: OpcionesMedios) {
    this.baseMs = o.baseMs ?? 1000;
    this.maxMs = o.maxMs ?? 15_000;
    this.intentosMax = o.intentosMax ?? 6;
    this.random = o.random ?? Math.random;
    this.tiempoAuth = o.tiempoAutenticarMs ?? 8000;
  }

  get estadoActual(): EstadoMedios {
    return this.estado;
  }

  get lista(): boolean {
    return this.estado === "lista" && this.socket?.readyState === ABIERTO;
  }

  /** Espera de reconexión (ms) para el intento n (1-based): exponencial con jitter ±25 %. */
  esperaPara(n: number): number {
    const exp = Math.min(this.maxMs, this.baseMs * 2 ** (n - 1));
    const jitter = 1 + (this.random() * 2 - 1) * 0.25;
    return Math.round(Math.min(this.maxMs, exp * jitter) * (this.ritmoLento ? 2 : 1));
  }

  private poner(e: EstadoMedios, d: Partial<DetalleEstado> = {}) {
    this.estado = e;
    this.o.onEstado(e, { intento: this.intento, ...d });
  }

  conectar(): void {
    if (this.estado !== "inactivo") return;
    this.poner("conectando");
    void this.abrir();
  }

  private async abrir(): Promise<void> {
    if (this.cerrandoYo) return;
    let tok: TokenMedios;
    try {
      tok = await this.o.obtenerToken();
    } catch (e) {
      const err = e instanceof ErrorVC ? e : new ErrorVC("red");
      if (this.cerrandoYo) return;
      if (CODIGOS_FATALES.has(err.codigo)) return this.fallar(err);
      return this.reintentar(err);
    }
    if (this.cerrandoYo) return;
    if (tok.protocolo_eventos !== PROTOCOLO || !urlSocketPermitida(tok.ws_url)) {
      return this.fallar(
        new ErrorVC("ws_fallido", { mensaje: "protocolo o URL de socket no permitidos" }),
      );
    }
    let s: SocketLike;
    try {
      s = (this.o.crearSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(tok.ws_url);
    } catch {
      return this.reintentar(new ErrorVC("ws_cerrado"));
    }
    s.binaryType = "arraybuffer";
    this.socket = s;
    this.seq = new Secuenciador();
    this.cerradaPorServidor = false;

    s.onopen = () => {
      if (this.socket !== s) return;
      s.send(
        crearEventoCliente("sesion.autenticar", { token_medios: tok.token }, this.seq.siguiente()),
      );
      this.timerAuth = setTimeout(() => {
        if (this.socket === s && this.estado !== "lista") s.close(4408, "sin sesion.lista");
      }, this.tiempoAuth);
    };
    s.onmessage = (ev) => {
      if (this.socket !== s || typeof ev.data !== "string") return; // tramas binarias de bajada: no se usan todavía
      const e = parsearEventoServidor(ev.data);
      if (!e) return;
      if (e.tipo === "sesion.lista") {
        this.limpiarAuth();
        this.intento = 0;
        this.ritmoLento = false;
        this.haEstadoLista = true;
        this.poner("lista");
      } else if (e.tipo === "sesion.cerrada") {
        this.cerradaPorServidor = true;
      }
      this.o.onEvento(e);
    };
    s.onerror = () => {
      /* el detalle llega en onclose */
    };
    s.onclose = (ev) => {
      if (this.socket !== s) return;
      this.socket = null;
      this.limpiarAuth();
      this.alCerrarSocket(ev.code);
    };
  }

  private alCerrarSocket(codigo: number): void {
    if (this.cerrandoYo || this.cerradaPorServidor || codigo === 4409) {
      this.limpiarTodo();
      return this.poner("cerrada");
    }
    if (codigo === 4403) return this.fallar(new ErrorVC("origen_no_permitido", { status: 403 }));
    if (codigo === 4429) this.ritmoLento = true;
    this.reintentar(new ErrorVC("ws_cerrado", { mensaje: `cierre ${codigo}` }));
  }

  private reintentar(error: ErrorVC): void {
    if (this.cerrandoYo) return;
    this.intento++;
    if (this.intento > this.intentosMax) {
      return this.fallar(new ErrorVC("ws_fallido", { mensaje: error.message }));
    }
    const espera = this.esperaPara(this.intento);
    this.poner("reconectando", { proximoEnMs: espera, error });
    this.timerReintento = setTimeout(() => {
      this.timerReintento = null;
      void this.abrir();
    }, espera);
  }

  private fallar(error: ErrorVC): void {
    this.limpiarTodo();
    try {
      this.socket?.close(1000, "fallo");
    } catch {
      /* ya cerrado */
    }
    this.socket = null;
    this.poner("fallida", { error });
  }

  private limpiarAuth() {
    if (this.timerAuth) clearTimeout(this.timerAuth);
    this.timerAuth = null;
  }

  private limpiarTodo() {
    this.limpiarAuth();
    if (this.timerReintento) clearTimeout(this.timerReintento);
    this.timerReintento = null;
  }

  // ---------- envío ----------

  private enviarJson(
    tipo: Parameters<typeof crearEventoCliente>[0],
    datos: Record<string, unknown>,
  ): boolean {
    if (!this.lista || !this.socket) return false;
    this.socket.send(crearEventoCliente(tipo, datos, this.seq.siguiente()));
    return true;
  }

  enviarTexto(texto: string): boolean {
    return this.enviarJson("texto.enviar", { texto });
  }

  corregirPizarron(versionBase: number, clave: string, valor: string): boolean {
    return this.enviarJson("pizarron.corregir", { version_base: versionBase, clave, valor });
  }

  enviarTrama(trama: Uint8Array): boolean {
    if (!this.lista || !this.socket) return false;
    this.socket.send(trama);
    return true;
  }

  /** Corte del cliente: avisa al servidor y cierra sin reconectar. */
  cerrar(): void {
    if (this.cerrandoYo) return;
    this.cerrandoYo = true;
    this.limpiarTodo();
    const s = this.socket;
    if (s && s.readyState === ABIERTO) {
      try {
        s.send(
          crearEventoCliente("sesion.cerrar", { motivo: "cliente_cerro" }, this.seq.siguiente()),
        );
        s.close(1000, "cliente_cerro");
      } catch {
        /* ignorar */
      }
    }
    this.socket = null;
    if (this.estado !== "cerrada" && this.estado !== "fallida") this.poner("cerrada");
  }

  /** Para el controlador: ¿alguna vez llegó a estar lista? (distingue "no conectó" de "se cayó"). */
  get conectoAlgunaVez(): boolean {
    return this.haEstadoLista;
  }
}
