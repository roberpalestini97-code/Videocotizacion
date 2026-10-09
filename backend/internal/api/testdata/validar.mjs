// Valida respuestas REALES del servidor Go contra contracts/ (esquemas del
// OpenAPI + reglas de negocio de pruebas/ejecutar.mjs: sumas en centavos,
// fuera de zona, wa.me sin datos personales). Lo corre api_test.go.
// Uso: node validar.mjs <carpeta contracts> < respuestas.json
// respuestas.json: [{ "id", "operacion", "status", "cuerpo" }]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const RAIZ = process.argv[2];
const require = createRequire(join(RAIZ, 'verificacion', 'package.json'));
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const BASE = 'https://videocotizacion.local/contracts/schemas/';
const leer = (p) => JSON.parse(readFileSync(p, 'utf8'));

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
const ref = (r) => r.slice(2).split('/').reduce((o, k) => o[k], oas);
const ops = {};
for (const ms of Object.values(oas.paths)) for (const op of Object.values(ms)) ops[op.operationId] = op;

function reglasCotizacion(c, out) {
  for (const it of c.items || []) if (it.importe_centavos !== Math.floor((it.cantidad_centesimas * it.precio_unitario_centavos + 50) / 100)) out.push(`importe de ${it.codigo_tarea} mal calculado`);
  if ((c.items || []).reduce((a, it) => a + it.importe_centavos, 0) !== c.total_centavos) out.push('total ≠ suma de ítems');
  if ((c.zona === 'otra') !== c.fuera_de_zona) out.push('marca fuera_de_zona inconsistente');
}
function reglasDerivacion(d, out) {
  const texto = decodeURIComponent((d.url_wa_me.split('?text=')[1] || '').replace(/\+/g, ' '));
  if (texto !== d.texto_prellenado) out.push('url y texto_prellenado no coinciden');
  if (!texto.includes(d.codigo_referencia)) out.push('url sin código de referencia');
  if (/[^\s@]+@[^\s@]+/.test(texto) || /\+?\d[\d\s-]{6,}\d/.test(texto)) out.push('texto con datos personales (R50)');
}

const fallas = [];
const respuestas = JSON.parse(readFileSync(0, 'utf8'));
for (const r of respuestas) {
  const op = ops[r.operacion];
  const resp = op?.responses[String(r.status)];
  const mt = resp?.content && Object.keys(resp.content)[0];
  if (!mt) {
    fallas.push(`${r.id}: ${r.operacion} ${r.status} no documentado`);
    continue;
  }
  const esquema = ref(resp.content[mt].schema.$ref).$ref.replace('./schemas/', '');
  const val = ajv.getSchema(BASE + esquema);
  if (!val(r.cuerpo)) fallas.push(`${r.id}: ${esquema}: ` + val.errors.map((e) => `${e.instancePath} ${e.message}`).slice(0, 3).join('; '));
  const out = [];
  if (/^Cotizacion\.schema/.test(esquema)) reglasCotizacion(r.cuerpo, out);
  if (/DerivacionWhatsApp/.test(esquema)) reglasDerivacion(r.cuerpo, out);
  for (const m of out) fallas.push(`${r.id}: ${m}`);
}
console.log(`respuestas validadas: ${respuestas.length} · fallas: ${fallas.length}`);
for (const f of fallas.slice(0, 40)) console.log('  ✗ ' + f);
process.exit(fallas.length ? 1 : 0);
