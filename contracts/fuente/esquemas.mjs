// Definición de los JSON Schema 2020-12 del contrato (fuente única).
// generar.mjs los escribe en ../schemas/*.schema.json. No editar los .json a mano.
import { BASE, RUTA_SALIDA_LLM } from './base.mjs';

export const esquemas = {};
const META = 'https://json-schema.org/draft/2020-12/schema';

function def(nombre, descripcion, cuerpo, carpeta = '') {
  esquemas[(carpeta ? carpeta + '/' : '') + nombre] = {
    $schema: META,
    $id: `${BASE}${carpeta ? carpeta + '/' : ''}${nombre}.schema.json`,
    title: nombre,
    description: descripcion,
    ...cuerpo,
  };
}
export const r = (n) => ({ $ref: `${n}.schema.json` });
const re = (n) => ({ $ref: `../${n}.schema.json` }); // desde schemas/eventos/
const obj = (properties, required = Object.keys(properties), extra = {}) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
  ...extra,
});
const TEXTO_PLANO = '^[^<>\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]*$';
const str = (max, extra = {}) => ({ type: 'string', minLength: 1, maxLength: max, ...extra });
const txt = (max, extra = {}) => str(max, { pattern: TEXTO_PLANO, ...extra });
const ent = (min, max, extra = {}) => ({ type: 'integer', minimum: min, maximum: max, ...extra });
const arr = (items, min, max, extra = {}) => ({ type: 'array', items, minItems: min, maxItems: max, ...extra });
const cte = (valor, extra = {}) => ({ type: typeof valor === 'boolean' ? 'boolean' : typeof valor === 'number' ? 'integer' : 'string', const: valor, ...extra });
const B32 = '[0-9A-HJKMNP-TV-Z]';

// ---------- Identificadores (R7: aleatorios, no secuenciales) ----------
const ids = {
  IdSesion: ['ses', 'sesión de videocotización'],
  IdCotizacion: ['cot', 'cotización emitida'],
  IdAsesor: ['ase', 'asesor/profesional del panel'],
  IdClaveWidget: ['cpw', 'clave pública del widget (id de gestión, no el secreto)'],
  IdSolicitudArco: ['arc', 'solicitud ARCO'],
  IdRegistro: ['reg', 'fila del registro de lecturas'],
  IdConsentimiento: ['cns', 'consentimiento registrado (solo-anexar)'],
};
for (const [n, [p, d]] of Object.entries(ids)) {
  def(n, `Id opaco de ${d}: prefijo "${p}_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.`, {
    type: 'string',
    pattern: `^${p}_${B32}{26}$`,
  });
}
def('IdPublicoEnlace', 'id_publico del enlace opaco del profesional: 22 caracteres base64url (128 bits aleatorios). Rotable (R62).', {
  type: 'string',
  pattern: '^[A-Za-z0-9_-]{22}$',
});
def('CodigoReferencia', 'Código de referencia de la derivación a WhatsApp: no predecible (50 bits), sin datos personales (R50). Único por tenant.', {
  type: 'string',
  pattern: `^VC-${B32}{4}-${B32}{6}$`,
});

// ---------- Primitivos ----------
def('Centavos', 'Monto en centavos de la moneda indicada. Entero int64 no negativo; tope práctico 2^53−1 para clientes JavaScript. Nunca decimal (O04, G01).', {
  type: 'integer',
  format: 'int64',
  minimum: 0,
  maximum: 9007199254740991,
});
def('Moneda', 'Código ISO 4217. Hoy solo ARS; USD reservado para tenants externos.', { type: 'string', enum: ['ARS', 'USD'] });
def('CantidadCentesimas', 'Cantidad normalizada a centésimas de la unidad (p. ej. 12,5 m² = 1250). Entero: sin float (N1 de T16).', {
  type: 'integer',
  format: 'int64',
  minimum: 1,
  maximum: 1000000000,
});
def('FechaHora', 'Fecha y hora RFC 3339 en UTC (sufijo Z).', { type: 'string', format: 'date-time', pattern: 'Z$', maxLength: 30 });
def('Oficio', 'Oficio cubierto. reparaciones, mantenimiento y limpieza todavía sin tarifario (T26).', {
  type: 'string',
  enum: ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'],
});
def('ZonaAtendida', 'Zonas donde trabajan los profesionales (BRIEF).', {
  type: 'string',
  enum: ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago'],
});
def('Zona', 'Zona del trabajo. "otra" = fuera de zona: la cotización SÍ se emite, marcada (corrige T24).', {
  type: 'string',
  enum: ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago', 'otra'],
});
def('ModoAvatar', 'Modo del avatar (BRIEF 1): 3D en vivo con visemas o clips pregrabados.', { type: 'string', enum: ['3d', 'clips'] });
def('EstadoSesion', 'Estado de la sesión.', { type: 'string', enum: ['creada', 'consentida', 'en_curso', 'cerrada'] });
def(
  'MotivoCierre',
  'Motivo de cierre (R60 + ADR 0006, conciliados): cliente_cerro = cliente_colgo del ADR; error_interno + error_proveedor = "error" de R60.',
  {
    type: 'string',
    enum: [
      'completada',
      'cliente_cerro',
      'sin_voz',
      'sin_camara',
      'sin_consentimiento',
      'duracion_maxima',
      'cuota_agotada',
      'desafio_invalido',
      'error_proveedor',
      'error_interno',
    ],
  },
);
def('Origin', 'Origin exacto permitido para una clave pública: https, sin comodines, sin ruta ni barra final (R55).', {
  type: 'string',
  maxLength: 253,
  pattern: '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(:[0-9]{1,5})?$',
});
def('UnidadMedida', 'Unidad de cada ítem.', { type: 'string', enum: ['m2', 'ml', 'unidad', 'hora', 'jornada', 'visita', 'global'] });
def('Telefono', 'Teléfono en formato E.164.', { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' });
def('Email', 'Correo electrónico.', { type: 'string', format: 'email', maxLength: 254 });
def('VersionAviso', 'Versión fechada del aviso de privacidad: AAAA-MM-DD.n', { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]{1,3}$' });
def('CodigoError', 'Código estable del catálogo de errores (catalogo-errores.json define el HTTP y el texto).', {
  type: 'string',
  enum: [], // se completa en generar.mjs desde catalogo-errores.json
});

// ---------- Errores ----------
def('ErrorCampo', 'Error de un campo concreto (JSON Pointer), sin eco del valor recibido.', obj({ campo: str(200, { pattern: '^(/[^/]*)*$' }), problema: txt(200) }));
def(
  'Error',
  'Problema RFC 9457 (application/problem+json) con código del catálogo. Sin trazas ni detalles internos (R31). Distingue los 401: credencial_invalida, sesion_vencida, reautenticacion_requerida, credenciales_incorrectas, totp_invalido.',
  obj(
    {
      type: str(200, { format: 'uri', pattern: '^https://' }),
      title: txt(120),
      status: ent(400, 599),
      codigo: r('CodigoError'),
      detail: txt(500),
      id_traza: { type: 'string', pattern: '^tr_[0-9a-f]{16}$' },
      errores: arr(r('ErrorCampo'), 1, 50),
      reintentar_en_s: ent(1, 86400),
    },
    ['type', 'title', 'status', 'codigo', 'id_traza'],
  ),
);

// ---------- Público / widget ----------
def(
  'Avatar',
  'Avatar elegible (apariencia de trabajador constructor).',
  obj({ avatar_id: { type: 'string', pattern: '^av_[a-z0-9_]{2,30}$' }, nombre: txt(60), modos: arr(r('ModoAvatar'), 1, 2, { uniqueItems: true }), descripcion_accesible: txt(200) }),
);
def(
  'ReglaFotograma',
  'Límites de fotogramas (BRIEF 3, R65). El servidor descarta lo que no cumpla. Los fotogramas NO se guardan.',
  obj({
    formato: cte('image/jpeg'),
    lado_max_px: ent(64, 1024),
    bytes_max: ent(1024, 131072),
    intervalo_min_ms: ent(3000, 60000),
    max_por_sesion: ent(1, 1200),
  }),
);
def(
  'EnlacePublico',
  'Configuración pública del enlace opaco del profesional (R63: perfil público mínimo, sin teléfono ni apellido). Inexistente, revocado u otro tenant → mismo 404 (R64).',
  obj({
    id_publico: r('IdPublicoEnlace'),
    profesional: obj({ nombre_visible: txt(60), oficios: arr(r('Oficio'), 1, 5, { uniqueItems: true }), zonas: arr(r('ZonaAtendida'), 1, 4, { uniqueItems: true }) }),
    avatares: arr(r('Avatar'), 1, 6),
    aviso_privacidad: obj({ version: r('VersionAviso'), url: str(300, { format: 'uri', pattern: '^https://' }) }),
    camara_obligatoria: cte(true),
    fotograma: r('ReglaFotograma'),
    asistente_automatico: cte(true, { description: 'Se avisa que atiende un asistente automático (R46).' }),
  }),
);
def(
  'AvisoPrivacidad',
  'Aviso de privacidad versionado (R11). El texto y los incisos se validan con abogado.',
  obj({
    version: r('VersionAviso'),
    vigente_desde: { type: 'string', format: 'date' },
    url: str(300, { format: 'uri', pattern: '^https://' }),
    resumen: txt(600),
    incisos: arr(
      { type: 'string', enum: ['finalidad', 'destinatarios', 'responsable', 'obligatoriedad', 'consecuencias', 'derechos_arco', 'transferencia_internacional', 'autoridad_de_control'] },
      8,
      8,
      { uniqueItems: true },
    ),
    a_validar_con_abogado: cte(true),
  }),
);
def(
  'DesafioEmitido',
  'Desafío anti-bots (R53): un solo uso, vence en ≤120 s, ligado a clave pública + Origin. Mecanismo PROVISORIO (P7).',
  obj({
    desafio: { type: 'string', pattern: '^dsf_[A-Za-z0-9_-]{43}$' },
    mecanismo: { type: 'string', enum: ['prueba_de_trabajo_sha256'] },
    dificultad_bits: ent(8, 32),
    vence_en: r('FechaHora'),
    vence_en_s: ent(10, 120),
    provisorio: cte(true),
  }),
);
def(
  'CrearSesionSolicitud',
  'Pedido de crearSesion. No acepta tenant_id (R3): el tenant sale de la credencial y del enlace.',
  obj(
    {
      enlace: r('IdPublicoEnlace'),
      modo_avatar: r('ModoAvatar'),
      avatar_id: { type: 'string', pattern: '^av_[a-z0-9_]{2,30}$' },
      idioma: cte('es-AR'),
      referencia_externa: str(64, { pattern: '^[A-Za-z0-9._-]+$', description: 'Referencia del tercero, sin datos personales (R28).' }),
    },
    ['enlace', 'modo_avatar'],
  ),
);
def(
  'LimitesSesion',
  'Límites de la sesión (R60, R65, R66). Valores provisorios (P8).',
  obj({
    sin_voz_s: ent(5, 120),
    duracion_maxima_s: ent(60, 3600),
    caracteres_max_por_turno: ent(50, 2000),
    turnos_llm_max: ent(1, 200),
    fotograma: r('ReglaFotograma'),
  }),
);
def(
  'SesionCreada',
  'Respuesta de crearSesion. NO incluye token de medios: primero consentimiento (R10, O1).',
  obj({
    sesion_id: r('IdSesion'),
    estado: cte('creada'),
    token_sesion: obj({ valor: { type: 'string', pattern: '^vc_ses_[A-Za-z0-9_-]{43}$' }, vence_en: r('FechaHora') }),
    consentimiento: obj({ requerido: cte(true), aviso_version: r('VersionAviso'), aviso_url: str(300, { format: 'uri', pattern: '^https://' }) }),
    limites: r('LimitesSesion'),
    creada_en: r('FechaHora'),
  }),
);
def(
  'Sesion',
  'Lectura de una sesión por id (tenant con clave secreta o el propio cliente con token de sesión).',
  obj(
    {
      sesion_id: r('IdSesion'),
      estado: r('EstadoSesion'),
      modo_avatar: r('ModoAvatar'),
      creada_en: r('FechaHora'),
      consentida_en: r('FechaHora'),
      cerrada_en: r('FechaHora'),
      motivo_cierre: r('MotivoCierre'),
      duracion_s: ent(0, 86400),
      cotizacion_id: r('IdCotizacion'),
    },
    ['sesion_id', 'estado', 'modo_avatar', 'creada_en', 'duracion_s'],
    {
      if: { type: 'object', properties: { estado: { const: 'cerrada' } }, required: ['estado'] },
      then: { type: 'object', properties: { cerrada_en: true, motivo_cierre: true }, required: ['cerrada_en', 'motivo_cierre'] },
      else: { type: 'object', not: { type: 'object', anyOf: [{ type: 'object', properties: { cerrada_en: true }, required: ['cerrada_en'] }, { type: 'object', properties: { motivo_cierre: true }, required: ['motivo_cierre'] }] } },
    },
  ),
);
def(
  'ConsentimientoSolicitud',
  'Consentimiento previo a cámara y micrófono (R10, R46, R61). Todos los campos deben ser true; rechazar = cerrar con sin_consentimiento o sin_camara (R45).',
  obj({
    aviso_version: r('VersionAviso'),
    acepta_camara_y_microfono: cte(true),
    acepta_tratamiento: cte(true),
    declara_mayor_de_18: cte(true),
    informado_asistente_automatico: cte(true),
  }),
);
def(
  'ConsentimientoRegistrado',
  'Consentimiento registrado en tabla solo-anexar (R12).',
  obj({ consentimiento_id: r('IdConsentimiento'), sesion_id: r('IdSesion'), aviso_version: r('VersionAviso'), registrado_en: r('FechaHora'), estado_sesion: cte('consentida') }),
);
def(
  'TokenMedios',
  'Token del WebSocket de medios (R32): corto, un solo uso, ligado a la sesión; se envía en el primer mensaje, no en la URL. Emitirlo reserva el cupo de simultáneas (R57, R61).',
  obj({
    token: { type: 'string', pattern: '^vc_med_[A-Za-z0-9_-]{43}$' },
    ws_url: str(300, { pattern: '^wss://[a-z0-9.-]+(:[0-9]{1,5})?/v1/sesiones/ses_[0-9A-HJKMNP-TV-Z]{26}/medios$' }),
    vence_en: r('FechaHora'),
    vence_en_s: ent(5, 60),
    un_solo_uso: cte(true),
    protocolo_eventos: cte('vc-eventos.borrador.1', { description: 'Eventos NO CONGELADOS (eventos-sesion.md).' }),
  }),
);
def('CierreSolicitud', 'Cierre pedido por el cliente o el tenant.', obj({ motivo: { type: 'string', enum: ['cliente_cerro', 'sin_consentimiento', 'sin_camara'] } }));
def(
  'ItemCotizacion',
  'Ítem del presupuesto. importe_centavos = (cantidad_centesimas × precio_unitario_centavos + 50) div 100 (redondeo mitad hacia arriba, enteros). Calculado por Go desde tarifas, nunca por el LLM.',
  obj({
    tipo: { type: 'string', enum: ['mano_de_obra', 'traslado', 'recargo'] },
    codigo_tarea: { type: 'string', pattern: '^[a-z0-9_]{3,60}$' },
    descripcion: txt(200),
    unidad: r('UnidadMedida'),
    cantidad_centesimas: r('CantidadCentesimas'),
    precio_unitario_centavos: r('Centavos'),
    importe_centavos: r('Centavos'),
  }),
);
def(
  'Cotizacion',
  'Presupuesto orientativo emitido al final (BRIEF 5). total_centavos = suma de importes. zona "otra" ⇒ fuera_de_zona true y se emite igual (T24).',
  obj(
    {
      cotizacion_id: r('IdCotizacion'),
      sesion_id: r('IdSesion'),
      emitida_en: r('FechaHora'),
      moneda: r('Moneda'),
      oficio: r('Oficio'),
      zona: r('Zona'),
      fuera_de_zona: { type: 'boolean' },
      items: arr(r('ItemCotizacion'), 1, 30),
      total_centavos: r('Centavos'),
      orientativa: cte(true),
      leyenda: txt(300),
      tarifas: obj({ version: { type: 'string', pattern: '^[0-9]{4}\\.[0-9]{1,3}$' }, estado: { type: 'string', enum: ['referencia_publica_sin_validar', 'validada'] } }),
      validez_dias: ent(1, 90),
    },
    undefined,
    {
      if: { type: 'object', properties: { zona: { const: 'otra' } }, required: ['zona'] },
      then: { type: 'object', properties: { fuera_de_zona: { const: true } } },
      else: { type: 'object', properties: { fuera_de_zona: { const: false } } },
    },
  ),
);
def(
  'DerivacionWhatsApp',
  'Derivación a WhatsApp con el profesional (BRIEF 6). La URL lleva el número del profesional y un texto con SOLO el código de referencia (R50). El backend no envía mensajes.',
  obj({
    codigo_referencia: r('CodigoReferencia'),
    url_wa_me: str(600, { pattern: '^https://wa\\.me/[1-9][0-9]{7,14}\\?text=[A-Za-z0-9%._~-]+$' }),
    texto_prellenado: txt(300),
    generada_en: r('FechaHora'),
  }),
);
def(
  'CierreSesion',
  'Resultado del cierre. Con sin_consentimiento/sin_camara la derivación es la alternativa por WhatsApp (R45).',
  obj(
    {
      sesion_id: r('IdSesion'),
      estado: cte('cerrada'),
      motivo_cierre: r('MotivoCierre'),
      cerrada_en: r('FechaHora'),
      duracion_s: ent(0, 86400),
      cotizacion_id: r('IdCotizacion'),
      derivacion: r('DerivacionWhatsApp'),
    },
    ['sesion_id', 'estado', 'motivo_cierre', 'cerrada_en', 'duracion_s'],
  ),
);
const consentContacto = obj({
  aviso_version: r('VersionAviso'),
  acepta_ser_contactado: cte(true, { description: 'Casilla NO premarcada en el front (R68).' }),
  finalidad: cte('que_el_profesional_te_contacte'),
});
def(
  'ContactoSolicitud',
  'Contacto opcional del cliente con aviso y consentimiento específicos (R68). Al menos teléfono o email. Sin publicidad.',
  obj(
    { nombre: txt(80), telefono: r('Telefono'), email: r('Email'), preferencia: { type: 'string', enum: ['whatsapp', 'llamada', 'email'] }, consentimiento: consentContacto },
    ['nombre', 'consentimiento'],
    { anyOf: [{ type: 'object', properties: { telefono: true }, required: ['telefono'] }, { type: 'object', properties: { email: true }, required: ['email'] }] },
  ),
);
def(
  'ContactoRegistrado',
  'Confirmación del contacto: no repite los datos personales.',
  obj({ sesion_id: r('IdSesion'), registrado_en: r('FechaHora'), aviso_version: r('VersionAviso'), retencion_dias: ent(1, 3650) }),
);
def(
  'SolicitudArco',
  'Solicitud de acceso, rectificación o supresión del cliente final (R22–R24). Identificación con dos factores: código de referencia + contacto.',
  obj(
    {
      tipo: { type: 'string', enum: ['acceso', 'rectificacion', 'supresion'] },
      codigo_referencia: r('CodigoReferencia'),
      verificacion: obj({ telefono: r('Telefono'), email: r('Email') }, [], { minProperties: 1 }),
      detalle: txt(1000),
    },
    ['tipo', 'codigo_referencia', 'verificacion'],
  ),
);
def(
  'SolicitudArcoRecibida',
  'Acuse genérico e idéntico haya o no coincidencia (R24). Sin cargo (art. 19). Plazos a validar con abogado.',
  obj({ solicitud_id: r('IdSolicitudArco'), estado: cte('recibida'), recibida_en: r('FechaHora'), plazo_vence_en: r('FechaHora'), mensaje: txt(300) }),
);
def(
  'ConsumoDiario',
  'Consumo de un día (contrato 0.1.3).',
  obj({ fecha: { type: 'string', format: 'date' }, segundos: ent(0, 86400 * 5), sesiones: ent(0, 100000), cotizaciones_emitidas: ent(0, 100000) }),
);
def(
  'Consumo',
  'Consumo y topes (BRIEF 7, R56, R59). Sin montos: no expone costos de proveedores ni de otros tenants (R52).',
  obj(
    {
      ambito: { type: 'string', enum: ['tenant', 'asesor'] },
      periodo: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      segundos_usados: ent(0, 100000000),
      segundos_tope: ent(0, 100000000),
      simultaneas_en_curso: ent(0, 1000),
      simultaneas_tope: ent(1, 1000),
      alerta: { type: 'string', enum: ['ninguna', 'p50', 'p80', 'p100'] },
      diario: arr(r('ConsumoDiario'), 0, 31),
      actualizado_en: r('FechaHora'),
    },
  ),
);
def(
  'ReglaRetencion',
  'Regla de retención por tipo de dato (R21, R43). plazo_dias 0 y persistido false = nunca se guarda.',
  obj({
    tipo_dato: {
      type: 'string',
      enum: ['consulta_y_presupuesto', 'contacto_cliente', 'registro_lecturas', 'consentimientos', 'solicitudes_arco', 'fotogramas', 'audio', 'transcripcion_completa', 'perfil_asesor'],
    },
    finalidad: txt(200),
    persistido: { type: 'boolean' },
    plazo_dias: ent(0, 3650),
    configurable: { type: 'boolean' },
  }),
);
def(
  'TablaRetencion',
  'Tabla de retención vigente (R21). Plazos propuestos, a validar con abogado.',
  obj({ version: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]{1,3}$' }, a_validar_con_abogado: cte(true), reglas: arr(r('ReglaRetencion'), 1, 20) }),
);
def(
  'CatalogoTextos',
  'Catálogo de textos y etiquetas para widget y panel (es-AR): error.<codigo>, motivo.<motivo>, oficio.<oficio>, zona.<zona>, etc.',
  obj({
    version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    idioma: cte('es-AR'),
    textos: { type: 'object', minProperties: 1, maxProperties: 500, propertyNames: { type: 'string', pattern: '^[a-z0-9_]+(\\.[a-z0-9_]+)+$' }, additionalProperties: txt(500) },
  }),
);
def(
  'Version',
  'Versión del contrato. Solo el OpenAPI es candidato a 1.0.0; los eventos de sesión siguen en borrador.',
  obj({
    api: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(-[a-z0-9.]+)?$' },
    estado_api: { type: 'string', enum: ['borrador', 'congelado'] },
    eventos_sesion: obj({ version: cte('vc-eventos.borrador.1'), estado: cte('borrador') }),
    deprecaciones: arr(obj({ operacion: { type: 'string', pattern: '^[a-zA-Z]+$' }, desde: { type: 'string', format: 'date' }, retiro: { type: 'string', format: 'date' } }), 0, 50),
  }),
);

// ---------- Datos extraídos y detalle (panel) ----------
def(
  'DatosExtraidos',
  'Datos de la consulta ya validados y normalizados por Go a partir de la salida del LLM (R42, R48). Sin montos (O03) ni campos sobre personas (R47).',
  obj(
    {
      oficio: r('Oficio'),
      tarea: { type: 'string', pattern: '^[a-z0-9_]{3,60}$' },
      zona: r('Zona'),
      fuera_de_zona: { type: 'boolean' },
      superficie_centesimas_m2: r('CantidadCentesimas'),
      cantidad_unidades: ent(1, 10000),
      interior_exterior: { type: 'string', enum: ['interior', 'exterior', 'ambos', 'no_aplica'] },
      altura: { type: 'string', enum: ['planta_baja', 'hasta_3m', 'entre_3_y_6m', 'mas_de_6m', 'no_aplica'] },
      estado_superficie: { type: 'string', enum: ['bueno', 'regular', 'malo', 'con_humedad', 'descascarado', 'con_hongos', 'no_aplica', 'sin_definir'] },
      urgencia: { type: 'string', enum: ['baja', 'media', 'alta', 'sin_definir'] },
      plazo: { type: 'string', enum: ['inmediato', 'esta_semana', 'este_mes', 'mas_de_un_mes', 'flexible', 'sin_definir'] },
      observaciones: txt(500),
      faltantes: arr({ type: 'string', pattern: '^[a-z0-9_]{2,60}$' }, 0, 20, { uniqueItems: true }),
      corregido_por_cliente: { type: 'boolean' },
    },
    ['oficio', 'zona', 'fuera_de_zona', 'faltantes', 'corregido_por_cliente'],
  ),
);
def(
  'RespuestaModelo',
  'Salida del LLM de un turno, tal como validó contra el esquema de conductas (R42). El esquema lo mantiene cot en conductas/.',
  obj({ turno: ent(1, 500), registrada_en: r('FechaHora'), salida: { $ref: RUTA_SALIDA_LLM } }),
);
def(
  'ResumenCotizacion',
  'Fila de "Mis cotizaciones". contacto_disponible y codigo_referencia viven SOLO acá (T39).',
  obj(
    {
      sesion_id: r('IdSesion'),
      creada_en: r('FechaHora'),
      estado: r('EstadoSesion'),
      motivo_cierre: r('MotivoCierre'),
      oficio: r('Oficio'),
      zona: r('Zona'),
      fuera_de_zona: { type: 'boolean' },
      total: obj({ cotizacion_id: r('IdCotizacion'), total_centavos: r('Centavos'), moneda: r('Moneda') }),
      codigo_referencia: r('CodigoReferencia'),
      contacto_disponible: { type: 'boolean' },
      resumen: txt(280),
    },
    ['sesion_id', 'creada_en', 'estado', 'fuera_de_zona', 'contacto_disponible', 'resumen'],
  ),
);
def(
  'ListadoCotizaciones',
  'Página de "Mis cotizaciones" (paginación por cursor).',
  obj({ items: arr(r('ResumenCotizacion'), 0, 100), siguiente_cursor: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,200}$' } }, ['items']),
);
def(
  'SesionDetalle',
  'Detalle de una consulta para el asesor. SIN código de referencia, SIN derivación y SIN contacto_disponible (T39). Leerlo deja fila en el registro de lecturas (R69).',
  obj(
    {
      sesion_id: r('IdSesion'),
      estado: r('EstadoSesion'),
      modo_avatar: r('ModoAvatar'),
      creada_en: r('FechaHora'),
      cerrada_en: r('FechaHora'),
      motivo_cierre: r('MotivoCierre'),
      duracion_s: ent(0, 86400),
      datos_extraidos: r('DatosExtraidos'),
      cotizacion: r('Cotizacion'),
      resumen: txt(1000),
      versiones: obj({
        tarifas: { type: 'string', pattern: '^[0-9]{4}\\.[0-9]{1,3}$' },
        prompt: { type: 'string', pattern: '^[a-z0-9_]+@[0-9a-f]{12}$' },
        esquema_salida: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(-[a-z0-9.]+)?$' },
      }),
      respuestas_modelo: arr(r('RespuestaModelo'), 0, 200),
    },
    ['sesion_id', 'estado', 'modo_avatar', 'creada_en', 'duracion_s', 'resumen', 'versiones'],
  ),
);
def(
  'ContactoCliente',
  'Contacto del cliente: solo para el asesor de esa consulta y si hubo consentimiento (R68). Cada lectura queda registrada y tiene límite diario (R69).',
  obj(
    {
      sesion_id: r('IdSesion'),
      nombre: txt(80),
      telefono: r('Telefono'),
      email: r('Email'),
      preferencia: { type: 'string', enum: ['whatsapp', 'llamada', 'email'] },
      consentido_en: r('FechaHora'),
      aviso_version: r('VersionAviso'),
      lectura: obj({ registro_id: r('IdRegistro'), lecturas_restantes_hoy: ent(0, 1000) }),
    },
    ['sesion_id', 'nombre', 'consentido_en', 'aviso_version', 'lectura'],
  ),
);
def(
  'RegistroLectura',
  'Fila del registro solo-anexar (R69, R70): solo ids, sin datos personales.',
  obj(
    {
      registro_id: r('IdRegistro'),
      ocurrido_en: r('FechaHora'),
      asesor_id: r('IdAsesor'),
      accion: {
        type: 'string',
        enum: ['ver_detalle', 'ver_contacto', 'exportar_mi_cuenta', 'rotar_enlace', 'crear_clave_widget', 'revocar_clave_widget', 'inicio_sesion', 'cambio_contrasena'],
      },
      recurso_id: { type: 'string', pattern: `^[a-z]{3}_${B32}{26}$` },
    },
    ['registro_id', 'ocurrido_en', 'asesor_id', 'accion'],
  ),
);
def('ListadoRegistros', 'Página de "Registros".', obj({ items: arr(r('RegistroLectura'), 0, 100), siguiente_cursor: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,200}$' } }, ['items']));

// ---------- Panel: sesión, perfil, claves, enlace ----------
def('LoginSolicitud', 'Primer paso del login del panel. Mensaje de error uniforme (R37).', obj({ email: r('Email'), contrasena: str(256, { minLength: 12, writeOnly: true }) }));
def(
  'LoginPaso',
  'Contraseña correcta: falta TOTP (R38). Se emite cookie __Host-vc_panel preliminar y un CSRF para el paso siguiente.',
  obj({ paso: cte('totp'), csrf_token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' }, vence_en: r('FechaHora') }),
);
def(
  'TotpSolicitud',
  'Código TOTP de 6 dígitos o código de recuperación de un uso (exactamente uno).',
  obj(
    { codigo: { type: 'string', pattern: '^[0-9]{6}$' }, codigo_recuperacion: { type: 'string', pattern: '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$', writeOnly: true } },
    [],
    { oneOf: [{ type: 'object', properties: { codigo: true }, required: ['codigo'] }, { type: 'object', properties: { codigo_recuperacion: true }, required: ['codigo_recuperacion'] }] },
  ),
);
def(
  'SesionPanel',
  'Sesión del panel tras TOTP (id rotado, R35). Vencimientos por inactividad y absoluto (R34).',
  obj(
    {
      asesor: obj({ asesor_id: r('IdAsesor'), nombre_visible: txt(60), rol: { type: 'string', enum: ['asesor', 'administrador'] } }),
      csrf_token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
      vence_inactividad_en: r('FechaHora'),
      vence_absoluto_en: r('FechaHora'),
      reautenticado_hasta: r('FechaHora'),
    },
    ['asesor', 'csrf_token', 'vence_inactividad_en', 'vence_absoluto_en'],
  ),
);
def('ReautenticacionSolicitud', 'Reautenticación (R39): contraseña + TOTP.', obj({ contrasena: str(256, { minLength: 12, writeOnly: true }), codigo_totp: { type: 'string', pattern: '^[0-9]{6}$' } }));
def('ReautenticacionOtorgada', 'Ventana de reautenticación (≤5 min).', obj({ valida_hasta: r('FechaHora'), valida_s: ent(1, 300) }));
def(
  'PerfilAsesor',
  'Perfil mínimo del asesor (R40): sin DNI ni domicilio.',
  obj({
    asesor_id: r('IdAsesor'),
    rol: { type: 'string', enum: ['asesor', 'administrador'] },
    nombre_visible: txt(60),
    email: r('Email'),
    whatsapp: r('Telefono'),
    oficios: arr(r('Oficio'), 1, 5, { uniqueItems: true }),
    zonas: arr(r('ZonaAtendida'), 1, 4, { uniqueItems: true }),
    totp_activo: cte(true),
    consentimiento_asesor: obj({ version: r('VersionAviso'), aceptado_en: r('FechaHora') }),
    creado_en: r('FechaHora'),
  }),
);
def(
  'PerfilActualizacion',
  'Cambios parciales del perfil (al menos uno). Email y contraseña se cambian por rutas con reautenticación.',
  obj(
    { nombre_visible: txt(60), whatsapp: r('Telefono'), oficios: arr(r('Oficio'), 1, 5, { uniqueItems: true }), zonas: arr(r('ZonaAtendida'), 1, 4, { uniqueItems: true }) },
    [],
    { minProperties: 1 },
  ),
);
def('CambioContrasenaSolicitud', 'Cambio de contraseña (requiere reautenticación previa).', obj({ contrasena_nueva: str(256, { minLength: 12, writeOnly: true }) }));
def(
  'ClaveWidget',
  'Clave pública del widget (vista de gestión, sin el secreto).',
  obj(
    {
      clave_id: r('IdClaveWidget'),
      nombre: txt(60),
      prefijo: { type: 'string', pattern: '^vc_pub_[A-Za-z0-9_-]{6}$' },
      origins: arr(r('Origin'), 1, 10, { uniqueItems: true }),
      estado: { type: 'string', enum: ['activa', 'revocada'] },
      creada_en: r('FechaHora'),
      revocada_en: r('FechaHora'),
      ultimo_uso_en: r('FechaHora'),
    },
    ['clave_id', 'nombre', 'prefijo', 'origins', 'estado', 'creada_en'],
  ),
);
def('ClaveWidgetSolicitud', 'Alta de clave pública con su lista de Origin exactos (R54, R55).', obj({ nombre: txt(60), origins: arr(r('Origin'), 1, 10, { uniqueItems: true }) }));
def(
  'ClaveWidgetCreada',
  'Alta de clave: el valor completo se muestra UNA sola vez (secreto único, T37); después solo el prefijo.',
  obj({ clave: r('ClaveWidget'), valor: { type: 'string', pattern: '^vc_pub_[A-Za-z0-9_-]{40}$' }, se_muestra_una_sola_vez: cte(true) }),
);
def('ListadoClavesWidget', 'Claves públicas del tenant.', obj({ items: arr(r('ClaveWidget'), 0, 50) }));
def(
  'EnlaceCompartir',
  'Enlace opaco del profesional y texto listo para compartir.',
  obj(
    {
      id_publico: r('IdPublicoEnlace'),
      url: str(300, { pattern: '^https://cotizar\\.[a-z0-9.-]+/c/[A-Za-z0-9_-]{22}$' }),
      texto_compartir: txt(280),
      rotado_en: r('FechaHora'),
    },
    ['id_publico', 'url', 'texto_compartir'],
  ),
);
def(
  'ExportacionMiCuenta',
  'Exportación de los datos propios del asesor (R49).',
  obj({ formato_version: cte('1'), generada_en: r('FechaHora'), perfil: r('PerfilAsesor'), lecturas: arr(r('RegistroLectura'), 0, 10000), consumo: r('Consumo') }),
);

// ---------- Eventos de sesión por WebSocket (NO CONGELADOS) ----------
const NC = 'NO CONGELADO (borrador vc-eventos.borrador.1). ';
const evento = (tipo, datos, desc, dir) =>
  def(
    'Evento_' + tipo.replace('.', '_'),
    NC + `${dir === 'c' ? 'Cliente → servidor' : 'Servidor → cliente'}: ${desc}`,
    obj({ v: cte(1), tipo: cte(tipo), seq: ent(0, 4294967295), ts: re('FechaHora'), datos }),
    'eventos',
  );
const TEXTO_EV = txt(2000);
evento('sesion.autenticar', obj({ token_medios: { type: 'string', pattern: '^vc_med_[A-Za-z0-9_-]{43}$' } }), 'primer mensaje; sin esto se cierra (R32).', 'c');
evento('texto.enviar', obj({ texto: txt(500) }), 'texto tipeado por el cliente (tope por turno, R66).', 'c');
evento(
  'pizarron.corregir',
  obj({ version_base: ent(1, 100000), clave: { type: 'string', pattern: '^[a-z0-9_]{2,60}$' }, valor: txt(200) }),
  'el cliente corrige un dato del pizarrón (R48).',
  'c',
);
evento('sesion.cerrar', obj({ motivo: cte('cliente_cerro') }), 'el cliente corta.', 'c');
evento('sesion.lista', obj({ sesion_id: re('IdSesion'), limites: re('LimitesSesion') }), 'token aceptado; arranca la conversación.', 's');
evento('transcripcion.parcial', obj({ turno: ent(1, 500), texto: TEXTO_EV }), 'transcripción parcial (texto plano, R19).', 's');
evento('transcripcion.final', obj({ turno: ent(1, 500), texto: TEXTO_EV }), 'transcripción final del turno.', 's');
evento(
  'avatar.respuesta',
  obj({ turno: ent(1, 500), texto: TEXTO_EV, clip_id: { type: 'string', pattern: '^clip_[a-z0-9_]{2,40}$' } }, ['turno', 'texto']),
  'lo que dice el avatar; sin montos salvo la frase final de Go (R19, ADR 0002).',
  's',
);
const VISEMAS = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
evento(
  'avatar.visemas',
  obj({ turno: ent(1, 500), items: arr(obj({ v: { type: 'string', enum: VISEMAS }, t_ms: ent(0, 600000), d_ms: ent(1, 5000) }), 1, 2000) }),
  'visemas del audio del turno.',
  's',
);
evento(
  'pizarron.actualizado',
  obj({
    version: ent(1, 100000),
    campos: arr(obj({ clave: { type: 'string', pattern: '^[a-z0-9_]{2,60}$' }, etiqueta: txt(60), valor: txt(200), estado: { type: 'string', enum: ['anotado', 'corregido_por_cliente', 'faltante'] } }), 0, 40),
  }),
  'pizarrón en vivo; nunca contiene montos (ADR 0006).',
  's',
);
evento(
  'camara.fotograma',
  obj(
    { seq_fotograma: ent(0, 4294967295), resultado: { type: 'string', enum: ['aceptado', 'descartado'] }, motivo: { type: 'string', enum: ['frecuencia', 'tamano', 'dimensiones', 'formato', 'tope_sesion'] } },
    ['seq_fotograma', 'resultado'],
  ),
  'acuse de fotograma (R65); el fotograma no se guarda.',
  's',
);
evento(
  'sesion.aviso',
  obj({ aviso: { type: 'string', enum: ['sin_voz_proximo', 'duracion_proxima', 'cuota_proxima'] }, segundos_restantes: ent(0, 3600) }),
  'aviso previo a un corte (R60, ADR 0005).',
  's',
);
evento('cotizacion.emitida', obj({ cotizacion: re('Cotizacion'), derivacion: re('DerivacionWhatsApp') }), 'presupuesto final (solo al final, BRIEF 5).', 's');
evento('sesion.cerrada', obj({ motivo_cierre: re('MotivoCierre'), duracion_s: ent(0, 86400) }), 'cierre con motivo (R60).', 's');
evento('error', obj({ codigo: re('CodigoError'), mensaje: txt(300) }), 'error recuperable o previo al cierre.', 's');

const cli = ['sesion.autenticar', 'texto.enviar', 'pizarron.corregir', 'sesion.cerrar'];
const srv = Object.keys(esquemas)
  .filter((k) => k.startsWith('eventos/'))
  .map((k) => k.slice(8))
  .filter((k) => !cli.map((c) => 'Evento_' + c.replace('.', '_')).includes(k));
def('EventoCliente', NC + 'Unión de eventos cliente → servidor.', { oneOf: cli.map((c) => ({ $ref: `Evento_${c.replace('.', '_')}.schema.json` })) }, 'eventos');
def('EventoServidor', NC + 'Unión de eventos servidor → cliente.', { oneOf: srv.map((c) => ({ $ref: `${c}.schema.json` })) }, 'eventos');
def(
  'EncabezadoBinario',
  NC + 'Encabezado binario de 20 bytes de las tramas binarias (subida: audio y fotogramas; bajada: audio de respuesta), decodificado (ver eventos-sesion.md).',
  obj({
    magia: cte('VC'),
    version: cte(1),
    tipo: { type: 'string', enum: ['audio_pcm16_16k', 'audio_opus', 'fotograma_jpeg', 'audio_respuesta_opus'] },
    flags: ent(0, 255),
    seq: ent(0, 4294967295),
    ts_ms: ent(0, 4294967295),
    longitud: ent(0, 131072),
  }),
  'eventos',
);
