// Ejecuta los vectores de prueba de contrato (pruebas/vectores/*.json) en modo estático:
// todavía no hay servidor (T04). Por cada vector comprueba, contra el OpenAPI y los esquemas:
//  C1 la operación existe · C2 el status esperado está declarado · C3 el código de error coincide con el
//  catálogo y está documentado en esa respuesta · C4 el cuerpo del pedido valida (o no) según lo esperado ·
//  C5 la credencial está admitida por `security` cuando se espera éxito · C6 la TABLA DE DECISIÓN de abajo
//  (redactada aparte de los vectores) da el mismo resultado · C7 el cuerpo de respuesta esperado cumple
//  esquema + reglas de negocio (sumas en centavos, fuera de zona, wa.me sin datos personales) y eso
//  coincide con `conforme` · C8 costo_cero solo donde el contrato garantiza que no se llama a proveedores.
// Además corre, contra RespuestaModelo/SesionDetalle, los ejemplos y negativos de conductas/ (cot).
// Uso: node pruebas/ejecutar.mjs <carpeta contracts>
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';

// Acepta la carpeta contracts/ o su padre; sin argumento usa la carpeta padre de este script.
const RAIZ = (() => {
  const c = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
  return existsSync(join(c, 'openapi.yaml')) ? c : join(c, 'contracts');
})();
const require = createRequire(join(RAIZ, 'verificacion', 'package.json'));
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const BASE = 'https://videocotizacion.local/contracts/schemas/';
const leer = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---- carga ----
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
(function rec(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) rec(p);
    else if (f.endsWith('.schema.json')) ajv.addSchema({ ...leer(p), $id: BASE + relative(join(RAIZ, 'schemas'), p).replaceAll('\\', '/') });
  }
})(join(RAIZ, 'schemas'));
const LLM = join(RAIZ, '..', 'conductas', 'esquema-salida-llm.schema.json');
if (existsSync(LLM)) ajv.addSchema(leer(LLM));
const oas = YAML.parse(readFileSync(join(RAIZ, 'openapi.yaml'), 'utf8'));
const catalogo = leer(join(RAIZ, 'catalogo-errores.json')).errores;
const ref = (r) => r.slice(2).split('/').reduce((o, k) => o[k], oas);
const validador = (schema) => ajv.getSchema(BASE + ref(schema.$ref).$ref.replace('./schemas/', ''));
const v = (nombre) => ajv.getSchema(BASE + nombre + '.schema.json');

const ops = {};
for (const [ruta, ms] of Object.entries(oas.paths)) for (const [m, op] of Object.entries(ms)) ops[op.operationId] = { ...op, metodo: m, ruta };
const TIPO = { claveSecreta: 'secreta', clavePublica: 'publica', tokenSesion: 'sesion', cookiePanel: 'panel' };
const tiposDe = (op) => new Set(op.security.map((alt) => TIPO[Object.keys(alt)[0]]));
const tieneEsquema = (op, s) => op.security.some((alt) => s in alt);

// ---- C6: tabla de decisión del contrato (orden de evaluación documentado en estado-de-congelamiento.md) ----
function decidir(op, s) {
  const r = (status, codigo) => ({ status, codigo });
  const inseguro = op.metodo !== 'get';
  const c = s.credencial || { tipo: 'ninguna' };
  if (s.tasa === 'excedida') return r(429, 'limite_de_tasa');
  if (op.security.length) {
    const t = c.tipo;
    if (t === 'ninguna') return r(401, 'credencial_ausente');
    if (op['x-vc-panel'] && t !== 'panel') return r(401, 'credencial_ausente');
    if (c.estado === 'revocada') return r(401, 'credencial_invalida');
    if (c.estado === 'vencida') return r(401, 'sesion_vencida');
    if (!tiposDe(op).has(t)) return r(403, 'alcance_insuficiente');
    if (t === 'secreta' && s.origin !== 'ausente') return r(403, 'clave_secreta_desde_navegador');
    if (t === 'publica' && s.origin !== 'permitido') return r(403, 'origen_no_permitido');
    if (op['x-vc-panel'] && inseguro && s.origin === 'ajeno') return r(403, 'origen_no_permitido');
    if (op['x-vc-panel'] && inseguro && !s.csrf) return r(403, 'csrf_invalido');
    if (t === 'publica' && tieneEsquema(op, 'desafio') && s.desafio !== 'valido') return r(403, 'desafio_invalido');
    if (op['x-vc-rol'] && s.rol !== op['x-vc-rol']) return r(403, 'alcance_insuficiente');
    if (op['x-vc-reautenticacion'] && !s.reautenticado) return r(401, 'reautenticacion_requerida');
  } else if (op['x-vc-panel'] && inseguro && s.origin === 'ajeno') return r(403, 'origen_no_permitido');
  if (op.requestBody && !validador(op.requestBody.content['application/json'].schema)(s.cuerpo)) return r(422, 'validacion_fallida');
  if (op['x-vc-login']) {
    const l = s.login || {};
    if (l.intentos === 'excedidos') return r(429, 'intentos_excedidos');
    if (op['x-vc-login'] !== 'totp' && l.contrasena === 'incorrecta') return r(401, 'credenciales_incorrectas');
    if (op['x-vc-login'] !== 'contrasena' && l.totp !== 'valido') return r(401, 'totp_invalido');
  }
  const rec = s.recurso;
  if (op['x-vc-recurso']) {
    if (!rec.existe || rec.tenant !== c.tenant) return r(404, 'no_encontrado');
    if (op['x-vc-recurso'] === 'sesion' && c.tipo === 'sesion' && rec.sujeto !== c.sujeto) return r(404, 'no_encontrado');
    if (op['x-vc-recurso'] === 'sesion_panel' && rec.sujeto !== c.sujeto) return r(404, 'no_encontrado');
  }
  const e = rec?.estado;
  switch (op.operationId) {
    case 'registrarConsentimiento':
      if (e === 'cerrada') return r(409, 'sesion_cerrada');
      if (e !== 'creada') return r(409, 'estado_invalido');
      break;
    case 'emitirTokenMedios':
      if (e === 'cerrada') return r(409, 'sesion_cerrada');
      if (e === 'creada') return r(409, 'consentimiento_requerido');
      break;
    case 'cerrarSesion':
      if (e === 'cerrada') return r(409, 'sesion_cerrada');
      break;
    case 'leerCotizacion':
      if (!rec.cotizacion_emitida) return r(409, 'cotizacion_no_emitida');
      break;
    case 'leerDerivacion':
      if (e !== 'cerrada') return r(409, 'estado_invalido');
      break;
    case 'registrarContacto':
      if (e === 'creada' || e === 'consentida') return r(409, 'estado_invalido');
      if (rec.contacto_registrado) return r(409, 'contacto_ya_registrado');
      break;
    case 'leerContactoCliente':
      if (rec.contacto_registrado === false) return r(404, 'no_encontrado');
      if (s.lecturas_contacto === 'agotadas') return r(429, 'limite_lecturas_contacto');
      break;
  }
  if (op['x-vc-cupo']) {
    if (s.cupo?.cuota === 'agotada') return r(429, 'cuota_agotada');
    if (s.cupo?.simultaneas === 'agotadas') return r(429, 'simultaneas_agotadas');
  }
  const ok = Object.keys(op.responses).map(Number).find((n) => n < 300);
  return r(ok);
}

// ---- C7: reglas de negocio sobre cuerpos ----
function reglasCotizacion(c, out) {
  if (!c) return;
  for (const it of c.items || []) if (it.importe_centavos !== Math.floor((it.cantidad_centesimas * it.precio_unitario_centavos + 50) / 100)) out.push(`importe de ${it.codigo_tarea} mal calculado`);
  if ((c.items || []).reduce((a, it) => a + it.importe_centavos, 0) !== c.total_centavos) out.push('total ≠ suma de ítems');
  if ((c.zona === 'otra') !== c.fuera_de_zona) out.push('marca fuera_de_zona inconsistente');
}
function reglasDerivacion(d, out) {
  if (!d) return;
  const texto = decodeURIComponent((d.url_wa_me.split('?text=')[1] || '').replace(/\+/g, ' '));
  if (texto !== d.texto_prellenado) out.push('url y texto_prellenado no coinciden');
  if (!texto.includes(d.codigo_referencia)) out.push('url sin código de referencia');
  if (/[^\s@]+@[^\s@]+/.test(texto) || /\+?\d[\d\s-]{6,}\d/.test(texto)) out.push('texto con datos personales (R50)');
}
function conforme(op, status, cuerpo) {
  const out = [];
  const resp = op.responses[status]?.content;
  const mt = resp && Object.keys(resp)[0];
  if (!mt) return ['sin contenido documentado'];
  const val = validador(resp[mt].schema);
  if (!val(cuerpo)) out.push('esquema: ' + val.errors.map((e) => `${e.instancePath} ${e.message}`).slice(0, 2).join('; '));
  const nombre = ref(resp[mt].schema.$ref).$ref;
  if (/Cotizacion\.schema/.test(nombre)) reglasCotizacion(cuerpo, out);
  if (/SesionDetalle/.test(nombre)) reglasCotizacion(cuerpo.cotizacion, out);
  if (/DerivacionWhatsApp/.test(nombre)) reglasDerivacion(cuerpo, out);
  if (/CierreSesion/.test(nombre)) reglasDerivacion(cuerpo.derivacion, out);
  return out;
}

// ---- ejecución ----
const fallas = [];
const porCategoria = {};
let total = 0;
const dir = join(RAIZ, 'pruebas', 'vectores');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  for (const vec of leer(join(dir, f))) {
    total++;
    porCategoria[vec.categoria] = (porCategoria[vec.categoria] || 0) + 1;
    const mal = (m) => fallas.push(`${vec.id} [${vec.categoria}] ${vec.descripcion}: ${m}`);
    const op = ops[vec.operacion];
    if (!op) {
      mal('C1 operación inexistente');
      continue;
    }
    const { status, codigo } = vec.esperado;
    const resp = op.responses[status];
    if (!resp) mal(`C2 status ${status} no declarado`);
    if (codigo) {
      if (catalogo[codigo]?.http !== status) mal(`C3 ${codigo} es HTTP ${catalogo[codigo]?.http}, no ${status}`);
      const exs = Object.values(resp?.content?.['application/problem+json']?.examples || {});
      if (!exs.some((e) => e.value.codigo === codigo)) mal(`C3 ${codigo} no documentado en la respuesta ${status}`);
      if (status === 404 && exs.some((e) => e.value.codigo !== 'no_encontrado')) mal('C3 el 404 debe ser único (R64)');
    }
    if (op.requestBody && vec.solicitud.cuerpo !== undefined) {
      const ok = validador(op.requestBody.content['application/json'].schema)(vec.solicitud.cuerpo);
      if (status < 300 && !ok) mal('C4 se espera éxito con un cuerpo inválido');
      if (codigo === 'validacion_fallida' && ok) mal('C4 se espera 422 con un cuerpo válido');
    }
    if (status < 300 && op.security.length && !tiposDe(op).has(vec.solicitud.credencial?.tipo)) mal('C5 éxito con credencial no admitida');
    const d = decidir(op, vec.solicitud);
    if (d.status !== status || (d.codigo || null) !== (codigo || null)) mal(`C6 la tabla de decisión da ${d.status} ${d.codigo || ''}, el vector espera ${status} ${codigo || ''}`);
    if (vec.esperado.cuerpo !== undefined) {
      const problemas = conforme(op, status, vec.esperado.cuerpo);
      const esperado = vec.esperado.conforme ?? true;
      if (esperado && problemas.length) mal('C7 ' + problemas.join(' | '));
      if (!esperado && !problemas.length) mal('C7 debía detectarse como NO conforme y pasó');
    }
    if (vec.esperado.costo_cero && vec.operacion === 'emitirTokenMedios' && status < 300) mal('C8 costo_cero imposible: emitir token habilita proveedores');
  }
}

// Vectores dinámicos: salida del LLM (cot) dentro de RespuestaModelo y SesionDetalle.
let dinamicos = 0;
const rm = v('RespuestaModelo');
const sd = v('SesionDetalle');
for (const sub of ['ejemplos', 'negativos']) {
  const d = join(RAIZ, '..', 'conductas', sub);
  if (!existsSync(d) || !rm) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
    dinamicos++;
    const salida = leer(join(d, f));
    const resp = { turno: 1, registrada_en: '2026-10-08T13:00:00Z', salida };
    const ok = rm(resp);
    const det = sd({ sesion_id: 'ses_' + '0'.repeat(26), estado: 'cerrada', modo_avatar: '3d', creada_en: '2026-10-08T13:00:00Z', duracion_s: 1, resumen: 'r', versiones: { tarifas: '2026.1', prompt: 'p@0123456789ab', esquema_salida: '1.0.0' }, respuestas_modelo: [resp] });
    if (sub === 'ejemplos' && !(ok && det)) fallas.push(`conductas/${sub}/${f}: debía validar dentro de RespuestaModelo y SesionDetalle`);
    if (sub === 'negativos' && (ok || det)) fallas.push(`conductas/${sub}/${f}: debía fallar dentro de RespuestaModelo`);
  }
}

const aislamiento = porCategoria.aislamiento || 0;
console.log(`vectores: ${total} (${Object.entries(porCategoria).map(([k, n]) => `${k} ${n}`).join(', ')})`);
console.log(`vectores dinámicos de conductas: ${dinamicos}`);
console.log(`ok: ${total + dinamicos - fallas.length} · fallas: ${fallas.length}`);
if (total < 200) fallas.push(`meta: ${total} vectores < 200`);
if (aislamiento < 40) fallas.push(`meta: ${aislamiento} vectores de aislamiento < 40`);
for (const f of fallas.slice(0, 60)) console.log('  ✗ ' + f);
process.exit(fallas.length ? 1 : 0);
