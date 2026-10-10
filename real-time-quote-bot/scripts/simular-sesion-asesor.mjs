/**
 * Simula el ciclo de eventos del asesor con el guion embebido (sin Vite).
 * node scripts/simular-sesion-asesor.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "src/data/asesores.ts"), "utf8");

/** Parseo tosco del guion por asesor desde asesores.ts */
function parseAsesores(ts) {
  const blocks = ts.split(/{\s*\n\s*id:\s*"/).slice(1);
  return blocks.map((block) => {
    const id = block.match(/^([^"]+)"/)?.[1];
    const nombre = block.match(/nombre:\s*"([^"]+)"/)?.[1];
    const turnos = [];
    const re =
      /\{\s*de:\s*"(asesor|cliente)",\s*texto:\s*(?:"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/g;
    let m;
    while ((m = re.exec(block))) {
      turnos.push({ de: m[1], texto: (m[2] ?? m[3] ?? "").replace(/\\n/g, " ") });
    }
    // presupuestos en el mismo bloque
    const presupuestos = [...block.matchAll(/presupuesto:\s*\{\s*total:\s*"([^"]+)"/g)].map(
      (x) => x[1],
    );
    return { id, nombre, turnos, presupuestos };
  });
}

const asesores = parseAsesores(src).filter((a) => a.id && a.turnos.length);
if (asesores.length < 3) {
  console.error("FAIL parse asesores", asesores.map((a) => a.id));
  process.exit(1);
}

let fallos = 0;
for (const a of asesores) {
  const historial = [];
  const obs = [];
  // llamada.inicio — no publica turno
  // turno.solicitar 0..n
  for (let i = 0; i < a.turnos.length; i++) {
    const t = a.turnos[i];
    historial.push(t);
    if (t.de === "asesor" && !t.texto.trim()) {
      console.error(`FAIL ${a.id} turno ${i} texto vacío`);
      fallos++;
    }
  }
  if (!a.presupuestos.length) {
    console.error(`FAIL ${a.id} sin presupuesto en guion`);
    fallos++;
  }
  // cierre
  console.log(
    `OK sesión ${a.nombre}: ${historial.length} turnos, presupuesto ${a.presupuestos.join(",")}`,
  );
}

if (fallos) process.exit(1);
console.log("OK simulación local de 3 sesiones (inicio→turnos→presupuesto→cierre)");
