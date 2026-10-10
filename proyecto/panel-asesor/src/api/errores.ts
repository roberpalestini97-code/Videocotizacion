import { MENSAJES_ERROR } from './generado/errores';
import type { CodigoError, ErrorCampoApi, ProblemaApi } from './tipos';

/** Códigos que no vienen del contrato: los produce el propio cliente. */
export type CodigoLocal = 'sin_conexion' | 'respuesta_invalida';
export type CodigoAny = CodigoError | CodigoLocal;

const CODIGOS_CONTRATO = new Set<string>(Object.keys(MENSAJES_ERROR));

export function esCodigoDelContrato(valor: unknown): valor is CodigoError {
  return typeof valor === 'string' && CODIGOS_CONTRATO.has(valor);
}

/** Error de la API ya normalizado. Nunca lleva el cuerpo crudo ni trazas: solo el código y datos para soporte. */
export class ErrorApi extends Error {
  readonly codigo: CodigoAny;
  readonly status: number;
  readonly idTraza: string | undefined;
  readonly campos: readonly ErrorCampoApi[];
  readonly reintentarEnS: number | undefined;

  constructor(
    codigo: CodigoAny,
    status: number,
    extra: { idTraza?: string | undefined; campos?: readonly ErrorCampoApi[] | undefined; reintentarEnS?: number | undefined } = {},
  ) {
    super(codigo);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.status = status;
    this.idTraza = extra.idTraza;
    this.campos = extra.campos ?? [];
    this.reintentarEnS = extra.reintentarEnS;
  }
}

export function esErrorApi(e: unknown, codigo?: CodigoAny): e is ErrorApi {
  return e instanceof ErrorApi && (codigo === undefined || e.codigo === codigo);
}

export function esAbortado(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Convierte cualquier cosa lanzada en un ErrorApi (lo desconocido es `error_interno`, sin detalles). */
export function comoErrorApi(e: unknown): ErrorApi {
  return e instanceof ErrorApi ? e : new ErrorApi('error_interno', 500);
}

/** Interpreta un cuerpo application/problem+json; devuelve null si no tiene la forma del contrato. */
export function leerProblema(cuerpo: unknown): ProblemaApi | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  if (!esCodigoDelContrato(c.codigo) || typeof c.status !== 'number') return null;
  return cuerpo as ProblemaApi;
}

const STATUS_A_CODIGO: Readonly<Record<number, CodigoError>> = {
  400: 'solicitud_invalida',
  401: 'credencial_invalida',
  403: 'alcance_insuficiente',
  404: 'no_encontrado',
  413: 'cuerpo_demasiado_grande',
  415: 'tipo_de_contenido_no_soportado',
  422: 'validacion_fallida',
  429: 'limite_de_tasa',
  503: 'servicio_no_disponible',
};

/** Código de respaldo cuando el servidor (o un proxy) responde sin el formato del contrato. */
export function codigoPorStatus(status: number): CodigoError {
  return STATUS_A_CODIGO[status] ?? 'error_interno';
}
