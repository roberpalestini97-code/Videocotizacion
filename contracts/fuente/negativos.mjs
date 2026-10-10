// Casos negativos: instancias que DEBEN fallar, con la palabra clave de ajv que las rechaza.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esquemas } from './esquemas.mjs';
import * as E from './ejemplos.mjs';
import { clone, id } from './base.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export function salidaLlmEjemplo() {
  const p = join(RAIZ, '..', 'conductas', 'ejemplos', '02-fachada-altura-emitir.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

export function negativos(ej) {
  const out = [];
  const n = (esquema, caso, falla_por, instancia) => out.push({ esquema, caso, falla_por, instancia });
  const mut = (base, f) => {
    const x = clone(base);
    f(x);
    return x;
  };

  // Automáticos: campo extra tenant_id (R3) y falta de cada requerido (hasta 2) en todo objeto con ejemplo.
  for (const [nombre, s] of Object.entries(esquemas)) {
    if (s.type !== 'object' || !ej[nombre]) continue;
    const base = ej[nombre][0];
    n(nombre, 'campo extra tenant_id (R3)', 'additionalProperties', { ...clone(base), tenant_id: '7f1c2d4e-0000-4000-8000-000000000001' });
    for (const req of (s.required || []).slice(0, 2)) n(nombre, `falta "${req}"`, 'required', mut(base, (x) => delete x[req]));
  }

  // Dinero y cantidades (O04, N1).
  n('Centavos', 'monto con decimales', 'type', 1500.5);
  n('Centavos', 'monto como texto', 'type', '1500');
  n('Centavos', 'monto negativo', 'minimum', -1);
  n('Centavos', 'supera 2^53−1', 'maximum', 9007199254740992);
  n('CantidadCentesimas', 'cantidad float (N1)', 'type', 12.5);
  n('CantidadCentesimas', 'cantidad cero', 'minimum', 0);
  const cot = E.cotizacion('pintura', 'cobo', 0);
  n('ItemCotizacion', 'cantidad float en ítem', 'type', mut(cot.items[0], (x) => (x.cantidad_centesimas = 12.5)));
  n('ItemCotizacion', 'importe con decimales', 'type', mut(cot.items[0], (x) => (x.importe_max_centavos = 100.25)));
  n('ItemCotizacion', 'precio único sin rango (B1)', 'additionalProperties', mut(cot.items[0], (x) => (x.precio_unitario_centavos = x.precio_unitario_max_centavos)));
  n('VersionTarifas', 'formato AAAA.N viejo (B2)', 'pattern', '2026.1');
  n('VersionTarifas', 'versión del archivo sin nombre (B2)', 'pattern', '0.1.0');
  n('Cotizacion', 'precio final con tarifas sin validar (B1)', 'not', mut(cot, (x) => (x.precio_final_centavos = x.total_min_centavos)));
  n('Cotizacion', 'total único viejo (B1)', 'additionalProperties', mut(cot, (x) => (x.total_centavos = x.total_max_centavos)));
  n('ItemCotizacion', 'descripción con HTML', 'pattern', mut(cot.items[0], (x) => (x.descripcion = '<b>oferta</b>')));
  n('Cotizacion', 'zona otra sin marca fuera_de_zona (T24)', 'const', { ...E.cotizacion('pintura', 'otra', 0), fuera_de_zona: false });
  n('Cotizacion', 'zona atendida marcada fuera de zona', 'const', mut(cot, (x) => (x.fuera_de_zona = true)));
  n('Cotizacion', 'moneda en minúsculas', 'enum', mut(cot, (x) => (x.moneda = 'ars')));
  n('Cotizacion', 'total como texto', 'type', mut(cot, (x) => (x.total_min_centavos = String(x.total_min_centavos))));
  n('Cotizacion', 'sin ítems', 'minItems', mut(cot, (x) => (x.items = [])));
  n('Cotizacion', 'no orientativa', 'const', mut(cot, (x) => (x.orientativa = false)));
  n('Cotizacion', 'descuento agregado', 'additionalProperties', mut(cot, (x) => (x.descuento_centavos = 1000)));
  n('Cotizacion', 'tarifas con estado inventado', 'enum', mut(cot, (x) => (x.tarifas.estado = 'aprobada_por_llm')));

  // Origin (R55).
  for (const [c, v] of [['comodín', 'https://*.ejemplo.com'], ['http', 'http://ejemplo.com'], ['barra final', 'https://ejemplo.com/'], ['asterisco', '*'], ['con ruta', 'https://ejemplo.com/widget'], ['mayúsculas', 'https://Ejemplo.com'], ['null', 'null']]) n('Origin', `Origin ${c}`, 'pattern', v);
  n('ClaveWidgetSolicitud', 'sin origins', 'minItems', { nombre: 'Sitio', origins: [] });
  n('ClaveWidgetSolicitud', 'origins repetidos', 'uniqueItems', { nombre: 'Sitio', origins: ['https://a.local', 'https://a.local'] });
  n('ClaveWidgetSolicitud', 'origin con comodín', 'pattern', { nombre: 'Sitio', origins: ['https://*.a.local'] });

  // Datos extraídos: sin montos ni personas (O03, R47).
  const de = E.datosExtraidos('pintura', 'cobo', 1);
  for (const campo of ['precio', 'monto_estimado', 'total', 'rostro', 'edad_aparente', 'dni']) n('DatosExtraidos', `campo prohibido ${campo}`, 'additionalProperties', { ...clone(de), [campo]: 1 });
  n('DatosExtraidos', 'superficie float', 'type', mut(de, (x) => (x.superficie_centesimas_m2 = 40.5)));
  n('DatosExtraidos', 'localidad sin normalizar', 'enum', mut(de, (x) => (x.zona = 'mar_del_plata')));
  n('DatosExtraidos', 'observaciones con script', 'pattern', mut(de, (x) => (x.observaciones = '<script>alert(1)</script>')));

  // SesionDetalle sin código ni derivación ni contacto_disponible (T39).
  const sd = E.sesionDetalle('pintura', 'cobo', 0);
  n('SesionDetalle', 'con codigo_referencia', 'additionalProperties', { ...clone(sd), codigo_referencia: 'VC-ABCD-EFGHJK' });
  n('SesionDetalle', 'con derivacion', 'additionalProperties', { ...clone(sd), derivacion: E.derivacion(0) });
  n('SesionDetalle', 'con contacto_disponible', 'additionalProperties', { ...clone(sd), contacto_disponible: true });
  n('SesionDetalle', 'con fotogramas', 'additionalProperties', { ...clone(sd), fotogramas: ['/9j/4AAQ'] });
  const llm = salidaLlmEjemplo();
  if (llm) {
    n('RespuestaModelo', 'salida del LLM con precio (ADR 0002)', 'additionalProperties', { turno: 1, registrada_en: '2026-10-08T13:05:00Z', salida: { ...clone(llm), precio: 100000 } });
    n('RespuestaModelo', 'salida del LLM con acción inventada', 'enum', { turno: 1, registrada_en: '2026-10-08T13:05:00Z', salida: mut(llm, (x) => (x.siguiente_paso.accion = 'aplicar_descuento')) });
  }
  n('ResumenCotizacion', 'contacto_disponible como texto', 'type', mut(E.resumenCot(0), (x) => (x.contacto_disponible = 'si')));

  // Consentimiento y contacto (R10, R68).
  for (const k of ['acepta_camara_y_microfono', 'acepta_tratamiento', 'declara_mayor_de_18', 'informado_asistente_automatico']) n('ConsentimientoSolicitud', `${k} = false`, 'const', mut(E.consentimientoSol(0), (x) => (x[k] = false)));
  n('ConsentimientoSolicitud', 'versión de aviso libre', 'pattern', mut(E.consentimientoSol(0), (x) => (x.aviso_version = 'ultima')));
  n('ContactoSolicitud', 'sin teléfono ni email', 'anyOf', mut(E.contactoSol(0), (x) => delete x.telefono));
  n('ContactoSolicitud', 'consentimiento premarcado falso', 'const', mut(E.contactoSol(0), (x) => (x.consentimiento.acepta_ser_contactado = false)));
  n('ContactoSolicitud', 'finalidad de publicidad', 'const', mut(E.contactoSol(0), (x) => (x.consentimiento.finalidad = 'publicidad')));
  n('ContactoSolicitud', 'teléfono sin formato E.164', 'pattern', mut(E.contactoSol(0), (x) => (x.telefono = '223 555-1234')));
  n('SolicitudArco', 'verificación vacía', 'minProperties', mut(E.arcoSol(0), (x) => (x.verificacion = {})));
  n('SolicitudArco', 'tipo inventado', 'enum', mut(E.arcoSol(0), (x) => (x.tipo = 'portabilidad')));

  // Token, fotogramas, límites (R32, R65).
  n('TokenMedios', 'vence en 300 s', 'maximum', mut(E.tokenMedios(0), (x) => (x.vence_en_s = 300)));
  n('TokenMedios', 'ws sin TLS', 'pattern', mut(E.tokenMedios(0), (x) => (x.ws_url = x.ws_url.replace('wss://', 'ws://'))));
  n('TokenMedios', 'token en la URL', 'pattern', mut(E.tokenMedios(0), (x) => (x.ws_url += '?token=abc')));
  n('TokenMedios', 'reutilizable', 'const', mut(E.tokenMedios(0), (x) => (x.un_solo_uso = false)));
  n('TokenMedios', 'reserva menor a 60 s (H3)', 'minimum', mut(E.tokenMedios(0), (x) => (x.reserva.duracion_maxima_s = 30)));
  n('TokenMedios', 'sin reserva (H3)', 'required', mut(E.tokenMedios(0), (x) => delete x.reserva));
  n('ReglaFotograma', 'más de 128 KiB', 'maximum', mut(E.reglaFotograma(), (x) => (x.bytes_max = 200000)));
  n('ReglaFotograma', 'más de 1024 px', 'maximum', mut(E.reglaFotograma(), (x) => (x.lado_max_px = 2048)));
  n('ReglaFotograma', 'más de uno cada 3 s', 'minimum', mut(E.reglaFotograma(), (x) => (x.intervalo_min_ms = 1000)));
  n('ReglaFotograma', 'PNG', 'const', mut(E.reglaFotograma(), (x) => (x.formato = 'image/png')));
  n('LimitesSesion', 'sin_voz_s de 0', 'minimum', mut(E.limites(0), (x) => (x.sin_voz_s = 0)));
  n('SesionCreada', 'trae token de medios antes del consentimiento (O1)', 'additionalProperties', { ...E.sesionCreada(0), token_medios: E.tokenMedios(0).token });

  // Derivación (R50).
  n('DerivacionWhatsApp', 'url sin https', 'pattern', mut(E.derivacion(0), (x) => (x.url_wa_me = x.url_wa_me.replace('https', 'http'))));
  n('DerivacionWhatsApp', 'url con espacios', 'pattern', mut(E.derivacion(0), (x) => (x.url_wa_me = 'https://wa.me/5492235550101?text=hola mundo')));
  n('CodigoReferencia', 'código corto', 'pattern', 'VC-1234');
  n('CodigoReferencia', 'código en minúsculas', 'pattern', 'vc-abcd-efghjk');
  n('CodigoReferencia', 'código con I/L/O/U ambiguas', 'pattern', 'VC-ILOU-ABCDEF');

  // Errores y sesión.
  n('Error', 'código fuera del catálogo', 'enum', mut(E.error('no_encontrado'), (x) => (x.codigo = 'desconocido')));
  n('Error', 'status 200', 'minimum', mut(E.error('no_encontrado'), (x) => (x.status = 200)));
  n('Error', 'con traza interna', 'additionalProperties', { ...E.error('error_interno'), stack: 'panic: runtime error' });
  n('Sesion', 'cerrada sin motivo', 'required', mut(E.sesion(0, 'cerrada'), (x) => delete x.motivo_cierre));
  n('Sesion', 'abierta con motivo de cierre', 'not', { ...E.sesion(0, 'en_curso'), motivo_cierre: 'sin_voz' });
  n('Sesion', 'motivo inventado', 'enum', mut(E.sesion(0, 'cerrada'), (x) => (x.motivo_cierre = 'aburrido')));
  n('IdSesion', 'id secuencial', 'pattern', 'ses_1');
  n('IdSesion', 'uuid sin prefijo', 'pattern', '7f1c2d4e-0000-4000-8000-000000000001');
  n('IdPublicoEnlace', 'id corto adivinable', 'pattern', 'juanperez');
  n('CrearSesionSolicitud', 'modo de avatar inventado', 'enum', mut(E.crearSesionSol(0), (x) => (x.modo_avatar = 'video')));
  n('CrearSesionSolicitud', 'idioma distinto', 'const', mut(E.crearSesionSol(0), (x) => (x.idioma = 'en-US')));
  n('CrearSesionSolicitud', 'referencia externa con email', 'pattern', mut(E.crearSesionSol(0), (x) => (x.referencia_externa = 'juan@correo.com')));

  // Panel.
  n('TotpSolicitud', 'código y recuperación a la vez', 'oneOf', { codigo: '123456', codigo_recuperacion: 'AB12-CD34-EF56' });
  n('TotpSolicitud', 'vacío', 'oneOf', {});
  n('TotpSolicitud', 'código de 5 dígitos', 'pattern', { codigo: '12345' });
  n('PerfilActualizacion', 'sin cambios', 'minProperties', {});
  n('PerfilActualizacion', 'con DNI', 'additionalProperties', { dni: '30111222' });
  n('PerfilAsesor', 'zona "otra" en el perfil', 'enum', mut(E.perfil(0), (x) => (x.zonas = ['otra'])));
  n('LoginSolicitud', 'contraseña corta', 'minLength', { email: 'juan@asesores.local', contrasena: 'corta' });
  n('ReautenticacionOtorgada', 'ventana de 10 min', 'maximum', { valida_hasta: '2026-10-08T13:10:00Z', valida_s: 600 });
  n('ListadoCotizaciones', 'más de 100 por página', 'maxItems', { items: Array.from({ length: 101 }, (_, k) => E.resumenCot(k)) });
  n('ClaveWidgetCreada', 'se puede volver a ver', 'const', mut(E.claveWidgetCreada(0), (x) => (x.se_muestra_una_sola_vez = false)));
  n('ClaveWidget', 'expone el valor completo', 'additionalProperties', { ...E.claveWidget(0), valor: E.claveWidgetCreada(0).valor });
  n('CatalogoTextos', 'clave con mayúsculas', 'pattern', mut(E.textos(), (x) => (x.textos['Error.X'] = 'x')));
  n('CatalogoTextos', 'texto con HTML', 'pattern', mut(E.textos(), (x) => (x.textos['panel.titulo'] = '<h1>Panel</h1>')));
  n('Consumo', 'mes 13', 'pattern', mut(E.consumo(1), (x) => (x.periodo = '2026-13')));
  n('Consumo', 'expone costo en dinero', 'additionalProperties', { ...E.consumo(1), costo_centavos: 120000 });
  n('Consumo', 'expone el tope global (R52)', 'additionalProperties', { ...E.consumo(1), segundos_tope_global: 900000 });
  n('Consumo', 'sin segundos reservados (H3)', 'required', mut(E.consumo(1), (x) => delete x.segundos_reservados));
  n('ReglaRetencion', 'configurable sin rango (C6)', 'required', mut(E.retencion().reglas[0], (x) => delete x.plazo_dias_max));
  n('ReglaRetencion', 'rango en dato no configurable (C6)', 'false schema', mut(E.retencion().reglas[6], (x) => (x.plazo_dias_min = 1)));
  n('Error', 'Retry-After de más de 31 días (H4)', 'maximum', E.error('cuota_agotada', 0, { reintentar_en_s: 2678401 }));
  n('TablaRetencion', 'sin marca de abogado', 'const', mut(E.retencion(), (x) => (x.a_validar_con_abogado = false)));
  n('RegistroLectura', 'acción inventada', 'enum', mut(E.registro(0), (x) => (x.accion = 'borrar_registro')));
  n('EnlacePublico', 'expone teléfono del profesional (R63)', 'additionalProperties', mut(E.enlacePublico(0), (x) => (x.profesional.telefono = '+5492235550101')));
  n('EnlacePublico', 'cámara opcional', 'const', mut(E.enlacePublico(0), (x) => (x.camara_obligatoria = false)));
  n('DesafioEmitido', 'vence en 10 min', 'maximum', mut(E.desafio(0), (x) => (x.vence_en_s = 600)));

  // Eventos (borrador).
  const ev = (t, i = 0) => E.eventos[t](i);
  n('eventos/Evento_pizarron_actualizado', 'valor con script (R19)', 'pattern', mut(ev('pizarron.actualizado'), (x) => (x.datos.campos[0].valor = '<script>alert(1)</script>')));
  n('eventos/Evento_pizarron_actualizado', 'campo con precio', 'additionalProperties', mut(ev('pizarron.actualizado'), (x) => (x.datos.campos[0].precio = 1000)));
  n('eventos/Evento_avatar_respuesta', 'texto con HTML', 'pattern', mut(ev('avatar.respuesta'), (x) => (x.datos.texto = '<img src=x onerror=1>')));
  n('eventos/Evento_texto_enviar', 'texto de 501 caracteres (R66)', 'maxLength', mut(ev('texto.enviar'), (x) => (x.datos.texto = 'a'.repeat(501))));
  n('eventos/Evento_avatar_visemas', 'visema inventado', 'enum', mut(ev('avatar.visemas'), (x) => (x.datos.items[0].v = 'XX')));
  n('eventos/Evento_camara_fotograma', 'fotograma guardado', 'enum', mut(ev('camara.fotograma'), (x) => (x.datos.resultado = 'guardado')));
  n('eventos/Evento_sesion_cerrada', 'motivo inventado', 'enum', mut(ev('sesion.cerrada'), (x) => (x.datos.motivo_cierre = 'aburrido')));
  n('eventos/Evento_sesion_autenticar', 'token de sesión en vez de medios', 'pattern', mut(ev('sesion.autenticar'), (x) => (x.datos.token_medios = 'vc_ses_' + 'a'.repeat(43))));
  n('eventos/EventoCliente', 'evento de servidor enviado por el cliente', 'oneOf', ev('sesion.lista'));
  n('eventos/EventoServidor', 'evento de cliente enviado por el servidor', 'oneOf', ev('sesion.autenticar'));
  n('eventos/EncabezadoBinario', 'trama de 200000 bytes', 'maximum', mut(E.encabezado(2), (x) => (x.longitud = 200000)));
  n('eventos/EncabezadoBinario', 'magia incorrecta', 'const', mut(E.encabezado(0), (x) => (x.magia = 'XX')));
  return out;
}
