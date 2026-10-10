// Textos propios de la interfaz del panel (es-AR, voseo). Los mensajes de error, motivos de cierre, oficios y
// zonas NO van acá: salen del catálogo de la API (`GET /v1/textos`), con estos valores solo como respaldo.
import type {
  AccionRegistro,
  DatosExtraidos,
  EstadoSesionApi,
  MotivoCierre,
  Oficio,
  Zona,
  Consumo,
} from '../api/tipos';

export const RESPALDO_OFICIO: Readonly<Record<Oficio, string>> = {
  pintura: 'Pintura',
  jardineria: 'Jardinería',
  reparaciones: 'Reparaciones',
  mantenimiento: 'Mantenimiento',
  limpieza: 'Limpieza',
};

export const RESPALDO_ZONA: Readonly<Record<Zona, string>> = {
  mar_chiquita: 'Mar Chiquita',
  cobo: 'Cobo',
  santa_clara: 'Santa Clara del Mar',
  parque_lago: 'Parque Lago',
  otra: 'fuera de zona',
};

export const RESPALDO_MOTIVO: Readonly<Record<MotivoCierre, string>> = {
  completada: 'Completada',
  cliente_cerro: 'El cliente cortó',
  sin_voz: 'Cortada por silencio',
  sin_camara: 'Sin cámara',
  sin_consentimiento: 'Sin consentimiento',
  duracion_maxima: 'Duración máxima',
  cuota_agotada: 'Cupo agotado',
  desafio_invalido: 'Verificación fallida',
  error_proveedor: 'Falla de un servicio externo',
  error_interno: 'Error interno',
};

export const ESTADO_SESION: Readonly<Record<EstadoSesionApi, string>> = {
  creada: 'Iniciada',
  consentida: 'Con consentimiento',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
};

export const ACCION_REGISTRO: Readonly<Record<AccionRegistro, string>> = {
  ver_detalle: 'Viste el detalle de una cotización',
  ver_contacto: 'Viste el contacto de un cliente',
  exportar_mi_cuenta: 'Exportaste los datos de tu cuenta',
  rotar_enlace: 'Cambiaste tu enlace para compartir',
  crear_clave_widget: 'Creaste una clave del widget',
  revocar_clave_widget: 'Revocaste una clave del widget',
  inicio_sesion: 'Ingresaste al panel',
  cambio_contrasena: 'Cambiaste tu contraseña',
};

export const ALERTA_CONSUMO: Readonly<Record<Consumo['alerta'], string>> = {
  ninguna: '',
  p50: 'Ya usaste la mitad de tus minutos del mes.',
  p80: 'Ya usaste más del 80 % de tus minutos del mes.',
  p100: 'Llegaste al tope de minutos del mes. Las videocotizaciones nuevas pueden quedar sin cupo.',
};

type Enumerados = Pick<
  DatosExtraidos,
  'interior_exterior' | 'altura' | 'estado_superficie' | 'urgencia' | 'plazo'
>;

export const ETIQUETA_DATO: {
  [K in keyof Enumerados]-?: Readonly<Record<NonNullable<Enumerados[K]>, string>>;
} = {
  interior_exterior: { interior: 'Interior', exterior: 'Exterior', ambos: 'Interior y exterior', no_aplica: 'No aplica' },
  altura: {
    planta_baja: 'Planta baja',
    hasta_3m: 'Hasta 3 m',
    entre_3_y_6m: 'Entre 3 y 6 m',
    mas_de_6m: 'Más de 6 m',
    no_aplica: 'No aplica',
  },
  estado_superficie: {
    bueno: 'Bueno',
    regular: 'Regular',
    malo: 'Malo',
    con_humedad: 'Con humedad',
    descascarado: 'Descascarado',
    con_hongos: 'Con hongos',
    no_aplica: 'No aplica',
    sin_definir: 'Sin definir',
  },
  urgencia: { baja: 'Baja', media: 'Media', alta: 'Alta', sin_definir: 'Sin definir' },
  plazo: {
    inmediato: 'Inmediato',
    esta_semana: 'Esta semana',
    este_mes: 'Este mes',
    mas_de_un_mes: 'Más de un mes',
    flexible: 'Flexible',
    sin_definir: 'Sin definir',
  },
};

export const PREFERENCIA_CONTACTO = { whatsapp: 'WhatsApp', llamada: 'Llamada', email: 'Correo' } as const;

export const ESTADO_TARIFAS = {
  referencia_publica_sin_validar: 'Tarifas de referencia: todavía no las validó un profesional.',
  validada: 'Tarifas validadas por un profesional.',
} as const;

/** Mensaje de los errores que no vienen del contrato (los produce el cliente). */
export const MENSAJE_LOCAL = {
  sin_conexion: 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.',
  respuesta_invalida: 'Recibimos una respuesta que no pudimos leer. Intentá de nuevo.',
} as const;
