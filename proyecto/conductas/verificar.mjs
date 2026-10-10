// Verificador de T05: valida el esquema de salida del LLM con ajv (strict, 2020-12).
// Uso: node verificar.mjs   (sale con código 1 si hay alguna falla)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const aqui = dirname(fileURLToPath(import.meta.url));
const fallas = [];
const falla = (m) => fallas.push(m);
const leer = (p) => JSON.parse(readFileSync(p, "utf8"));

const esquema = leer(join(aqui, "esquema-salida-llm.schema.json"));
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
let validar;
try { validar = ajv.compile(esquema); } catch (e) { console.error("El esquema no compila:", e.message); process.exit(1); }

// 1) Ningún campo de dinero en el esquema (ADR 0002: el LLM no calcula precios).
const prohibido = /(precio|monto|importe|costo|coste|tarifa|descuento|total|valor|pesos|price|amount|cost|discount)/i;
(function recorrer(nodo, ruta) {
  if (Array.isArray(nodo)) return nodo.forEach((n, i) => recorrer(n, `${ruta}[${i}]`));
  if (nodo && typeof nodo === "object") {
    for (const [k, v] of Object.entries(nodo)) {
      if (["properties", "patternProperties"].includes(k) && v && typeof v === "object")
        for (const nombre of Object.keys(v)) if (prohibido.test(nombre)) falla(`esquema: propiedad prohibida "${nombre}" en ${ruta}.${k}`);
      recorrer(v, `${ruta}.${k}`);
    }
  }
})(esquema, "$");
// additionalProperties:false en todo objeto con properties.
(function cerrado(nodo, ruta) {
  if (Array.isArray(nodo)) return nodo.forEach((n, i) => cerrado(n, `${ruta}[${i}]`));
  if (nodo && typeof nodo === "object") {
    if (nodo.properties && nodo.additionalProperties !== false) falla(`esquema: ${ruta} tiene properties sin additionalProperties:false`);
    for (const [k, v] of Object.entries(nodo)) cerrado(v, `${ruta}.${k}`);
  }
})(esquema, "$");

// 2) Las 8 acciones de siguiente_paso coinciden con el ADR 0002.
const accionesAdr = ["preguntar", "pedir_ver", "confirmar_datos", "emitir_presupuesto", "fuera_de_zona", "fuera_de_alcance", "derivar_whatsapp", "cerrar"];
const accionesEsq = esquema.properties.siguiente_paso.properties.accion.enum;
if (JSON.stringify([...accionesEsq].sort()) !== JSON.stringify([...accionesAdr].sort()))
  falla(`siguiente_paso.accion no coincide con ADR 0002: ${accionesEsq.join(",")}`);
const adr = join(aqui, "..", "docs", "adr", "0002-pipeline-de-voz.md");
if (existsSync(adr)) {
  const texto = readFileSync(adr, "utf8");
  for (const a of accionesAdr) if (!texto.includes("`" + a + "`")) falla(`ADR 0002 ya no menciona la acción ${a}: conciliar`);
}

// 3) Ejemplos válidos pasan; negativos fallan.
const json = (dir) => readdirSync(join(aqui, dir)).filter((f) => f.endsWith(".json")).sort();
const ejemplos = json("ejemplos"), negativos = json("negativos");
if (ejemplos.length < 8) falla(`hay ${ejemplos.length} ejemplos (mínimo 8)`);
if (negativos.length < 8) falla(`hay ${negativos.length} negativos (mínimo 8)`);
const accionesVistas = new Set();
let fueraDeZonaEmite = false;
for (const f of ejemplos) {
  const d = leer(join(aqui, "ejemplos", f));
  if (!validar(d)) falla(`ejemplos/${f} debería validar: ${ajv.errorsText(validar.errors)}`);
  accionesVistas.add(d.siguiente_paso?.accion);
  if (d.zona?.fuera_de_zona && d.siguiente_paso?.accion === "emitir_presupuesto") fueraDeZonaEmite = true;
}
for (const a of accionesAdr) if (!accionesVistas.has(a)) falla(`ningún ejemplo usa la acción ${a}`);
if (!fueraDeZonaEmite) falla("falta un ejemplo fuera de zona que emita presupuesto (corrección de T24)");
let negConMonto = 0;
for (const f of negativos) {
  const d = leer(join(aqui, "negativos", f));
  if (validar(d)) falla(`negativos/${f} debería FALLAR y validó`);
  if (/precio|monto|descuento/i.test(JSON.stringify(Object.keys(d)) + JSON.stringify(d.trabajo) + JSON.stringify(d.siguiente_paso))) negConMonto++;
}
if (negConMonto === 0) falla("falta un negativo con campo precio/monto");

console.log(`esquema compilado (ajv strict 2020-12) · ejemplos: ${ejemplos.length} · negativos: ${negativos.length} · acciones cubiertas: ${accionesVistas.size}/8`);
if (fallas.length) { console.error(`FALLAS (${fallas.length}):\n- ` + fallas.join("\n- ")); process.exit(1); }
console.log("0 fallas");
