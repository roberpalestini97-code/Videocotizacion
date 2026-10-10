/**
 * Valida contra los JSON Schema del contrato (proyecto/contracts/schemas), igual que
 * proyecto/contracts/verificacion/validar.mjs: ajv 2020, $id = BASE + ruta relativa.
 * Solo para pruebas. Si el contrato no está al lado (el front vive en su repo), devuelve null.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const BASE = "https://videocotizacion.local/contracts/schemas/";
export const RAIZ_ESQUEMAS = resolve(__dirname, "../../../proyecto/contracts/schemas");

type Validador = ((d: unknown) => boolean) & { errors?: unknown };

export type Esquemas = {
  validar(nombre: string, dato: unknown): { ok: boolean; errores: string };
  ejemplos(nombre: string): unknown[];
};

export function cargarEsquemas(): Esquemas | null {
  if (!existsSync(RAIZ_ESQUEMAS)) return null;
  const Ajv2020 = require("ajv/dist/2020.js") as new (o: object) => {
    addSchema(s: object): void;
    getSchema(id: string): Validador | undefined;
    addFormat(n: string, f: object): void;
    formats: Record<string, unknown>;
    errorsText(e: unknown): string;
  };
  const addFormats = require("ajv-formats") as (a: unknown) => void;
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of ["int64", "int32"]) {
    if (!ajv.formats[f]) ajv.addFormat(f, { type: "number", validate: Number.isInteger });
  }
  const crudos: Record<string, Record<string, unknown>> = {};
  (function rec(d: string) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) rec(p);
      else if (f.endsWith(".schema.json")) {
        const rel = relative(RAIZ_ESQUEMAS, p).replaceAll("\\", "/");
        const s = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
        s["$id"] = BASE + rel;
        crudos[rel] = s;
        ajv.addSchema(s);
      }
    }
  })(RAIZ_ESQUEMAS);
  return {
    validar(nombre, dato) {
      const v = ajv.getSchema(BASE + nombre);
      if (!v) throw new Error(`esquema inexistente: ${nombre}`);
      const ok = v(dato) as boolean;
      return { ok, errores: ok ? "" : ajv.errorsText(v.errors) };
    },
    ejemplos(nombre) {
      return (crudos[nombre]?.["examples"] as unknown[] | undefined) ?? [];
    },
  };
}
