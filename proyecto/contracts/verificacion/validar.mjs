// Verificación del contrato VideoCotización.
// Uso: node verificacion/validar.mjs <carpeta contracts>   (p. ej. desde contracts/verificacion: node validar.mjs ..)
// 1) compila cada JSON Schema en ajv 2020 strict; 2) valida los "examples" de cada esquema;
// 3) valida todos los ejemplos del OpenAPI contra sus esquemas; 4) corre negativos/*.json (DEBEN fallar
//    y por la palabra clave indicada); 5) chequea reglas propias (sin float en dinero, objetos cerrados,
//    sin tipos unión, catálogo de errores) y el esquema de salida del LLM de conductas/ (ADR 0002).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const YAML = require('yaml');

// Acepta la carpeta contracts/ o su padre; sin argumento usa la carpeta padre de este script.
const RAIZ = (() => {
  const c = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
  return existsSync(join(c, 'openapi.yaml')) ? c : join(c, 'contracts');
})();
const BASE = 'https://videocotizacion.local/contracts/schemas/';
const LLM = resolve(RAIZ, '..', 'conductas', 'esquema-salida-llm.schema.json');
const fallas = [];
const falla = (m) => fallas.push(m);
const leer = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cuenta = { esquemas: 0, ejemplosEsquema: 0, ejemplosOpenapi: 0, negativos: 0, operaciones: 0 };

// ---- 0. Esperar el esquema de salida del LLM (lo escribe cot) ----
async function esperarLlm() {
  for (let i = 0; i <= 20 && !existsSync(LLM); i++) {
    if (i === 20) return false;
    console.log(`Esperando ${relative(RAIZ, LLM)} (${i + 1}/20, cada 30 s)…`);
    await new Promise((r) => setTimeout(r, 30000));
  }
  return true;
}
const hayLlm = await esperarLlm();
if (!hayLlm) falla(`No apareció ${LLM} tras 10 minutos: RespuestaModelo y SesionDetalle no se pueden compilar`);

// ---- 1. Cargar y compilar ----
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
for (const f of ['int64', 'int32']) if (!ajv.formats[f]) ajv.addFormat(f, { type: 'number', validate: Number.isInteger });

const archivos = [];
(function rec(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) rec(p);
    else if (f.endsWith('.schema.json')) archivos.push(p);
  }
})(join(RAIZ, 'schemas'));
const esquemas = {};
for (const p of archivos) {
  const s = leer(p);
  const rel = relative(join(RAIZ, 'schemas'), p).replaceAll('\\', '/');
  if (s.$id) falla(`${rel}: no debe declarar $id (se asigna BASE + ruta al cargar)`);
  s.$id = BASE + rel;
  esquemas[rel] = s;
  ajv.addSchema(s);
}
let llm = null;
if (hayLlm) {
  llm = leer(LLM);
  const esperado = new URL('../../conductas/esquema-salida-llm.schema.json', BASE + 'x').href;
  if (llm.$id !== esperado) falla(`conductas: $id del esquema del LLM (${llm.$id}) ≠ ${esperado}; la referencia relativa no resolvería`);
  try {
    new Ajv2020({ strict: true, allErrors: true }).compile(llm);
  } catch (e) {
    console.log(`AVISO conductas: el esquema del LLM no compila en strict puro (${e.message.split('\n')[0]}); compila con allowUnionTypes.`);
  }
  ajv.addSchema(llm);
}

// Reglas propias sobre nuestros esquemas.
const DINERO = /(precio|monto|importe|costo|total|descuento|centavos)/i;
for (const [rel, s] of Object.entries(esquemas)) {
  const APLICADORES = /\.(if|then|else|not|anyOf\[\d+\]|oneOf\[\d+\]|allOf\[\d+\])$/;
  (function rec(n, ruta) {
    if (Array.isArray(n)) return n.forEach((x, i) => rec(x, `${ruta}[${i}]`));
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.type)) falla(`${rel}${ruta}: tipo unión (prohibido en el contrato)`);
    if (n.type === 'number') falla(`${rel}${ruta}: type number (dinero y cantidades son enteros, O04)`);
    // Los subesquemas de if/then/else/anyOf/oneOf/not validan la misma instancia: no cierran el objeto.
    if (n.properties && n.additionalProperties !== false && !APLICADORES.test(ruta)) falla(`${rel}${ruta}: objeto sin additionalProperties:false (O02)`);
    if (n.properties) for (const k of Object.keys(n.properties)) if (/centavos/.test(k) && !(n.properties[k].$ref || '').endsWith('Centavos.schema.json')) falla(`${rel}${ruta}.${k}: monto que no usa Centavos`);
    if (n.type === 'string' && !n.enum && !n.const && !n.pattern && !n.maxLength && !n.format) falla(`${rel}${ruta}: string sin límite`);
    for (const [k, v] of Object.entries(n)) if (k !== 'examples') rec(v, `${ruta}.${k}`);
  })(s, '');
}
for (const sin of ['DatosExtraidos.schema.json', 'eventos/Evento_pizarron_actualizado.schema.json']) {
  const txt = JSON.stringify(esquemas[sin]?.properties || {});
  for (const m of txt.matchAll(/"([a-z_]+)":\{/g)) if (DINERO.test(m[1])) falla(`${sin}: campo de dinero "${m[1]}" (O03)`);
}

const validadores = {};
for (const rel of Object.keys(esquemas)) {
  try {
    validadores[rel] = ajv.getSchema(BASE + rel);
    if (!validadores[rel]) throw new Error('no compiló');
    cuenta.esquemas++;
  } catch (e) {
    falla(`${rel}: no compila en strict: ${e.message.split('\n')[0]}`);
  }
}
const err = (v) => (v.errors || []).map((e) => `${e.instancePath || '/'} ${e.keyword} ${e.message}`).slice(0, 3).join('; ');

// ---- 2. examples de cada esquema ----
for (const [rel, s] of Object.entries(esquemas)) {
  const v = validadores[rel];
  if (!v) continue;
  if (!s.examples?.length) falla(`${rel}: sin examples`);
  for (const [i, x] of (s.examples || []).entries()) {
    cuenta.ejemplosEsquema++;
    if (!v(x)) falla(`${rel} examples[${i}]: ${err(v)}`);
  }
}

// ---- 3. OpenAPI ----
const oas = YAML.parse(readFileSync(join(RAIZ, 'openapi.yaml'), 'utf8'));
const catalogo = leer(join(RAIZ, 'catalogo-errores.json')).errores;
const codigos = esquemas['CodigoError.schema.json'].enum;
if (JSON.stringify(Object.keys(catalogo).sort()) !== JSON.stringify([...codigos].sort())) falla('CodigoError.enum ≠ catalogo-errores.json');
const resolverRef = (ref) => ref.slice(2).split('/').reduce((o, k) => o[k], oas);
const inline = new Map();
function validadorDe(schema, donde) {
  if (schema.$ref?.startsWith('#/components/schemas/')) {
    const c = resolverRef(schema.$ref);
    const rel = c.$ref.replace('./schemas/', '');
    return validadores[rel] || (falla(`${donde}: esquema ${rel} no compilado`), null);
  }
  const k = JSON.stringify(schema);
  if (!inline.has(k)) {
    if (k.includes('$ref')) return falla(`${donde}: esquema en línea con $ref no soportado`), null;
    inline.set(k, ajv.compile(schema));
  }
  return inline.get(k);
}
function probarEjemplos(examples, schema, donde, extra) {
  const v = validadorDe(schema, donde);
  if (!v) return;
  for (const [n, ex] of Object.entries(examples || {})) {
    cuenta.ejemplosOpenapi++;
    if (ex.externalValue) falla(`${donde}#${n}: externalValue no permitido`);
    if (!v(ex.value)) falla(`${donde}#${n}: ${err(v)}`);
    extra?.(n, ex.value);
  }
}
const ids = new Set();
for (const [ruta, metodos] of Object.entries(oas.paths)) {
  for (const [m, op] of Object.entries(metodos)) {
    const donde = `${m.toUpperCase()} ${ruta}`;
    cuenta.operaciones++;
    if (ids.has(op.operationId)) falla(`${donde}: operationId repetido`);
    ids.add(op.operationId);
    if (!Array.isArray(op.security)) falla(`${donde}: sin security explícita (O05)`);
    if (/tenant_id/.test(JSON.stringify(op.parameters || []))) falla(`${donde}: parámetro tenant_id (R3)`);
    for (const p of op.parameters || []) {
      const par = p.$ref ? resolverRef(p.$ref) : p;
      probarEjemplos(par.examples, par.schema, `${donde} parámetro ${par.name}`);
    }
    if (op.requestBody) {
      for (const [mt, c] of Object.entries(op.requestBody.content)) {
        if (!c.examples || !Object.keys(c.examples).length) falla(`${donde} pedido ${mt}: sin ejemplos`);
        probarEjemplos(c.examples, c.schema, `${donde} pedido`);
      }
    }
    for (const [st, r] of Object.entries(op.responses)) {
      const n = Number(st);
      if (n >= 200 && n < 300 && n !== 204 && !r.content) falla(`${donde} ${st}: 2xx sin esquema (O05)`);
      for (const [h, hd] of Object.entries(r.headers || {})) {
        const hh = hd.$ref ? resolverRef(hd.$ref) : hd;
        probarEjemplos(hh.examples, hh.schema, `${donde} ${st} encabezado ${h}`);
      }
      for (const [mt, c] of Object.entries(r.content || {})) {
        if (!c.examples || !Object.keys(c.examples).length) falla(`${donde} ${st} ${mt}: sin ejemplos`);
        const esError = n >= 400;
        if (esError && mt !== 'application/problem+json') falla(`${donde} ${st}: error sin problem+json`);
        probarEjemplos(c.examples, c.schema, `${donde} ${st}`, (nombre, val) => {
          if (!esError) return;
          if (val.status !== n) falla(`${donde} ${st}#${nombre}: status ${val.status} ≠ ${n}`);
          if (catalogo[val.codigo]?.http !== n) falla(`${donde} ${st}#${nombre}: ${val.codigo} es HTTP ${catalogo[val.codigo]?.http} en el catálogo`);
        });
      }
    }
  }
}
if (!oas.info.description.includes(oas.info.version)) falla('info.description no menciona la versión');

// ---- 4. Negativos ----
for (const f of readdirSync(join(RAIZ, 'negativos')).filter((f) => f.endsWith('.json'))) {
  for (const c of leer(join(RAIZ, 'negativos', f))) {
    cuenta.negativos++;
    const v = validadores[`${c.esquema}.schema.json`];
    if (!v) {
      falla(`negativos/${f}: esquema ${c.esquema} inexistente`);
      continue;
    }
    if (v(c.instancia)) falla(`negativos/${f} "${c.caso}": PASÓ y debía fallar`);
    else if (!v.errors.some((e) => e.keyword === c.falla_por)) falla(`negativos/${f} "${c.caso}": falló por ${[...new Set(v.errors.map((e) => e.keyword))].join(',')} y no por ${c.falla_por}`);
  }
}

// ---- 5. Esquema de salida del LLM (conductas/, lo mantiene cot) ----
const llmInfo = [];
if (llm) {
  const nombres = [];
  (function rec(n) {
    if (Array.isArray(n)) return n.forEach(rec);
    if (!n || typeof n !== 'object') return;
    if (n.properties) nombres.push(...Object.keys(n.properties));
    Object.values(n).forEach(rec);
  })(llm);
  const dinero = nombres.filter((k) => /(precio|monto|importe|costo|total|descuento|tarifa|price|amount)/i.test(k));
  if (dinero.length) falla(`conductas: campos de dinero en la salida del LLM: ${dinero.join(', ')}`);
  const sp = llm.properties?.siguiente_paso;
  const adr = ['preguntar', 'pedir_ver', 'confirmar_datos', 'emitir_presupuesto', 'fuera_de_zona', 'fuera_de_alcance', 'derivar_whatsapp', 'cerrar'];
  if (sp?.type !== 'object' || JSON.stringify(Object.keys(sp.properties || {}).sort()) !== JSON.stringify(['accion', 'campos', 'motivo'])) falla('conductas: siguiente_paso no es {accion, motivo, campos}');
  else if (JSON.stringify([...sp.properties.accion.enum].sort()) !== JSON.stringify([...adr].sort())) falla('conductas: siguiente_paso.accion ≠ ADR 0002');
  const rm = validadores['RespuestaModelo.schema.json'];
  for (const dir of ['ejemplos', 'negativos']) {
    const d = join(RAIZ, '..', 'conductas', dir);
    if (!existsSync(d) || !rm) continue;
    let n = 0;
    for (const f of readdirSync(d).filter((f) => f.endsWith('.json'))) {
      n++;
      const ok = rm({ turno: 1, registrada_en: '2026-10-08T13:00:00Z', salida: leer(join(d, f)) });
      if (dir === 'ejemplos' && !ok) falla(`conductas/ejemplos/${f} no valida dentro de RespuestaModelo: ${err(rm)}`);
      if (dir === 'negativos' && ok) falla(`conductas/negativos/${f} pasa dentro de RespuestaModelo`);
    }
    llmInfo.push(`${dir} de cot: ${n}`);
  }
}

// ---- Resumen ----
const metas = [['esquemas', 45], ['ejemplos', 500], ['negativos', 90]];
const totalEj = cuenta.ejemplosEsquema + cuenta.ejemplosOpenapi;
const valores = { esquemas: cuenta.esquemas, ejemplos: cuenta.ejemplosOpenapi, negativos: cuenta.negativos };
for (const [k, min] of metas) if (valores[k] < min) falla(`meta: ${k} = ${valores[k]} < ${min}`);
console.log(`esquemas compilados (strict): ${cuenta.esquemas} · operaciones: ${cuenta.operaciones}`);
console.log(`ejemplos OpenAPI: ${cuenta.ejemplosOpenapi} · ejemplos en esquemas: ${cuenta.ejemplosEsquema} · total: ${totalEj}`);
console.log(`negativos: ${cuenta.negativos} · salida LLM: ${hayLlm ? 'referenciada y compilada' : 'AUSENTE'}${llmInfo.length ? ' (' + llmInfo.join(', ') + ')' : ''}`);
console.log(`fallas: ${fallas.length}`);
for (const f of fallas.slice(0, 60)) console.log('  ✗ ' + f);
process.exit(fallas.length ? 1 : 0);
