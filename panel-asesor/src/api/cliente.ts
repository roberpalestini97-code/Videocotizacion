import { ErrorApi, codigoPorStatus, leerProblema } from './errores';
import type {
  CambioContrasenaSolicitud,
  CatalogoTextos,
  ClaveWidgetCreada,
  ClaveWidgetSolicitud,
  CodigoError,
  ContactoCliente,
  Consumo,
  EnlaceCompartir,
  ExportacionMiCuenta,
  FiltrosCotizaciones,
  ListadoClavesWidget,
  ListadoCotizaciones,
  ListadoRegistros,
  LoginPaso,
  LoginSolicitud,
  PerfilActualizacion,
  PerfilAsesor,
  ReautenticacionOtorgada,
  ReautenticacionSolicitud,
  SesionDetalle,
  SesionPanel,
  TotpSolicitud,
} from './tipos';

export interface OpcionesCliente {
  /** Prefijo de la API; vacío = mismo origen (la cookie __Host-vc_panel no viaja a otro origen). */
  baseUrl?: string;
  /** Inyectable para pruebas y para el mock de desarrollo. */
  fetchImpl?: typeof fetch;
  /** El CSRF vive solo en memoria (R03): lo pide el cliente en cada mutación. */
  obtenerCsrf: () => string | null;
  /**
   * Se llama ante un 401 `sesion_vencida` o `credencial_ausente`. NO se llama para `reautenticacion_requerida`
   * (eso no es sesión vencida: la sesión sigue viva y hay que confirmar identidad) ni para
   * `credenciales_incorrectas` / `totp_invalido` (errores de formulario).
   */
  alSesionVencida: (codigo: CodigoError) => void;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Consulta = Record<string, string | number | undefined>;

interface Pedido {
  metodo: Metodo;
  ruta: string;
  consulta?: Consulta;
  cuerpo?: unknown;
  signal?: AbortSignal | undefined;
}

const CODIGOS_DE_SESION: ReadonlySet<CodigoError> = new Set<CodigoError>(['sesion_vencida', 'credencial_ausente']);

export interface Pagina {
  cursor?: string | undefined;
  limite?: number | undefined;
  signal?: AbortSignal | undefined;
}

export function crearCliente(opciones: OpcionesCliente) {
  const base = opciones.baseUrl ?? '';
  const hacerFetch: typeof fetch = opciones.fetchImpl ?? ((...args) => fetch(...args));

  async function enviar(pedido: Pedido): Promise<Response> {
    const url = new URL(`${base}${pedido.ruta}`, globalThis.location.origin);
    for (const [clave, valor] of Object.entries(pedido.consulta ?? {})) {
      if (valor !== undefined && valor !== '') url.searchParams.set(clave, String(valor));
    }
    const cabeceras: Record<string, string> = { Accept: 'application/json, application/problem+json' };
    if (pedido.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (pedido.metodo !== 'GET') {
      const csrf = opciones.obtenerCsrf();
      if (csrf !== null) cabeceras['X-CSRF-Token'] = csrf;
    }
    const init: RequestInit = { method: pedido.metodo, headers: cabeceras, credentials: 'same-origin', cache: 'no-store' };
    if (pedido.cuerpo !== undefined) init.body = JSON.stringify(pedido.cuerpo);
    if (pedido.signal) init.signal = pedido.signal;
    try {
      return await hacerFetch(url.pathname + url.search, init);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ErrorApi('sin_conexion', 0);
    }
  }

  async function aError(respuesta: Response): Promise<ErrorApi> {
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    const problema = leerProblema(cuerpo);
    const retryAfter = Number.parseInt(respuesta.headers.get('Retry-After') ?? '', 10);
    return new ErrorApi(problema?.codigo ?? codigoPorStatus(respuesta.status), respuesta.status, {
      idTraza: problema?.id_traza,
      campos: problema?.errores,
      reintentarEnS: problema?.reintentar_en_s ?? (Number.isFinite(retryAfter) ? retryAfter : undefined),
    });
  }

  async function pedir(pedido: Pedido): Promise<Response> {
    const respuesta = await enviar(pedido);
    if (respuesta.ok) return respuesta;
    const error = await aError(respuesta);
    if (respuesta.status === 401 && CODIGOS_DE_SESION.has(error.codigo as CodigoError)) {
      opciones.alSesionVencida(error.codigo as CodigoError);
    }
    throw error;
  }

  async function json<T>(pedido: Pedido): Promise<T> {
    const respuesta = await pedir(pedido);
    try {
      return (await respuesta.json()) as T;
    } catch {
      throw new ErrorApi('respuesta_invalida', respuesta.status);
    }
  }

  async function sinContenido(pedido: Pedido): Promise<void> {
    await pedir(pedido);
  }

  const enc = encodeURIComponent;

  return {
    // --- Meta ---
    leerCatalogoTextos: (signal?: AbortSignal) =>
      json<CatalogoTextos>({ metodo: 'GET', ruta: '/v1/textos', signal }),

    // --- Sesión del panel ---
    iniciarSesion: (cuerpo: LoginSolicitud) => json<LoginPaso>({ metodo: 'POST', ruta: '/v1/panel/sesion', cuerpo }),
    leerSesion: (signal?: AbortSignal) => json<SesionPanel>({ metodo: 'GET', ruta: '/v1/panel/sesion', signal }),
    cerrarSesion: () => sinContenido({ metodo: 'DELETE', ruta: '/v1/panel/sesion' }),
    verificarTotp: (cuerpo: TotpSolicitud) =>
      json<SesionPanel>({ metodo: 'POST', ruta: '/v1/panel/sesion/totp', cuerpo }),
    reautenticar: (cuerpo: ReautenticacionSolicitud) =>
      json<ReautenticacionOtorgada>({ metodo: 'POST', ruta: '/v1/panel/reautenticacion', cuerpo }),

    // --- Perfil y cuenta ---
    leerPerfil: (signal?: AbortSignal) => json<PerfilAsesor>({ metodo: 'GET', ruta: '/v1/panel/perfil', signal }),
    actualizarPerfil: (cuerpo: PerfilActualizacion) =>
      json<PerfilAsesor>({ metodo: 'PATCH', ruta: '/v1/panel/perfil', cuerpo }),
    cambiarContrasena: (cuerpo: CambioContrasenaSolicitud) =>
      sinContenido({ metodo: 'POST', ruta: '/v1/panel/contrasena', cuerpo }),
    leerConsumo: (periodo?: string, signal?: AbortSignal) =>
      json<Consumo>({ metodo: 'GET', ruta: '/v1/panel/consumo', consulta: { periodo }, signal }),
    exportarMiCuenta: () =>
      json<ExportacionMiCuenta>({ metodo: 'POST', ruta: '/v1/panel/mi-cuenta/exportacion' }),

    // --- Enlace y claves del widget ---
    leerEnlace: (signal?: AbortSignal) => json<EnlaceCompartir>({ metodo: 'GET', ruta: '/v1/panel/enlace', signal }),
    rotarEnlace: () => json<EnlaceCompartir>({ metodo: 'POST', ruta: '/v1/panel/enlace/rotacion' }),
    listarClavesWidget: (signal?: AbortSignal) =>
      json<ListadoClavesWidget>({ metodo: 'GET', ruta: '/v1/panel/claves-widget', signal }),
    crearClaveWidget: (cuerpo: ClaveWidgetSolicitud) =>
      json<ClaveWidgetCreada>({ metodo: 'POST', ruta: '/v1/panel/claves-widget', cuerpo }),
    revocarClaveWidget: (claveId: string) =>
      sinContenido({ metodo: 'DELETE', ruta: `/v1/panel/claves-widget/${enc(claveId)}` }),

    // --- Mis cotizaciones ---
    listarCotizaciones: (filtros: FiltrosCotizaciones, pagina: Pagina = {}) =>
      json<ListadoCotizaciones>({
        metodo: 'GET',
        ruta: '/v1/panel/cotizaciones',
        consulta: { ...filtros, cursor: pagina.cursor, limite: pagina.limite },
        signal: pagina.signal,
      }),
    leerCotizacion: (sesionId: string, signal?: AbortSignal) =>
      json<SesionDetalle>({ metodo: 'GET', ruta: `/v1/panel/cotizaciones/${enc(sesionId)}`, signal }),
    leerContactoCliente: (sesionId: string, signal?: AbortSignal) =>
      json<ContactoCliente>({ metodo: 'GET', ruta: `/v1/panel/cotizaciones/${enc(sesionId)}/contacto`, signal }),

    // --- Registros ---
    listarRegistros: (pagina: Pagina = {}) =>
      json<ListadoRegistros>({
        metodo: 'GET',
        ruta: '/v1/panel/registros',
        consulta: { cursor: pagina.cursor, limite: pagina.limite },
        signal: pagina.signal,
      }),
  };
}

export type ClientePanel = ReturnType<typeof crearCliente>;
