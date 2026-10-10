// Carga los JSON Schema de contracts/ en ajv (2020-12, strict), igual que contracts/verificacion/validar.mjs, para
// comprobar que cada respuesta del servidor simulado cumple el contrato. Solo lectura: contracts/ es del Arquitecto.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts');
const BASE = 'https://videocotizacion.local/contracts/schemas/';
const LLM = resolve(RAIZ, '..', 'conductas', 'esquema-salida-llm.schema.json');

const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
(addFormats as unknown as (a: unknown) => void)(ajv);
for (const f of ['int64', 'int32']) if (!ajv.formats[f]) ajv.addFormat(f, { type: 'number', validate: Number.isInteger });

function esquemasEn(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? esquemasEn(p) : f.endsWith('.schema.json') ? [p] : [];
  });
}

for (const p of esquemasEn(join(RAIZ, 'schemas'))) {
  const s = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  s.$id = BASE + relative(join(RAIZ, 'schemas'), p).replaceAll('\\', '/');
  ajv.addSchema(s);
}
void ajv.addSchema(JSON.parse(readFileSync(LLM, 'utf8')) as object);

/** Devuelve los problemas de `valor` contra `contracts/schemas/<nombre>.schema.json` (vacío = cumple). */
export function problemasContraEsquema(nombre: string, valor: unknown): string[] {
  const validar = ajv.getSchema(`${BASE}${nombre}.schema.json`);
  if (!validar) throw new Error(`No existe el esquema ${nombre}`);
  // El esquema es síncrono (sin $async): el valor de retorno es un booleano, no una promesa.
  const cumple = validar(valor) as boolean;
  if (cumple) return [];
  return (validar.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.keyword}: ${e.message ?? ''}`);
}

export function catalogoDeErroresDelContrato(): { version: string; errores: Record<string, { http: number; titulo: string; mensaje: string }> } {
  return JSON.parse(readFileSync(join(RAIZ, 'catalogo-errores.json'), 'utf8')) as { version: string; errores: Record<string, { http: number; titulo: string; mensaje: string }> };
}
