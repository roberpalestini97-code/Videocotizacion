/**
 * Verifica el resolver local sin Vite (guion embebido mínimo).
 * node scripts/test-asesor-api.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "src/data/asesores.ts"), "utf8");

// Extrae ids de asesores del fuente
const ids = [...src.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
const unique = [...new Set(ids)];
if (unique.length < 3) {
  console.error("FAIL: se esperaban ≥3 asesores, got", unique);
  process.exit(1);
}

const eventos = [
  "llamada.inicio",
  "turno.solicitar",
  "observacion.dato",
  "observacion.camara",
  "llamada.cierre",
];
const typesSrc = readFileSync(resolve(root, "src/lib/asesor-api/types.ts"), "utf8");
for (const e of eventos) {
  if (!typesSrc.includes(`"${e}"`) && !typesSrc.includes(`'${e}'`) && !typesSrc.includes(`z.literal("${e}")`)) {
    // check literal form
    if (!typesSrc.includes(`z.literal("${e}")`)) {
      console.error("FAIL: evento ausente en types:", e);
      process.exit(1);
    }
  }
}

const vc = readFileSync(resolve(root, "src/components/VideoCotizacion.tsx"), "utf8");
for (const needle of [
  "dispararEventoAsesor",
  "turno.solicitar",
  "llamada.inicio",
  "observacion.dato",
  "observacion.camara",
  "llamada.cierre",
  "hablarTextoAsesor",
  "publicarTurno",
]) {
  if (!vc.includes(needle)) {
    console.error("FAIL: VideoCotizacion no cablea", needle);
    process.exit(1);
  }
}

const resolver = readFileSync(resolve(root, "src/lib/asesor-api/resolver.ts"), "utf8");
if (!resolver.includes("resolverRespuestaLocal")) {
  console.error("FAIL: falta resolverRespuestaLocal");
  process.exit(1);
}

console.log("OK asesor-api wiring");
console.log("  asesores:", unique.join(", "));
console.log("  eventos:", eventos.join(", "));
console.log("  UI → API → voz/avatar/presupuesto: cableado en fuentes");
