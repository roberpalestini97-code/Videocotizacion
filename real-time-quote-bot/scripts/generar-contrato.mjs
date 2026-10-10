// Tipos OpenAPI para integración con VideoCotización (T09).
// Contrato: ../proyecto/contracts/openapi.yaml
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contrato = resolve(raiz, "..", "proyecto", "contracts");
const salidaTipos = resolve(raiz, "src/lib/api-contrato/generado/openapi.d.ts");
const verificar = process.argv.includes("--verificar");

const openapiPath = resolve(contrato, "openapi.yaml");
if (!existsSync(openapiPath)) {
  console.error(
    `No encuentro ${openapiPath}. Cloná o copiá el repo proyecto al lado de real-time-quote-bot.`,
  );
  process.exit(2);
}

const CABECERA = "// ARCHIVO GENERADO por scripts/generar-contrato.mjs: no editar a mano.\n";
const ast = await openapiTS(pathToFileURL(openapiPath));
const tipos = CABECERA + astToString(ast);

const actual = existsSync(salidaTipos) ? readFileSync(salidaTipos, "utf8") : null;
if (verificar) {
  if (actual !== tipos) {
    console.error(`DESACTUALIZADO: ${salidaTipos}. Corré "npm run contrato".`);
    process.exit(1);
  }
  console.log(`ok  ${salidaTipos}`);
  process.exit(0);
}
mkdirSync(dirname(salidaTipos), { recursive: true });
writeFileSync(salidaTipos, tipos);
console.log(`escrito ${salidaTipos}`);
