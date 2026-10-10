// Construcción del OpenAPI 3.1 (rutas, seguridad, ejemplos). Lo escribe generar.mjs.
import * as E from './ejemplos.mjs';
import { catalogo } from './catalogo.mjs';
import { VERSION, id, idEnlace } from './base.mjs';

const R = (n) => ({ $ref: `#/components/schemas/${n}` });
const exs = (lista, prefijo) => Object.fromEntries(lista.map((v, k) => [`${prefijo}_${String(k + 1).padStart(2, '0')}`, { summary: `${prefijo} ${k + 1}`, value: v }]));
const exsNombrados = (pares) => Object.fromEntries(pares.map(([n, s, v]) => [n, { summary: s, value: v }]));
const range = (n) => Array.from({ length: n }, (_, k) => k);

const P = {
  sesion_id: { name: 'sesion_id', in: 'path', required: true, description: 'Id de la sesión.', schema: R('IdSesion'), examples: exsNombrados([['ses_a', 'Sesión', id('ses', 1)], ['ses_b', 'Otra sesión', id('ses', 2)]]) },
  id_publico: { name: 'id_publico', in: 'path', required: true, description: 'id_publico del enlace opaco del profesional.', schema: R('IdPublicoEnlace'), examples: exsNombrados([['enlace_a', 'Enlace', idEnlace(1)], ['enlace_b', 'Otro enlace', idEnlace(2)]]) },
  clave_id: { name: 'clave_id', in: 'path', required: true, description: 'Id de gestión de la clave pública.', schema: R('IdClaveWidget'), examples: exsNombrados([['clave_a', 'Clave', id('cpw', 1)]]) },
  Origin: { name: 'Origin', in: 'header', required: true, description: 'Origin del navegador; debe estar en la lista exacta de la clave pública (R55).', schema: R('Origin'), examples: exsNombrados([['origin_ok', 'Origin permitido', `https://cotizar.${E.DOMINIO}`]]) },
  OriginOpcional: {
    name: 'Origin',
    in: 'header',
    required: false,
    description: 'Obligatorio con clave pública. Con clave secreta su presencia provoca 403 clave_secreta_desde_navegador (R2).',
    schema: R('Origin'),
    examples: exsNombrados([['origin_widget', 'Widget', `https://cotizar.${E.DOMINIO}`]]),
  },
  IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, description: 'Reintento seguro de crearSesion (24 h).', schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$' }, examples: exsNombrados([['idem', 'Clave', 'b1946ac92492d2347c62']]) },
  cursor: { name: 'cursor', in: 'query', required: false, description: 'Cursor opaco de la página siguiente.', schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,200}$' }, examples: exsNombrados([['cursor', 'Cursor', 'QWxndW5DdXJzb3JPcGFjbw']]) },
  limite: { name: 'limite', in: 'query', required: false, description: 'Tamaño de página (1–100, por defecto 20).', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, examples: exsNombrados([['l20', '20', 20], ['l50', '50', 50]]) },
  oficio: { name: 'oficio', in: 'query', required: false, description: 'Filtro por oficio.', schema: R('Oficio'), examples: exsNombrados([['pintura', 'Pintura', 'pintura']]) },
  desde: { name: 'desde', in: 'query', required: false, description: 'Desde (fecha, inclusive).', schema: { type: 'string', format: 'date' }, examples: exsNombrados([['desde', 'Desde', '2026-10-01']]) },
  hasta: { name: 'hasta', in: 'query', required: false, description: 'Hasta (fecha, inclusive).', schema: { type: 'string', format: 'date' }, examples: exsNombrados([['hasta', 'Hasta', '2026-10-31']]) },
  periodo: { name: 'periodo', in: 'query', required: false, description: 'Mes AAAA-MM (por defecto el actual).', schema: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, examples: exsNombrados([['oct', 'Octubre 2026', '2026-10']]) },
};

const SEG = {
  publica: ['clavePublica'],
  publicaDesafio: ['clavePublica', 'desafio'],
  secreta: ['claveSecreta'],
  sesion: ['tokenSesion'],
  panel: ['cookiePanel'],
  panelEsc: ['cookiePanel', 'csrf'],
};
const sec = (...alts) => alts.map((a) => Object.fromEntries(a.map((s) => [s, []])));

export const operaciones = [];
function op(o) {
  operaciones.push(o);
}

// ---------------- Widget / público ----------------
op({ m: 'get', p: '/v1/widget/enlaces/{id_publico}', id: 'leerEnlacePublico', cors: true, tag: 'Widget', s: 'Leer la configuración pública del enlace opaco', d: 'Perfil público mínimo del profesional y avatares elegibles (R63). Inexistente, revocado o de otro tenant: mismo 404 (R64).', seg: [SEG.publica], params: ['id_publico', 'Origin'], ok: [200, 'EnlacePublico', range(6).map(E.enlacePublico)], recurso: 'enlace' });
op({ m: 'post', p: '/v1/widget/desafios', id: 'emitirDesafio', cors: true, tag: 'Widget', s: 'Emitir un desafío anti-bots', d: 'Desafío de un uso, ligado a la clave pública y al Origin, que vence en ≤120 s (R53). El widget lo resuelve y lo manda en `X-Desafio` a crearSesion. Mecanismo provisorio (P7).', seg: [SEG.publica], params: ['Origin'], ok: [201, 'DesafioEmitido', range(4).map(E.desafio)] });
op({ m: 'get', p: '/v1/widget/avisos/privacidad', id: 'leerAvisoPrivacidad', cors: true, tag: 'Privacidad', s: 'Leer el aviso de privacidad vigente', d: 'Aviso versionado con los incisos del art. 6 (R11). Texto a validar con abogado.', seg: [SEG.publica, SEG.secreta], params: ['OriginOpcional'], ok: [200, 'AvisoPrivacidad', range(2).map(E.aviso)] });

// ---------------- Sesiones ----------------
op({
  m: 'post', p: '/v1/sesiones', id: 'crearSesion', cors: true, tag: 'Sesiones', s: 'Crear una sesión de videocotización',
  d: 'Con clave pública exige `Origin` de la lista y `X-Desafio` válido (R53–R55); con clave secreta, sin `Origin` (R2). No llama a ningún proveedor ni emite token de medios: primero consentimiento (R10, R61). El tenant sale de la credencial y del enlace (R3). Límites (R58, H1): por IP antes de todo; por clave y por enlace recién después de validar Origin y consumir el desafío, así los pedidos rechazados no gastan el límite de la clave. Cupo: solo VERIFICA (sin reservar) que haya saldo ≥ 60 s y simultáneas libres; la reserva atómica es en emitirTokenMedios (H3).',
  seg: [SEG.publicaDesafio, SEG.secreta], params: ['OriginOpcional', 'IdempotencyKey'], body: ['CrearSesionSolicitud', range(10).map(E.crearSesionSol)], ok: [201, 'SesionCreada', range(6).map(E.sesionCreada)],
  extra: { 404: ['no_encontrado'], 429: ['cuota_agotada', 'simultaneas_agotadas'] }, recurso: 'enlace_cuerpo', cupo: true,
});
op({
  m: 'get', p: '/v1/sesiones/{sesion_id}', id: 'leerSesion', cors: true, tag: 'Sesiones', s: 'Leer una sesión por id', d: 'Para el tenant (clave secreta) o para el propio cliente (token de sesión ligado a esa sesión). Otra sesión u otro tenant: 404 (R5).',
  seg: [SEG.secreta, SEG.sesion], params: ['sesion_id'], ok: [200, 'Sesion', [...['creada', 'consentida', 'en_curso'].map((e, k) => E.sesion(k, e)), ...range(10).map((k) => E.sesion(k, 'cerrada'))]], recurso: 'sesion',
});
op({
  m: 'post', p: '/v1/sesiones/{sesion_id}/consentimiento', id: 'registrarConsentimiento', cors: true, tag: 'Sesiones', s: 'Registrar el consentimiento previo a cámara y micrófono',
  d: 'Registro solo-anexar (R12). Rechazar no se hace acá: se cierra con `sin_consentimiento` o `sin_camara` y se ofrece WhatsApp (R45).', seg: [SEG.sesion], params: ['sesion_id'], body: ['ConsentimientoSolicitud', range(4).map(E.consentimientoSol)], ok: [201, 'ConsentimientoRegistrado', range(3).map(E.consentimientoReg)],
  extra: { 409: ['estado_invalido', 'sesion_cerrada'] }, recurso: 'sesion',
});
op({
  m: 'post', p: '/v1/sesiones/{sesion_id}/token-medios', id: 'emitirTokenMedios', cors: true, tag: 'Sesiones', s: 'Emitir el token del WebSocket de medios',
  d: 'Solo con consentimiento registrado (O1, R10). Antes de tocar proveedores (R61) reserva en UNA transacción (R56, R57, H3): una simultánea del tenant, del asesor y global, y `duracion_maxima_s` del saldo mensual del tenant, del asesor y del tope global de gasto. Si el saldo es menor que `duracion_maxima_s` pero ≥ 60 s, reserva solo el saldo y lo informa (`reserva.recortada_por_cuota`); con menos de 60 s → 429 `cuota_agotada`. Cualquier tope agotado (tenant, asesor o global) da el mismo `cuota_agotada`/`simultaneas_agotadas`, sin revelar cuál. Al cerrar, el consumo real pasa al contador mensual y se libera el resto. Token de un uso, corto (R32). Reconectar con reserva vigente devuelve la misma reserva sin reservar de nuevo.', seg: [SEG.sesion], params: ['sesion_id'], ok: [201, 'TokenMedios', range(4).map(E.tokenMedios)],
  extra: { 409: ['consentimiento_requerido', 'sesion_cerrada'], 429: ['cuota_agotada', 'simultaneas_agotadas'], 503: ['proveedor_no_disponible'] }, recurso: 'sesion', cupo: true,
});
op({
  m: 'post', p: '/v1/sesiones/{sesion_id}/cierre', id: 'cerrarSesion', cors: true, tag: 'Sesiones', s: 'Cerrar una sesión', d: 'El servidor también cierra solo (sin_voz, duracion_maxima, cuota_agotada, errores) y lo informa por evento y en la lectura de la sesión (R60).',
  seg: [SEG.sesion, SEG.secreta], params: ['sesion_id'], body: ['CierreSolicitud', range(3).map(E.cierreSol)], ok: [200, 'CierreSesion', range(10).map(E.cierre)], extra: { 409: ['sesion_cerrada'] }, recurso: 'sesion',
});
op({
  m: 'get', p: '/v1/sesiones/{sesion_id}/cotizacion', id: 'leerCotizacion', cors: true, tag: 'Cotizaciones', s: 'Leer la cotización emitida',
  d: 'Ítems y totales en centavos int64 calculados por Go (R15), como rango mínimo–máximo (B1); `precio_final_centavos` solo con tarifario validado y rango de un punto. Una cotización fuera de zona SÍ se emite, con `fuera_de_zona: true` (T24).', seg: [SEG.sesion, SEG.secreta], params: ['sesion_id'],
  ok: [200, 'Cotizacion', [...E.OFICIOS.flatMap((o, a) => E.ZONAS.map((z, b) => E.cotizacion(o, z, a * 5 + b))), E.cotizacionPrecioFinal(0)]], extra: { 409: ['cotizacion_no_emitida'] }, recurso: 'sesion',
});
op({
  m: 'get', p: '/v1/sesiones/{sesion_id}/derivacion', id: 'leerDerivacion', cors: true, tag: 'Derivacion', s: 'Leer la derivación a WhatsApp', d: 'Enlace wa.me al profesional con código de referencia, sin datos personales (R50). Disponible al cerrar.',
  seg: [SEG.sesion, SEG.secreta], params: ['sesion_id'], ok: [200, 'DerivacionWhatsApp', range(6).map(E.derivacion)], extra: { 409: ['estado_invalido'] }, recurso: 'sesion',
});
op({
  m: 'post', p: '/v1/sesiones/{sesion_id}/contacto', id: 'registrarContacto', cors: true, tag: 'Sesiones', s: 'Dejar datos de contacto (opcional)', d: 'Con aviso visible y consentimiento no premarcado y versionado (R68). Solo lo ve el asesor de esa consulta.',
  seg: [SEG.sesion], params: ['sesion_id'], body: ['ContactoSolicitud', range(6).map(E.contactoSol)], ok: [201, 'ContactoRegistrado', range(3).map(E.contactoReg)], extra: { 409: ['contacto_ya_registrado', 'estado_invalido'] }, recurso: 'sesion',
});
op({
  m: 'post', p: '/v1/arco/solicitudes', id: 'crearSolicitudArco', tag: 'Privacidad', s: 'Registrar una solicitud ARCO del cliente final',
  d: 'Acceso, rectificación o supresión (R22–R24). La registra el tenant (clave secreta) en nombre del titular. Respuesta genérica e idéntica haya o no coincidencia. Sin cargo.', seg: [SEG.secreta], body: ['SolicitudArco', range(6).map(E.arcoSol)], ok: [202, 'SolicitudArcoRecibida', range(3).map(E.arcoRec)],
});
op({ m: 'get', p: '/v1/politicas/retencion', id: 'leerRetencion', cors: true, tag: 'Privacidad', s: 'Leer la tabla de retención', d: 'Plazos POR DEFECTO por tipo de dato y, si son configurables, el rango que el operador puede fijar por tenant con la CLI (R21, R43, C6). Pública. Plazos a validar con abogado.', seg: [], ok: [200, 'TablaRetencion', [E.retencion()]] });
op({ m: 'get', p: '/v1/consumo', id: 'leerConsumo', tag: 'Consumo', s: 'Leer consumo y topes del tenant', d: 'Contador mensual del tenant (H2): segundos usados, reservados, tope, reinicio, simultáneas y detalle diario (R56, R59). Sale de contadores que la retención y el ARCO no borran. Sin costos de proveedores ni tope global.', seg: [SEG.secreta], params: ['periodo'], ok: [200, 'Consumo', range(8).map((k) => E.consumo(k))] });
op({ m: 'get', p: '/v1/version', id: 'leerVersion', tag: 'Meta', s: 'Leer la versión del contrato', d: `Contrato ${VERSION}. Solo el OpenAPI es candidato a 1.0.0; eventos en borrador.`, seg: [], ok: [200, 'Version', [E.version()]] });
op({ m: 'get', p: '/v1/textos', id: 'leerCatalogoTextos', cors: true, tag: 'Meta', s: 'Leer el catálogo de textos', d: 'Etiquetas y mensajes en es-AR para widget y panel (errores, motivos de cierre, oficios, zonas).', seg: [], ok: [200, 'CatalogoTextos', [E.textos()]] });

// ---------------- Panel del asesor ----------------
const COOKIE = '__Host-vc_panel=Q2FkZW5hT3BhY2FEZVNlc2lvbjEyMzQ1Njc4OTA; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200';
op({
  m: 'post', p: '/v1/panel/sesion', id: 'iniciarSesionPanel', tag: 'Panel', s: 'Ingresar al panel (paso 1: contraseña)',
  d: 'Mensaje uniforme ante email o contraseña incorrectos (R37); límite progresivo por cuenta e IP. Emite cookie `__Host-vc_panel` preliminar (R33) y un CSRF para el paso TOTP.', seg: [], panel: true, body: ['LoginSolicitud', range(2).map(E.loginSol)], ok: [200, 'LoginPaso', range(2).map(E.loginPaso)], setCookie: true,
  extra: { 401: ['credenciales_incorrectas'], 403: ['origen_no_permitido'], 429: ['intentos_excedidos'] }, login: 'contrasena',
});
op({
  m: 'post', p: '/v1/panel/sesion/totp', id: 'verificarTotp', tag: 'Panel', s: 'Ingresar al panel (paso 2: TOTP)', d: 'TOTP obligatorio sin reuso (R38). Rota el id de sesión (R35).',
  seg: [SEG.panelEsc], panel: true, body: ['TotpSolicitud', range(3).map(E.totpSol)], ok: [200, 'SesionPanel', range(2).map(E.sesionPanel)], setCookie: true, extra: { 401: ['totp_invalido'], 429: ['intentos_excedidos'] }, login: 'totp',
});
op({ m: 'get', p: '/v1/panel/sesion', id: 'leerSesionPanel', tag: 'Panel', s: 'Leer la sesión del panel', d: 'Recupera el CSRF y los vencimientos al recargar.', seg: [SEG.panel], panel: true, ok: [200, 'SesionPanel', range(2).map(E.sesionPanel)] });
op({ m: 'delete', p: '/v1/panel/sesion', id: 'cerrarSesionPanel', tag: 'Panel', s: 'Salir del panel', d: 'Invalida la sesión en el servidor (R34).', seg: [SEG.panelEsc], panel: true, ok: [204] });
op({
  m: 'post', p: '/v1/panel/reautenticacion', id: 'reautenticar', tag: 'Panel', s: 'Reautenticarse para acciones sensibles', d: 'Contraseña + TOTP; habilita acciones sensibles por ≤5 min (R39).',
  seg: [SEG.panelEsc], panel: true, body: ['ReautenticacionSolicitud', range(3).map(E.reauthSol)], ok: [200, 'ReautenticacionOtorgada', [E.reauthOk()]], extra: { 401: ['credenciales_incorrectas', 'totp_invalido'], 429: ['intentos_excedidos'] }, login: 'reauth',
});
op({ m: 'get', p: '/v1/panel/perfil', id: 'leerPerfil', tag: 'Panel', s: 'Leer mi perfil', d: 'Perfil mínimo (R40).', seg: [SEG.panel], panel: true, ok: [200, 'PerfilAsesor', range(3).map(E.perfil)] });
op({ m: 'patch', p: '/v1/panel/perfil', id: 'actualizarPerfil', tag: 'Panel', s: 'Actualizar mi perfil', d: 'Cambios parciales.', seg: [SEG.panelEsc], panel: true, body: ['PerfilActualizacion', range(5).map(E.perfilAct)], ok: [200, 'PerfilAsesor', range(2).map(E.perfil)] });
op({ m: 'post', p: '/v1/panel/contrasena', id: 'cambiarContrasena', tag: 'Panel', s: 'Cambiar mi contraseña', d: 'Requiere reautenticación (R39). Invalida las demás sesiones.', seg: [SEG.panelEsc], panel: true, sensible: true, body: ['CambioContrasenaSolicitud', range(2).map(E.cambioPass)], ok: [204] });
op({
  m: 'get', p: '/v1/panel/cotizaciones', id: 'listarMisCotizaciones', tag: 'Panel', s: 'Listar mis cotizaciones', d: 'Solo las consultas del asesor (R41). `contacto_disponible` y `codigo_referencia` están solo en este listado.',
  seg: [SEG.panel], panel: true, params: ['cursor', 'limite', 'oficio', 'desde', 'hasta'], ok: [200, 'ListadoCotizaciones', [E.listadoCot(0), E.listadoCot(1), E.listadoCot(3, true), E.listadoCot(6, true), E.listadoCot(10), E.listadoCot(12, true)]],
});
op({
  m: 'get', p: '/v1/panel/cotizaciones/{sesion_id}', id: 'leerMiCotizacion', tag: 'Panel', s: 'Ver el detalle de una consulta', d: 'SesionDetalle sin código de referencia ni derivación (T39). Deja fila en Registros (R69). De otro asesor u otro tenant: 404.',
  seg: [SEG.panel], panel: true, params: ['sesion_id'], ok: [200, 'SesionDetalle', E.OFICIOS.flatMap((o, a) => E.ZONAS.map((z, b) => E.sesionDetalle(o, z, a * 5 + b)))], recurso: 'sesion_panel',
});
op({
  m: 'get', p: '/v1/panel/cotizaciones/{sesion_id}/contacto', id: 'leerContactoCliente', tag: 'Panel', s: 'Ver el contacto que dejó el cliente', d: 'Solo si `contacto_disponible`. Cada lectura queda registrada; hay límite diario con alerta (R68, R69).',
  seg: [SEG.panel], panel: true, params: ['sesion_id'], ok: [200, 'ContactoCliente', range(4).map(E.contactoCliente)], extra: { 429: ['limite_lecturas_contacto'] }, recurso: 'sesion_panel',
});
op({ m: 'get', p: '/v1/panel/registros', id: 'listarRegistros', tag: 'Panel', s: 'Listar mis registros de lecturas', d: 'Registro solo-anexar (R69).', seg: [SEG.panel], panel: true, params: ['cursor', 'limite'], ok: [200, 'ListadoRegistros', [E.listadoReg(0), E.listadoReg(2), E.listadoReg(8, true), E.listadoReg(5)]] });
op({ m: 'get', p: '/v1/panel/consumo', id: 'leerConsumoPanel', tag: 'Panel', s: 'Ver mi consumo', d: 'Contador del asesor (ambito asesor) con detalle diario y `alerta_tenant` (nivel de alerta del tenant, sin cifras). Sin costos (R52). La vista del tenant completo para administradores en el panel queda para una versión posterior: hoy se lee con leerConsumo (clave secreta).', seg: [SEG.panel], panel: true, params: ['periodo'], ok: [200, 'Consumo', range(6).map((k) => E.consumo(k, 'asesor'))] });
op({ m: 'get', p: '/v1/panel/enlace', id: 'leerEnlaceCompartir', tag: 'Panel', s: 'Ver mi enlace para compartir', d: 'Enlace opaco y texto listo para compartir.', seg: [SEG.panel], panel: true, ok: [200, 'EnlaceCompartir', range(2).map(E.enlaceCompartir)] });
op({ m: 'post', p: '/v1/panel/enlace/rotacion', id: 'rotarEnlace', tag: 'Panel', s: 'Rotar mi enlace', d: 'El enlace viejo deja de funcionar (404, R62). Requiere reautenticación.', seg: [SEG.panelEsc], panel: true, sensible: true, ok: [200, 'EnlaceCompartir', [E.enlaceCompartir(1), E.enlaceCompartir(3)]] });
op({ m: 'get', p: '/v1/panel/claves-widget', id: 'listarClavesWidget', tag: 'Panel', s: 'Listar claves públicas del widget', d: 'Solo administradores del tenant. Nunca devuelve el valor completo.', seg: [SEG.panel], panel: true, admin: true, ok: [200, 'ListadoClavesWidget', [{ items: [] }, { items: [E.claveWidget(0), E.claveWidget(1, 'revocada')] }, { items: [E.claveWidget(2)] }]] });
op({
  m: 'post', p: '/v1/panel/claves-widget', id: 'crearClaveWidget', tag: 'Panel', s: 'Crear una clave pública del widget', d: 'El valor se muestra una sola vez (T37). Origin exactos, https, sin comodines (R55). Requiere reautenticación.',
  seg: [SEG.panelEsc], panel: true, admin: true, sensible: true, body: ['ClaveWidgetSolicitud', range(4).map(E.claveWidgetSol)], ok: [201, 'ClaveWidgetCreada', range(3).map(E.claveWidgetCreada)],
});
op({ m: 'delete', p: '/v1/panel/claves-widget/{clave_id}', id: 'revocarClaveWidget', tag: 'Panel', s: 'Revocar una clave pública', d: 'Efecto en ≤60 s. Requiere reautenticación.', seg: [SEG.panelEsc], panel: true, admin: true, sensible: true, params: ['clave_id'], ok: [204], recurso: 'clave' });
op({ m: 'post', p: '/v1/panel/mi-cuenta/exportacion', id: 'exportarMiCuenta', tag: 'Panel', s: 'Exportar mis datos', d: 'Derecho de acceso del asesor (R49). Requiere reautenticación; queda registrado.', seg: [SEG.panelEsc], panel: true, sensible: true, ok: [200, 'ExportacionMiCuenta', range(3).map(E.exportacion)] });

// ---------------- CORS del widget (B6) ----------------
// Encabezados que el widget puede mandar. Nunca Cookie ni X-CSRF-Token (el panel es del mismo origen, sin CORS).
export const CORS_ENCABEZADOS = ['Authorization', 'Content-Type', 'X-VC-Clave-Publica', 'X-Desafio', 'Idempotency-Key'];
const camel = (ruta) =>
  ruta
    .replace('/v1/', '')
    .split(/[/-]/)
    .filter((x) => x && !x.startsWith('{'))
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('');
{
  const porRuta = {};
  for (const o of operaciones.filter((x) => x.cors)) (porRuta[o.p] = porRuta[o.p] || []).push(o.m.toUpperCase());
  for (const [ruta, metodos] of Object.entries(porRuta)) {
    const conId = ruta.includes('{sesion_id}') ? ['sesion_id'] : ruta.includes('{id_publico}') ? ['id_publico'] : [];
    op({
      m: 'options', p: ruta, id: `preflight${camel(ruta)}${conId.length ? 'PorId' : ''}`, tag: 'Widget', s: `Preflight CORS de ${ruta}`,
      d: `Preflight CORS del widget (B6, R55). Sin credenciales: solo cuenta para el límite por IP (paso 1). Si el \`Origin\` está registrado en alguna clave pública activa (de cualquier tenant), \`Access-Control-Request-Method\` es ${metodos.join(' o ')} y los encabezados pedidos están en {${CORS_ENCABEZADOS.join(', ')}}, responde 204 con \`Access-Control-Allow-Origin\` igual al Origin (nunca \`*\`), métodos, encabezados, \`Max-Age: 600\` y \`Vary\`. Si no, responde 204 SIN encabezados \`Access-Control-Allow-*\` (el navegador bloquea) y sin cuerpo: misma respuesta para Origin ajeno, ausente o no registrado. Sin \`Access-Control-Allow-Credentials\`.`,
      seg: [], params: conId, preflight: { metodos, encabezados: CORS_ENCABEZADOS }, ok: [204],
    });
  }
}

// ---------------- Errores automáticos por operación ----------------
export function erroresDe(o) {
  const e = {};
  const add = (st, ...c) => (e[st] = [...new Set([...(e[st] || []), ...c])]);
  const tipos = new Set(o.seg.flat());
  add(500, 'error_interno');
  add(429, 'limite_de_tasa');
  if (o.seg.length) {
    if (o.panel) add(401, 'credencial_ausente', 'sesion_vencida');
    else add(401, 'credencial_ausente', 'credencial_invalida');
    if (!o.panel) add(403, 'alcance_insuficiente');
    if (tipos.has('claveSecreta')) add(403, 'clave_secreta_desde_navegador');
    if (tipos.has('clavePublica')) add(403, 'origen_no_permitido');
    if (tipos.has('desafio')) add(403, 'desafio_invalido');
    if (tipos.has('csrf')) add(403, 'csrf_invalido', 'origen_no_permitido');
    if (o.admin) add(403, 'alcance_insuficiente');
    if (o.sensible) add(401, 'reautenticacion_requerida');
  }
  if (o.body) {
    add(400, 'solicitud_invalida');
    add(413, 'cuerpo_demasiado_grande');
    add(415, 'tipo_de_contenido_no_soportado');
    add(422, 'validacion_fallida');
  }
  if ((o.params || []).some((p) => P[p].in === 'query')) add(400, 'solicitud_invalida');
  if (!o.preflight && (o.params || []).some((p) => P[p].in === 'path')) add(404, 'no_encontrado');
  for (const [st, cs] of Object.entries(o.extra || {})) add(Number(st), ...cs);
  return e;
}

const DESC_HTTP = { 200: 'OK', 201: 'Creado', 202: 'Aceptado', 204: 'Sin contenido', 400: 'Solicitud inválida', 401: 'No autenticado (ver `codigo`)', 403: 'Prohibido (ver `codigo`)', 404: 'No encontrado (idéntico para inexistente y ajeno)', 409: 'Conflicto de estado', 410: 'Versión retirada', 413: 'Pedido demasiado grande', 415: 'Tipo no soportado', 422: 'Datos inválidos', 429: 'Límite o cupo (ver `codigo`)', 500: 'Error interno', 503: 'No disponible' };

export function construir() {
  const paths = {};
  for (const o of operaciones) {
    const op = {
      operationId: o.id,
      tags: [o.tag],
      summary: o.s,
      description: o.d,
      security: sec(...o.seg),
      'x-vc-panel': !!o.panel,
      ...(o.sensible ? { 'x-vc-reautenticacion': true } : {}),
      ...(o.admin ? { 'x-vc-rol': 'administrador' } : {}),
      ...(o.recurso ? { 'x-vc-recurso': o.recurso } : {}),
      ...(o.cupo ? { 'x-vc-cupo': true } : {}),
      ...(o.login ? { 'x-vc-login': o.login } : {}),
      ...(o.cors ? { 'x-vc-cors': true } : {}),
      ...(o.preflight ? { 'x-vc-preflight': o.preflight } : {}),
    };
    if (o.params) op.parameters = o.params.map((p) => ({ $ref: `#/components/parameters/${p}` }));
    if (o.body) op.requestBody = { required: true, content: { 'application/json': { schema: R(o.body[0]), examples: exs(o.body[1], 'pedido') } } };
    const responses = {};
    const [st, esq, lista] = o.ok;
    if (o.preflight) responses[204] = { description: 'Preflight respondido. Los encabezados Access-Control-Allow-* solo van si Origin, método y encabezados están permitidos.', headers: Object.fromEntries(['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers', 'Access-Control-Max-Age', 'Vary'].map((h) => [h, { $ref: `#/components/headers/${h.replaceAll('-', '')}` }])) };
    else if (st === 204) responses[204] = { description: DESC_HTTP[204] };
    else responses[st] = { description: DESC_HTTP[st], content: { 'application/json': { schema: R(esq), examples: exs(lista, 'respuesta') } } };
    if (o.setCookie) responses[st].headers = { 'Set-Cookie': { $ref: '#/components/headers/SetCookiePanel' } };
    const errs = erroresDe(o);
    for (const s of Object.keys(errs).sort()) {
      const r = { description: DESC_HTTP[s], content: { 'application/problem+json': { schema: R('Error'), examples: Object.fromEntries(errs[s].map((c, k) => [c, { summary: catalogo[c][1], value: E.error(c, `${o.id}-${k}`) }])) } } };
      if (Number(s) === 429 || Number(s) === 503) r.headers = { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } };
      responses[s] = r;
    }
    if (o.cors) {
      for (const [s, r] of Object.entries(responses)) {
        r.headers = { ...(r.headers || {}), 'Access-Control-Allow-Origin': { $ref: '#/components/headers/AccessControlAllowOrigin' }, Vary: { $ref: '#/components/headers/Vary' } };
        if (Number(s) === 429 || Number(s) === 503) r.headers['Access-Control-Expose-Headers'] = { $ref: '#/components/headers/AccessControlExposeHeaders' };
      }
    }
    op.responses = responses;
    paths[o.p] = paths[o.p] || {};
    paths[o.p][o.m] = op;
  }
  return paths;
}

export const parametros = P;
export const cookieEjemplo = COOKIE;
