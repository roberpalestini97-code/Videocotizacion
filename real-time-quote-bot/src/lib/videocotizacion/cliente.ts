/**
 * Cliente HTTP tipado del widget/sesión según proyecto/contracts/openapi.yaml.
 * Credenciales: clave pública en `X-VC-Clave-Publica` (el navegador agrega el
 * `Origin` solo y el servidor lo compara con la lista del tenant) y token de
 * sesión `vc_ses_…` como `Authorization: Bearer`.
 */
import { ErrorVC, desdeProblema } from "./errores";
import { resolverDesafio } from "./desafio";
import type {
  AvisoPrivacidad,
  CatalogoTextos,
  CierreSesion,
  CierreSolicitud,
  ConsentimientoRegistrado,
  ConsentimientoSolicitud,
  Cotizacion,
  CrearSesionSolicitud,
  DerivacionWhatsApp,
  DesafioEmitido,
  EnlacePublico,
  SesionCreada,
  TokenMedios,
} from "./tipos";

export type OpcionesCliente = {
  apiBase: string;
  clavePublica: string;
  fetch?: typeof fetch;
  /** Tiempo máximo por pedido. */
  tiempoMaxMs?: number;
  resolver?: typeof resolverDesafio;
  uuid?: () => string;
};

type Pedido = {
  metodo: "GET" | "POST";
  ruta: string;
  cuerpo?: unknown;
  token?: string;
  encabezados?: Record<string, string>;
};

const ID_PUBLICO = /^[A-Za-z0-9_-]{22}$/;
const ID_SESION = /^ses_[0-9A-HJKMNP-TV-Z]{26}$/;

export class ClienteVC {
  private readonly apiBase: string;
  private readonly clavePublica: string;
  private readonly f: typeof fetch;
  private readonly tiempoMaxMs: number;
  private readonly resolver: typeof resolverDesafio;
  private readonly uuid: () => string;

  constructor(o: OpcionesCliente) {
    this.apiBase = o.apiBase.replace(/\/+$/, "");
    this.clavePublica = o.clavePublica;
    this.f = o.fetch ?? ((...a) => fetch(...a));
    this.tiempoMaxMs = o.tiempoMaxMs ?? 15_000;
    this.resolver = o.resolver ?? resolverDesafio;
    this.uuid = o.uuid ?? (() => crypto.randomUUID());
  }

  private async pedir<T>(p: Pedido): Promise<T> {
    const encabezados: Record<string, string> = {
      Accept: "application/json, application/problem+json",
    };
    if (p.cuerpo !== undefined) encabezados["Content-Type"] = "application/json";
    if (p.token) encabezados["Authorization"] = `Bearer ${p.token}`;
    else encabezados["X-VC-Clave-Publica"] = this.clavePublica;
    Object.assign(encabezados, p.encabezados);

    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), this.tiempoMaxMs);
    let resp: Response;
    try {
      const init: RequestInit = {
        method: p.metodo,
        headers: encabezados,
        signal: ctl.signal,
        credentials: "omit",
        cache: "no-store",
      };
      if (p.cuerpo !== undefined) init.body = JSON.stringify(p.cuerpo);
      resp = await this.f(this.apiBase + p.ruta, init);
    } catch (e) {
      if (ctl.signal.aborted) throw new ErrorVC("tiempo_agotado");
      throw new ErrorVC("red", { mensaje: e instanceof Error ? e.message : "red" });
    } finally {
      clearTimeout(reloj);
    }

    let json: unknown;
    const texto = await resp.text().catch(() => "");
    if (texto) {
      try {
        json = JSON.parse(texto);
      } catch {
        json = undefined;
      }
    }
    if (!resp.ok) {
      const espera = Number(resp.headers.get("Retry-After"));
      const problema = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
      throw desdeProblema(
        problema,
        resp.status,
        Number.isFinite(espera) && espera > 0 ? espera : undefined,
      );
    }
    if (json === undefined || json === null || typeof json !== "object") {
      throw new ErrorVC("respuesta_invalida", { status: resp.status });
    }
    return json as T;
  }

  leerEnlace(idPublico: string): Promise<EnlacePublico> {
    if (!ID_PUBLICO.test(idPublico))
      return Promise.reject(new ErrorVC("no_encontrado", { status: 404 }));
    return this.pedir<EnlacePublico>({ metodo: "GET", ruta: `/v1/widget/enlaces/${idPublico}` });
  }

  emitirDesafio(): Promise<DesafioEmitido> {
    return this.pedir<DesafioEmitido>({ metodo: "POST", ruta: "/v1/widget/desafios" });
  }

  leerAviso(): Promise<AvisoPrivacidad> {
    return this.pedir<AvisoPrivacidad>({ metodo: "GET", ruta: "/v1/widget/avisos/privacidad" });
  }

  leerTextos(): Promise<CatalogoTextos> {
    return this.pedir<CatalogoTextos>({ metodo: "GET", ruta: "/v1/textos" });
  }

  /** Emite el desafío, lo resuelve y crea la sesión (pasos 2 del flujo). */
  async crearSesion(solicitud: CrearSesionSolicitud): Promise<SesionCreada> {
    const d = await this.emitirDesafio();
    if (d.mecanismo !== "prueba_de_trabajo_sha256") throw new ErrorVC("desafio_invalido");
    const xDesafio = await this.resolver(d.desafio, d.dificultad_bits);
    return this.pedir<SesionCreada>({
      metodo: "POST",
      ruta: "/v1/sesiones",
      cuerpo: solicitud,
      encabezados: { "X-Desafio": xDesafio, "Idempotency-Key": this.uuid() },
    });
  }

  private rutaSesion(sesionId: string, sufijo: string): string {
    if (!ID_SESION.test(sesionId)) throw new ErrorVC("no_encontrado", { status: 404 });
    return `/v1/sesiones/${sesionId}${sufijo}`;
  }

  registrarConsentimiento(
    sesionId: string,
    token: string,
    c: ConsentimientoSolicitud,
  ): Promise<ConsentimientoRegistrado> {
    return this.pedir({
      metodo: "POST",
      ruta: this.rutaSesion(sesionId, "/consentimiento"),
      cuerpo: c,
      token,
    });
  }

  emitirTokenMedios(sesionId: string, token: string): Promise<TokenMedios> {
    return this.pedir({ metodo: "POST", ruta: this.rutaSesion(sesionId, "/token-medios"), token });
  }

  cerrarSesion(sesionId: string, token: string, c: CierreSolicitud): Promise<CierreSesion> {
    return this.pedir({
      metodo: "POST",
      ruta: this.rutaSesion(sesionId, "/cierre"),
      cuerpo: c,
      token,
    });
  }

  leerCotizacion(sesionId: string, token: string): Promise<Cotizacion> {
    return this.pedir({ metodo: "GET", ruta: this.rutaSesion(sesionId, "/cotizacion"), token });
  }

  leerDerivacion(sesionId: string, token: string): Promise<DerivacionWhatsApp> {
    return this.pedir({ metodo: "GET", ruta: this.rutaSesion(sesionId, "/derivacion"), token });
  }
}

/** La URL del socket tiene que ser wss://, salvo localhost (dev/mock). */
export function urlSocketPermitida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "wss:") return true;
    return u.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Solo se abre un wa.me del contrato (nunca una URL arbitraria que venga de la red). */
export function urlWhatsAppPermitida(url: string): boolean {
  return /^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=[A-Za-z0-9%._~-]+$/.test(url);
}
