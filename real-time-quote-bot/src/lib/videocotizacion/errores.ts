/**
 * Errores del catálogo del contrato (proyecto/contracts/catalogo-errores.json,
 * versión 0.1.4-borrador) y su traducción a mensajes claros en español.
 * Los textos se pueden pisar con el catálogo vivo (GET /v1/textos, claves
 * `error.<codigo>`); esta tabla es el respaldo si el catálogo no carga.
 */
import type { CodigoError, ProblemaError } from "./tipos";

export const MENSAJES_ERROR: Record<string, string> = {
  solicitud_invalida: "No pudimos leer el pedido. Revisá los datos e intentá de nuevo.",
  validacion_fallida: "Hay datos que no cumplen el formato esperado.",
  cuerpo_demasiado_grande: "El pedido supera el tamaño máximo permitido.",
  tipo_de_contenido_no_soportado: "El formato enviado no está soportado.",
  credencial_ausente: "Falta la credencial de acceso.",
  credencial_invalida: "La credencial no es válida o fue revocada.",
  credenciales_incorrectas: "El email o la contraseña no son correctos.",
  totp_invalido: "El código de verificación no es correcto o ya se usó.",
  sesion_vencida: "Tu sesión venció. Ingresá de nuevo.",
  reautenticacion_requerida: "Para esta acción tenés que volver a ingresar tu contraseña y código.",
  origen_no_permitido: "Este sitio no está autorizado para usar la clave.",
  desafio_invalido: "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.",
  clave_secreta_desde_navegador: "La clave secreta no se puede usar desde un navegador.",
  alcance_insuficiente: "La credencial no permite esta operación.",
  csrf_invalido: "No pudimos verificar el pedido. Recargá el panel.",
  no_encontrado: "No encontramos lo que buscás.",
  version_retirada: "Esta versión de la API ya no está disponible.",
  estado_invalido: "La operación no corresponde en el estado actual.",
  consentimiento_requerido: "Antes de empezar tenés que aceptar el aviso de privacidad.",
  sesion_cerrada: "La videocotización ya terminó.",
  cotizacion_no_emitida: "El presupuesto todavía no se emitió.",
  contacto_ya_registrado: "Ya dejaste tus datos de contacto para esta consulta.",
  limite_de_tasa: "Hiciste muchos pedidos seguidos. Esperá un momento.",
  cuota_agotada: "Por ahora no hay cupo para videocotizaciones. Escribinos por WhatsApp.",
  simultaneas_agotadas:
    "En este momento hay muchas videocotizaciones en curso. Probá en unos minutos.",
  intentos_excedidos: "Hubo demasiados intentos. Esperá antes de volver a probar.",
  limite_lecturas_contacto: "Llegaste al límite diario de lecturas de contactos.",
  error_interno: "Tuvimos un problema. Intentá de nuevo más tarde.",
  proveedor_no_disponible: "Un servicio que usamos no responde. Intentá de nuevo en unos minutos.",
  servicio_no_disponible: "El servicio no está disponible en este momento.",
};

/** Errores propios del cliente (no vienen del servidor). */
export type CodigoLocal =
  | "red"
  | "tiempo_agotado"
  | "respuesta_invalida"
  | "camara_denegada"
  | "camara_no_disponible"
  | "config_incompleta"
  | "enlace_ausente"
  | "ws_cerrado"
  | "ws_fallido";

export type CodigoVC = CodigoError | CodigoLocal;

export class ErrorVC extends Error {
  readonly codigo: CodigoVC;
  readonly status: number | undefined;
  readonly idTraza: string | undefined;
  readonly reintentarEnS: number | undefined;

  constructor(
    codigo: CodigoVC,
    opciones: { status?: number; idTraza?: string; reintentarEnS?: number; mensaje?: string } = {},
  ) {
    super(opciones.mensaje ?? codigo);
    this.name = "ErrorVC";
    this.codigo = codigo;
    this.status = opciones.status;
    this.idTraza = opciones.idTraza;
    this.reintentarEnS = opciones.reintentarEnS;
  }
}

export function desdeProblema(
  p: Partial<ProblemaError>,
  status: number,
  reintentarHeader?: number,
): ErrorVC {
  const codigo = (p.codigo ?? (status >= 500 ? "error_interno" : "solicitud_invalida")) as CodigoVC;
  const opc: ConstructorParameters<typeof ErrorVC>[1] = { status };
  if (p.id_traza) opc.idTraza = p.id_traza;
  const espera = p.reintentar_en_s ?? reintentarHeader;
  if (espera !== undefined) opc.reintentarEnS = espera;
  if (p.detail) opc.mensaje = p.detail;
  return new ErrorVC(codigo, opc);
}

/** Qué le ofrecemos al cliente después del error. */
export type AccionError = "reintentar" | "reiniciar" | "esperar" | "volver" | "ninguna";

export type ErrorParaUsuario = {
  titulo: string;
  mensaje: string;
  accion: AccionError;
  /** true si tiene sentido mostrar el botón de reintentar. */
  reintentable: boolean;
  codigo: CodigoVC;
  idTraza?: string;
};

const LOCALES: Record<CodigoLocal, { titulo: string; mensaje: string; accion: AccionError }> = {
  red: {
    titulo: "Sin conexión",
    mensaje:
      "No pudimos comunicarnos con el servicio. Revisá tu conexión a internet e intentá de nuevo.",
    accion: "reintentar",
  },
  tiempo_agotado: {
    titulo: "Tardó demasiado",
    mensaje: "El servicio no respondió a tiempo. Intentá de nuevo en un momento.",
    accion: "reintentar",
  },
  respuesta_invalida: {
    titulo: "Respuesta inesperada",
    mensaje: "El servicio respondió algo que no entendimos. Intentá de nuevo más tarde.",
    accion: "reintentar",
  },
  camara_denegada: {
    titulo: "Necesitamos tu cámara",
    mensaje:
      "Para cotizar necesitamos ver el trabajo con tu cámara y escucharte con el micrófono. Sin eso no podemos seguir. Habilitalos desde los permisos del navegador y volvé a empezar.",
    accion: "reiniciar",
  },
  camara_no_disponible: {
    titulo: "No encontramos cámara o micrófono",
    mensaje:
      "Este dispositivo no tiene cámara o micrófono disponible, o el navegador no permite usarlos en esta página. La cámara es obligatoria para cotizar.",
    accion: "ninguna",
  },
  config_incompleta: {
    titulo: "Servicio sin configurar",
    mensaje: "Esta página todavía no está conectada al servicio de cotización.",
    accion: "ninguna",
  },
  enlace_ausente: {
    titulo: "Falta el enlace de tu profesional",
    mensaje:
      "Para cotizar entrá desde el enlace que te pasó tu profesional. Si no lo tenés, pedíselo por WhatsApp.",
    accion: "ninguna",
  },
  ws_cerrado: {
    titulo: "Se cortó la conexión",
    mensaje: "Se cortó la conexión con el asesor y no pudimos recuperarla.",
    accion: "reiniciar",
  },
  ws_fallido: {
    titulo: "No pudimos conectar",
    mensaje: "No logramos conectar con el asesor. Intentá de nuevo en unos minutos.",
    accion: "reiniciar",
  },
};

const ACCION_POR_CODIGO: Partial<Record<string, AccionError>> = {
  desafio_invalido: "reintentar",
  limite_de_tasa: "esperar",
  intentos_excedidos: "esperar",
  simultaneas_agotadas: "esperar",
  cuota_agotada: "ninguna",
  sesion_vencida: "reiniciar",
  credencial_invalida: "reiniciar",
  credencial_ausente: "ninguna",
  origen_no_permitido: "ninguna",
  clave_secreta_desde_navegador: "ninguna",
  no_encontrado: "ninguna",
  sesion_cerrada: "reiniciar",
  estado_invalido: "reiniciar",
  consentimiento_requerido: "reiniciar",
  error_interno: "reintentar",
  proveedor_no_disponible: "reintentar",
  servicio_no_disponible: "reintentar",
  solicitud_invalida: "reintentar",
  validacion_fallida: "reintentar",
};

const TITULOS: Partial<Record<string, string>> = {
  desafio_invalido: "Verificación fallida",
  cuota_agotada: "Cupo agotado",
  simultaneas_agotadas: "Todos los asesores ocupados",
  limite_de_tasa: "Demasiados pedidos",
  intentos_excedidos: "Demasiados intentos",
  sesion_vencida: "Sesión vencida",
  sesion_cerrada: "La videocotización ya terminó",
  origen_no_permitido: "Sitio no autorizado",
  no_encontrado: "Enlace no válido",
  error_interno: "Tuvimos un problema",
  proveedor_no_disponible: "Servicio no disponible",
  servicio_no_disponible: "Servicio no disponible",
  consentimiento_requerido: "Falta tu consentimiento",
};

/** Mensajes específicos del front que mejoran el texto genérico del catálogo. */
const MENSAJE_PROPIO: Partial<Record<string, string>> = {
  no_encontrado:
    "Este enlace no existe o ya no está activo. Pedile a tu profesional que te pase el enlace actualizado.",
  cuota_agotada:
    "Por ahora no hay cupo para videocotizaciones. Escribile directamente a tu profesional por WhatsApp.",
  sesion_vencida: "Tu sesión venció. Empecemos de nuevo.",
  desafio_invalido:
    "No pudimos verificar el navegador. Reintentá y, si sigue pasando, recargá la página.",
};

export function mensajeError(err: unknown, textos?: Record<string, string>): ErrorParaUsuario {
  const e = err instanceof ErrorVC ? err : new ErrorVC("red");
  const local = (LOCALES as Record<string, (typeof LOCALES)[CodigoLocal] | undefined>)[e.codigo];
  let res: ErrorParaUsuario;
  if (local) {
    res = { ...local, reintentable: local.accion === "reintentar", codigo: e.codigo };
  } else {
    const mensaje =
      MENSAJE_PROPIO[e.codigo] ??
      textos?.[`error.${e.codigo}`] ??
      MENSAJES_ERROR[e.codigo] ??
      MENSAJES_ERROR["error_interno"] ??
      "Tuvimos un problema. Intentá de nuevo más tarde.";
    const accion = ACCION_POR_CODIGO[e.codigo] ?? "reintentar";
    res = {
      titulo: TITULOS[e.codigo] ?? "No pudimos continuar",
      mensaje:
        accion === "esperar" && e.reintentarEnS
          ? `${mensaje} Probá de nuevo en ${e.reintentarEnS} s.`
          : mensaje,
      accion,
      reintentable: accion === "reintentar" || accion === "esperar",
      codigo: e.codigo,
    };
  }
  if (e.idTraza) res.idTraza = e.idTraza;
  return res;
}

/** Códigos que, si llegan al pedir token de medios o por el socket, no sirve reintentar solo. */
export const CODIGOS_FATALES = new Set<string>([
  "cuota_agotada",
  "simultaneas_agotadas",
  "sesion_cerrada",
  "sesion_vencida",
  "credencial_invalida",
  "credencial_ausente",
  "origen_no_permitido",
  "consentimiento_requerido",
  "estado_invalido",
  "no_encontrado",
  "desafio_invalido",
]);
