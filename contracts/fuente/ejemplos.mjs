// Fábricas de ejemplos válidos. Los montos son ILUSTRATIVOS (no son tarifas): las tarifas viven en tarifas/.
import { id, idEnlace, codigoRef, traza, fh, fecha, b64u, hex, VERSION } from './base.mjs';
import { catalogo } from './catalogo.mjs';

export const OFICIOS = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
export const ZONAS = ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago', 'otra'];
export const ZONAS_AT = ZONAS.slice(0, 4);
export const MOTIVOS = ['completada', 'cliente_cerro', 'sin_voz', 'sin_camara', 'sin_consentimiento', 'duracion_maxima', 'cuota_agotada', 'desafio_invalido', 'error_proveedor', 'error_interno'];
const NOMBRES_ZONA = { mar_chiquita: 'Mar Chiquita', cobo: 'Cobo', santa_clara: 'Santa Clara del Mar', parque_lago: 'Parque Lago', otra: 'fuera de zona' };
export const DOMINIO = 'videocotizacion.local';
const WA_PROF = ['5492235550101', '5492235550102', '5492235550103'];

const TAREAS = {
  pintura: [
    ['pintura_interior', 'm2', 'Pintura interior látex, dos manos', 1850],
    ['preparacion_superficie', 'm2', 'Lijado y enduido de paredes', 900],
    ['pintura_exterior', 'm2', 'Pintura exterior acrílica', 2400],
  ],
  jardineria: [
    ['corte_cesped', 'm2', 'Corte de césped y bordeado', 300],
    ['poda', 'unidad', 'Poda de árbol mediano', 45000],
    ['desmalezado', 'm2', 'Desmalezado de terreno', 500],
  ],
  reparaciones: [['reparacion_general', 'hora', 'Reparación general por hora', 12000]],
  mantenimiento: [['visita_mantenimiento', 'visita', 'Visita de mantenimiento', 30000]],
  limpieza: [
    ['limpieza_final_obra', 'm2', 'Limpieza final de obra', 1100],
    ['limpieza_terreno', 'm2', 'Limpieza de terreno', 400],
  ],
};

export const importe = (cant, pu) => Math.floor((cant * pu + 50) / 100);

export function item(oficio, k, i) {
  const t = TAREAS[oficio][k % TAREAS[oficio].length];
  const cantidad = t[1] === 'm2' ? 1250 + 375 * i : t[1] === 'unidad' ? 100 * (1 + (i % 3)) : 100 * (1 + (i % 4));
  const pu = t[3] * 100 + 7 * i; // centavos
  return { tipo: 'mano_de_obra', codigo_tarea: t[0], descripcion: t[2], unidad: t[1], cantidad_centesimas: cantidad, precio_unitario_centavos: pu, importe_centavos: importe(cantidad, pu) };
}

export function cotizacion(oficio, zona, i = 0) {
  const n = Math.min(TAREAS[oficio].length, 1 + (i % 3));
  const items = Array.from({ length: n }, (_, k) => item(oficio, k, i + k));
  if (zona === 'otra') {
    const pu = 1500000 + i;
    items.push({ tipo: 'traslado', codigo_tarea: 'traslado_fuera_de_zona', descripcion: 'Traslado fuera de zona (a confirmar por el asesor)', unidad: 'global', cantidad_centesimas: 100, precio_unitario_centavos: pu, importe_centavos: importe(100, pu) });
  }
  return {
    cotizacion_id: id('cot', `${oficio}-${zona}-${i}`),
    sesion_id: id('ses', `${oficio}-${zona}-${i}`),
    emitida_en: fh(20 + i),
    moneda: 'ARS',
    oficio,
    zona,
    fuera_de_zona: zona === 'otra',
    items,
    total_centavos: items.reduce((a, it) => a + it.importe_centavos, 0),
    orientativa: true,
    leyenda: zona === 'otra' ? 'Presupuesto orientativo fuera de zona: el profesional confirma traslado y precio final.' : 'Presupuesto orientativo: el profesional lo confirma al ver el trabajo.',
    tarifas: { version: '2026.1', estado: 'referencia_publica_sin_validar' },
    validez_dias: 15,
  };
}

export function derivacion(i = 0) {
  const codigo = codigoRef(i);
  const texto = `Hola, quiero seguir con mi videocotización ${codigo}`;
  return { codigo_referencia: codigo, url_wa_me: `https://wa.me/${WA_PROF[i % 3]}?text=${encodeURIComponent(texto)}`, texto_prellenado: texto, generada_en: fh(25 + i) };
}

export const reglaFotograma = () => ({ formato: 'image/jpeg', lado_max_px: 1024, bytes_max: 131072, intervalo_min_ms: 3000, max_por_sesion: 400 });
export const limites = (i = 0) => ({ sin_voz_s: [20, 30, 45][i % 3], duracion_maxima_s: [900, 1200, 1800][i % 3], caracteres_max_por_turno: 500, turnos_llm_max: 60, fotograma: reglaFotograma() });
export const avatar = (i = 0) =>
  [
    { avatar_id: 'av_obrero_casco', nombre: 'Juan', modos: ['3d', 'clips'], descripcion_accesible: 'Trabajador con casco amarillo y ropa de obra' },
    { avatar_id: 'av_pintora', nombre: 'Laura', modos: ['3d'], descripcion_accesible: 'Pintora con overol blanco' },
    { avatar_id: 'av_jardinero', nombre: 'Tito', modos: ['clips'], descripcion_accesible: 'Jardinero con gorra y guantes' },
  ][i % 3];

export const enlacePublico = (i = 0) => ({
  id_publico: idEnlace(i),
  profesional: { nombre_visible: ['Juan P.', 'Laura G.', 'Tito R.'][i % 3], oficios: [OFICIOS[i % 5], ...(i % 2 ? [OFICIOS[(i + 1) % 5]] : [])], zonas: ZONAS_AT.slice(0, 1 + (i % 4)) },
  avatares: [avatar(i), ...(i % 2 ? [avatar(i + 1)] : [])],
  aviso_privacidad: { version: '2026-10-08.1', url: `https://cotizar.${DOMINIO}/privacidad/2026-10-08.1` },
  camara_obligatoria: true,
  fotograma: reglaFotograma(),
  asistente_automatico: true,
});

export const desafio = (i = 0) => ({ desafio: `dsf_${b64u('dsf' + i, 43)}`, mecanismo: 'prueba_de_trabajo_sha256', dificultad_bits: 16 + (i % 4), vence_en: fh(2), vence_en_s: 120, provisorio: true });
export const headerDesafio = (i = 0) => `dsf_${b64u('dsf' + i, 43)}.${hex('nonce' + i, 16)}`;

export const crearSesionSol = (i = 0) => {
  const o = { enlace: idEnlace(i), modo_avatar: i % 2 ? 'clips' : '3d' };
  if (i % 3 === 0) o.avatar_id = avatar(i).avatar_id;
  if (i % 4 === 1) o.idioma = 'es-AR';
  if (i % 5 === 2) o.referencia_externa = `campania-2026.${i}`;
  return o;
};
export const sesionCreada = (i = 0) => ({
  sesion_id: id('ses', i),
  estado: 'creada',
  token_sesion: { valor: `vc_ses_${b64u('ses-token' + i, 43)}`, vence_en: fh(60) },
  consentimiento: { requerido: true, aviso_version: '2026-10-08.1', aviso_url: `https://cotizar.${DOMINIO}/privacidad/2026-10-08.1` },
  limites: limites(i),
  creada_en: fh(0),
});
export function sesion(i = 0, estado = 'creada') {
  const s = { sesion_id: id('ses', i), estado, modo_avatar: i % 2 ? 'clips' : '3d', creada_en: fh(0), duracion_s: 0 };
  if (estado !== 'creada') s.consentida_en = fh(1);
  if (estado === 'en_curso') s.duracion_s = 120 + i;
  if (estado === 'cerrada') {
    const m = MOTIVOS[i % MOTIVOS.length];
    Object.assign(s, { cerrada_en: fh(15), motivo_cierre: m, duracion_s: 600 + i });
    if (m === 'completada') s.cotizacion_id = id('cot', i);
  }
  return s;
}
export const consentimientoSol = (i = 0) => ({ aviso_version: ['2026-10-08.1', '2026-10-01.2'][i % 2], acepta_camara_y_microfono: true, acepta_tratamiento: true, declara_mayor_de_18: true, informado_asistente_automatico: true });
export const consentimientoReg = (i = 0) => ({ consentimiento_id: id('cns', i), sesion_id: id('ses', i), aviso_version: '2026-10-08.1', registrado_en: fh(1), estado_sesion: 'consentida' });
export const tokenMedios = (i = 0) => ({
  token: `vc_med_${b64u('med' + i, 43)}`,
  ws_url: `wss://api.${DOMINIO}/v1/sesiones/${id('ses', i)}/medios`,
  vence_en: fh(2),
  vence_en_s: 30,
  un_solo_uso: true,
  protocolo_eventos: 'vc-eventos.borrador.1',
});
export const cierreSol = (i = 0) => ({ motivo: ['cliente_cerro', 'sin_consentimiento', 'sin_camara'][i % 3] });
export function cierre(i = 0) {
  const motivo = MOTIVOS[i % MOTIVOS.length];
  const c = { sesion_id: id('ses', i), estado: 'cerrada', motivo_cierre: motivo, cerrada_en: fh(15), duracion_s: motivo === 'sin_consentimiento' || motivo === 'sin_camara' ? 0 : 300 + i };
  if (motivo === 'completada') c.cotizacion_id = id('cot', i);
  if (['completada', 'sin_consentimiento', 'sin_camara', 'cuota_agotada'].includes(motivo)) c.derivacion = derivacion(i);
  return c;
}
export function contactoSol(i = 0) {
  const c = { nombre: ['Marta', 'Carlos', 'Ana López'][i % 3], consentimiento: { aviso_version: '2026-10-08.1', acepta_ser_contactado: true, finalidad: 'que_el_profesional_te_contacte' } };
  if (i % 3 !== 2) c.telefono = `+549223555${String(1000 + i).slice(-4)}`;
  if (i % 3 !== 0) c.email = `cliente${i}@correo.local`;
  if (i % 2) c.preferencia = ['whatsapp', 'llamada', 'email'][i % 3];
  return c;
}
export const contactoReg = (i = 0) => ({ sesion_id: id('ses', i), registrado_en: fh(16), aviso_version: '2026-10-08.1', retencion_dias: 90 });
export function arcoSol(i = 0) {
  const s = { tipo: ['acceso', 'rectificacion', 'supresion'][i % 3], codigo_referencia: codigoRef(i), verificacion: i % 2 ? { email: `cliente${i}@correo.local` } : { telefono: `+549223555${String(2000 + i).slice(-4)}` } };
  if (i % 3 === 1) s.detalle = 'El metraje anotado era 40 m², no 60 m².';
  return s;
}
export const arcoRec = (i = 0) => ({ solicitud_id: id('arc', i), estado: 'recibida', recibida_en: fh(30), plazo_vence_en: fh(30 + 10 * 1440), mensaje: 'Recibimos tu solicitud. Si los datos coinciden, te respondemos dentro del plazo legal.' });
export const consumoDiario = (d) => ({ fecha: fecha(-d), segundos: 1800 + 37 * d, sesiones: 3 + (d % 5), cotizaciones_emitidas: 2 + (d % 3) });
export function consumo(i = 0, ambito = 'tenant') {
  const usados = [0, 15000, 24000, 30000][i % 4];
  const p = usados / 30000;
  return {
    ambito,
    periodo: '2026-10',
    segundos_usados: usados,
    segundos_tope: 30000,
    simultaneas_en_curso: i % 6,
    simultaneas_tope: 5,
    alerta: p >= 1 ? 'p100' : p >= 0.8 ? 'p80' : p >= 0.5 ? 'p50' : 'ninguna',
    diario: Array.from({ length: i % 8 }, (_, d) => consumoDiario(d)),
    actualizado_en: fh(5),
  };
}
export const retencion = () => ({
  version: '2026-10-08.1',
  a_validar_con_abogado: true,
  reglas: [
    { tipo_dato: 'consulta_y_presupuesto', finalidad: 'Backoffice y seguimiento del presupuesto', persistido: true, plazo_dias: 365, configurable: true },
    { tipo_dato: 'contacto_cliente', finalidad: 'Que el profesional te contacte', persistido: true, plazo_dias: 90, configurable: true },
    { tipo_dato: 'registro_lecturas', finalidad: 'Trazabilidad de accesos', persistido: true, plazo_dias: 730, configurable: true },
    { tipo_dato: 'consentimientos', finalidad: 'Prueba del consentimiento', persistido: true, plazo_dias: 730, configurable: true },
    { tipo_dato: 'solicitudes_arco', finalidad: 'Constancia de derechos ARCO (anonimizada)', persistido: true, plazo_dias: 730, configurable: true },
    { tipo_dato: 'perfil_asesor', finalidad: 'Operar el panel', persistido: true, plazo_dias: 365, configurable: true },
    { tipo_dato: 'fotogramas', finalidad: 'Extraer datos del trabajo en memoria', persistido: false, plazo_dias: 0, configurable: false },
    { tipo_dato: 'audio', finalidad: 'Transcripción en memoria', persistido: false, plazo_dias: 0, configurable: false },
    { tipo_dato: 'transcripcion_completa', finalidad: 'No se guarda (ADR 0004)', persistido: false, plazo_dias: 0, configurable: false },
  ],
});
export const aviso = (i = 0) => ({
  version: ['2026-10-08.1', '2026-10-01.2'][i % 2],
  vigente_desde: ['2026-10-08', '2026-10-01'][i % 2],
  url: `https://cotizar.${DOMINIO}/privacidad/${['2026-10-08.1', '2026-10-01.2'][i % 2]}`,
  resumen: 'Usamos tu imagen y tu voz solo durante la llamada para cotizar el trabajo; no guardamos fotogramas ni audio.',
  incisos: ['finalidad', 'destinatarios', 'responsable', 'obligatoriedad', 'consecuencias', 'derechos_arco', 'transferencia_internacional', 'autoridad_de_control'],
  a_validar_con_abogado: true,
});

export function textos() {
  const t = { 'widget.boton_iniciar': 'Iniciar VideoCotización', 'widget.asistente_automatico': 'Te atiende un asistente automático.', 'widget.presupuesto_orientativo': 'Presupuesto orientativo: lo confirma el profesional.', 'panel.menu.perfil': 'Perfil', 'panel.menu.mis_cotizaciones': 'Mis cotizaciones', 'panel.menu.registros': 'Registros', 'panel.contacto_disponible': 'Dejó contacto' };
  for (const [c, v] of Object.entries(catalogo)) t[`error.${c}`] = v[2];
  const etiquetasMotivo = { completada: 'Completada', cliente_cerro: 'El cliente cortó', sin_voz: 'Cortada por silencio', sin_camara: 'Sin cámara', sin_consentimiento: 'Sin consentimiento', duracion_maxima: 'Duración máxima', cuota_agotada: 'Cupo agotado', desafio_invalido: 'Verificación fallida', error_proveedor: 'Falla de un servicio externo', error_interno: 'Error interno' };
  for (const m of MOTIVOS) t[`motivo.${m}`] = etiquetasMotivo[m];
  for (const o of OFICIOS) t[`oficio.${o}`] = { pintura: 'Pintura', jardineria: 'Jardinería', reparaciones: 'Reparaciones', mantenimiento: 'Mantenimiento', limpieza: 'Limpieza' }[o];
  for (const z of ZONAS) t[`zona.${z}`] = NOMBRES_ZONA[z];
  return { version: '1.3.0', idioma: 'es-AR', textos: t };
}
export const version = () => ({ api: VERSION, estado_api: 'borrador', eventos_sesion: { version: 'vc-eventos.borrador.1', estado: 'borrador' }, deprecaciones: [] });

export function datosExtraidos(oficio, zona, i = 0) {
  const d = { oficio, zona, fuera_de_zona: zona === 'otra', faltantes: i % 4 === 3 ? ['altura'] : [], corregido_por_cliente: i % 3 === 1 };
  d.tarea = TAREAS[oficio][0][0];
  if (TAREAS[oficio][0][1] === 'm2') d.superficie_centesimas_m2 = 1250 + 375 * i;
  else d.cantidad_unidades = 1 + (i % 3);
  if (oficio === 'pintura') Object.assign(d, { interior_exterior: ['interior', 'exterior', 'ambos'][i % 3], altura: ['planta_baja', 'hasta_3m', 'entre_3_y_6m', 'mas_de_6m'][i % 4], estado_superficie: ['bueno', 'regular', 'con_humedad'][i % 3] });
  d.urgencia = ['baja', 'media', 'alta'][i % 3];
  d.plazo = ['inmediato', 'esta_semana', 'este_mes', 'flexible'][i % 4];
  if (i % 2) d.observaciones = 'El cliente mostró manchas de humedad en la pared norte.';
  return d;
}
export function sesionDetalle(oficio, zona, i = 0) {
  const emitida = i % 5 !== 4;
  const d = {
    sesion_id: id('ses', `${oficio}-${zona}-${i}`),
    estado: 'cerrada',
    modo_avatar: i % 2 ? 'clips' : '3d',
    creada_en: fh(0),
    cerrada_en: fh(14),
    motivo_cierre: emitida ? 'completada' : 'sin_voz',
    duracion_s: 780 + i,
    datos_extraidos: datosExtraidos(oficio, zona, i),
    resumen: `Consulta de ${oficio} en ${NOMBRES_ZONA[zona]}${zona === 'otra' ? ' (fuera de zona, se emitió igual)' : ''}.`,
    versiones: { tarifas: '2026.1', prompt: `conducta_${oficio}@${hex('prompt' + oficio, 12)}`, esquema_salida: '1.0.0' },
  };
  if (emitida) d.cotizacion = cotizacion(oficio, zona, i);
  return d;
}
export function resumenCot(i = 0) {
  const oficio = OFICIOS[i % 5];
  const zona = ZONAS[(i * 2) % 5];
  const r = { sesion_id: id('ses', `${oficio}-${zona}-${i}`), creada_en: fh(-i * 90), estado: 'cerrada', motivo_cierre: i % 6 === 5 ? 'sin_voz' : 'completada', oficio, zona, fuera_de_zona: zona === 'otra', contacto_disponible: i % 2 === 0, resumen: `${oficio} en ${NOMBRES_ZONA[zona]}` };
  if (r.motivo_cierre === 'completada') {
    const c = cotizacion(oficio, zona, i);
    r.total = { cotizacion_id: c.cotizacion_id, total_centavos: c.total_centavos, moneda: 'ARS' };
    r.codigo_referencia = codigoRef(i);
  }
  return r;
}
export const listadoCot = (n, cursor) => ({ items: Array.from({ length: n }, (_, k) => resumenCot(k)), ...(cursor ? { siguiente_cursor: b64u('cursor' + n, 24) } : {}) });
export const contactoCliente = (i = 0) => {
  const c = contactoSol(i);
  const o = { sesion_id: id('ses', i), nombre: c.nombre, consentido_en: fh(16), aviso_version: '2026-10-08.1', lectura: { registro_id: id('reg', 'c' + i), lecturas_restantes_hoy: 20 - (i % 20) } };
  if (c.telefono) o.telefono = c.telefono;
  if (c.email) o.email = c.email;
  if (c.preferencia) o.preferencia = c.preferencia;
  return o;
};
const ACCIONES = ['ver_detalle', 'ver_contacto', 'exportar_mi_cuenta', 'rotar_enlace', 'crear_clave_widget', 'revocar_clave_widget', 'inicio_sesion', 'cambio_contrasena'];
export function registro(i = 0) {
  const a = ACCIONES[i % ACCIONES.length];
  const r = { registro_id: id('reg', i), ocurrido_en: fh(-i * 7), asesor_id: id('ase', i % 2), accion: a };
  if (a === 'ver_detalle' || a === 'ver_contacto') r.recurso_id = id('ses', i);
  if (a.endsWith('clave_widget')) r.recurso_id = id('cpw', i);
  return r;
}
export const listadoReg = (n, cursor) => ({ items: Array.from({ length: n }, (_, k) => registro(k)), ...(cursor ? { siguiente_cursor: b64u('rcursor' + n, 24) } : {}) });
export const loginSol = (i = 0) => ({ email: ['juan@asesores.local', 'laura@asesores.local'][i % 2], contrasena: 'una-frase-larga-de-prueba-' + i });
export const loginPaso = (i = 0) => ({ paso: 'totp', csrf_token: b64u('csrf-pre' + i, 43), vence_en: fh(5) });
export const totpSol = (i = 0) => (i % 3 === 2 ? { codigo_recuperacion: 'AB12-CD34-EF56' } : { codigo: String(123456 + i * 111).slice(0, 6) });
export const sesionPanel = (i = 0) => {
  const s = { asesor: { asesor_id: id('ase', i), nombre_visible: ['Juan P.', 'Laura G.'][i % 2], rol: i % 2 ? 'administrador' : 'asesor' }, csrf_token: b64u('csrf' + i, 43), vence_inactividad_en: fh(30), vence_absoluto_en: fh(720) };
  if (i % 2) s.reautenticado_hasta = fh(5);
  return s;
};
export const reauthSol = (i = 0) => ({ contrasena: 'una-frase-larga-de-prueba-' + i, codigo_totp: String(654321 - i * 7).slice(0, 6) });
export const reauthOk = () => ({ valida_hasta: fh(5), valida_s: 300 });
export const perfil = (i = 0) => ({
  asesor_id: id('ase', i),
  rol: i % 2 ? 'administrador' : 'asesor',
  nombre_visible: ['Juan P.', 'Laura G.', 'Tito R.'][i % 3],
  email: ['juan@asesores.local', 'laura@asesores.local', 'tito@asesores.local'][i % 3],
  whatsapp: '+' + WA_PROF[i % 3],
  oficios: [OFICIOS[i % 5]],
  zonas: ZONAS_AT.slice(0, 1 + (i % 4)),
  totp_activo: true,
  consentimiento_asesor: { version: '2026-10-08.1', aceptado_en: fh(-10000) },
  creado_en: fh(-10000),
});
export const perfilAct = (i = 0) => [{ nombre_visible: 'Juan Pérez' }, { whatsapp: '+5492235550199' }, { oficios: ['pintura', 'jardineria'] }, { zonas: ['cobo', 'parque_lago'] }, { nombre_visible: 'Laura', zonas: ['mar_chiquita'] }][i % 5];
export const cambioPass = (i = 0) => ({ contrasena_nueva: 'otra-frase-bien-larga-' + i });
export const claveWidget = (i = 0, estado = 'activa') => {
  const c = { clave_id: id('cpw', i), nombre: ['Sitio principal', 'Landing jardinería', 'Pruebas'][i % 3], prefijo: `vc_pub_${b64u('pub' + i, 6)}`, origins: [`https://cotizar.${DOMINIO}`, ...(i % 2 ? [`https://www.${DOMINIO}`] : [])], estado, creada_en: fh(-5000 - i) };
  if (estado === 'revocada') c.revocada_en = fh(-10);
  if (i % 2) c.ultimo_uso_en = fh(-60);
  return c;
};
export const claveWidgetSol = (i = 0) => ({ nombre: ['Sitio principal', 'Landing jardinería', 'Pruebas'][i % 3], origins: [`https://cotizar.${DOMINIO}`, ...(i % 2 ? ['https://socio.ejemplo.local:8443'] : [])] });
export const claveWidgetCreada = (i = 0) => {
  const valor = `vc_pub_${b64u('pub' + i, 6)}${b64u('pubresto' + i, 34)}`;
  return { clave: claveWidget(i), valor, se_muestra_una_sola_vez: true };
};
export const enlaceCompartir = (i = 0) => {
  const e = { id_publico: idEnlace(i), url: `https://cotizar.${DOMINIO}/c/${idEnlace(i)}`, texto_compartir: `Pedí tu presupuesto por videollamada: https://cotizar.${DOMINIO}/c/${idEnlace(i)}` };
  if (i % 2) e.rotado_en = fh(-30);
  return e;
};
export const exportacion = (i = 0) => ({ formato_version: '1', generada_en: fh(3), perfil: perfil(i), lecturas: Array.from({ length: 2 + i }, (_, k) => registro(k)), consumo: consumo(i, 'asesor') });

export function error(codigo, i = 0, extra = {}) {
  const [status, title, msg] = catalogo[codigo];
  const e = { type: `https://${DOMINIO}/errores/${codigo}`, title, status, codigo, detail: msg, id_traza: traza(`${codigo}-${i}`), ...extra };
  if (status === 429 && !e.reintentar_en_s) e.reintentar_en_s = codigo === 'cuota_agotada' ? 3600 : 30;
  if (codigo === 'validacion_fallida' && !e.errores) e.errores = [{ campo: '/modo_avatar', problema: 'Debe ser uno de: 3d, clips' }];
  return e;
}

// ---- Eventos (borrador) ----
const env = (tipo, datos, seq = 0) => ({ v: 1, tipo, seq, ts: fh(1), datos });
export const eventos = {
  'sesion.autenticar': (i) => env('sesion.autenticar', { token_medios: tokenMedios(i).token }, 0),
  'texto.enviar': (i) => env('texto.enviar', { texto: ['Son dos ambientes de 4 por 3', 'La pared tiene humedad', 'Estoy en Cobo'][i % 3] }, i + 1),
  'pizarron.corregir': (i) => env('pizarron.corregir', { version_base: 3 + i, clave: 'superficie_m2', valor: `${40 + i} m²` }, i + 2),
  'sesion.cerrar': (i) => env('sesion.cerrar', { motivo: 'cliente_cerro' }, 10 + i),
  'sesion.lista': (i) => env('sesion.lista', { sesion_id: id('ses', i), limites: limites(i) }, 0),
  'transcripcion.parcial': (i) => env('transcripcion.parcial', { turno: 1 + i, texto: 'Quiero pintar el liv' }, 1 + i),
  'transcripcion.final': (i) => env('transcripcion.final', { turno: 1 + i, texto: 'Quiero pintar el living y el comedor.' }, 2 + i),
  'avatar.respuesta': (i) => env('avatar.respuesta', { turno: 1 + i, texto: '¿Me mostrás la pared con la cámara?', ...(i % 2 ? { clip_id: 'clip_pedir_ver' } : {}) }, 3 + i),
  'avatar.visemas': (i) => env('avatar.visemas', { turno: 1 + i, items: [{ v: 'sil', t_ms: 0, d_ms: 80 }, { v: 'PP', t_ms: 80, d_ms: 60 }, { v: 'aa', t_ms: 140, d_ms: 120 }, { v: 'E', t_ms: 260, d_ms: 90 }] }, 4 + i),
  'pizarron.actualizado': (i) => env('pizarron.actualizado', { version: 1 + i, campos: [{ clave: 'oficio', etiqueta: 'Oficio', valor: 'Pintura', estado: 'anotado' }, { clave: 'superficie_m2', etiqueta: 'Superficie', valor: '40 m²', estado: i % 2 ? 'corregido_por_cliente' : 'anotado' }, { clave: 'altura', etiqueta: 'Altura', valor: 'Falta', estado: 'faltante' }] }, 5 + i),
  'camara.fotograma': (i) => env('camara.fotograma', i % 2 ? { seq_fotograma: i, resultado: 'descartado', motivo: ['frecuencia', 'tamano', 'dimensiones', 'formato', 'tope_sesion'][i % 5] } : { seq_fotograma: i, resultado: 'aceptado' }, 6 + i),
  'sesion.aviso': (i) => env('sesion.aviso', { aviso: ['sin_voz_proximo', 'duracion_proxima', 'cuota_proxima'][i % 3], segundos_restantes: 10 + i }, 7 + i),
  'cotizacion.emitida': (i) => env('cotizacion.emitida', { cotizacion: cotizacion(OFICIOS[i % 5], ZONAS[i % 5], i), derivacion: derivacion(i) }, 8 + i),
  'sesion.cerrada': (i) => env('sesion.cerrada', { motivo_cierre: MOTIVOS[i % MOTIVOS.length], duracion_s: 600 + i }, 9 + i),
  error: (i) => env('error', { codigo: ['proveedor_no_disponible', 'limite_de_tasa', 'error_interno'][i % 3], mensaje: 'Tuvimos un problema; seguimos en un momento.' }, 9 + i),
};
export const encabezado = (i = 0) => ({ magia: 'VC', version: 1, tipo: ['audio_pcm16_16k', 'audio_opus', 'fotograma_jpeg'][i % 3], flags: 0, seq: i, ts_ms: 1000 * i, longitud: i % 3 === 2 ? 98304 : 640 });
