// Genera, de forma reproducible, lo que el panel toma del contrato:
//   1) src/api/generado/openapi.d.ts  -> tipos TypeScript del OpenAPI (openapi-typescript).
//   2) src/api/generado/errores.ts    -> mensajes de error del catálogo (contracts/catalogo-errores.json),
//                                        usados solo como respaldo si /v1/textos no responde.
// Uso:  node scripts/generar-contrato.mjs              escribe los archivos
//       node scripts/generar-contrato.mjs --verificar  falla si lo versionado difiere del contrato (para CI)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contrato = resolve(raiz, '..', 'contracts');
const salidaTipos = resolve(raiz, 'src/api/generado/openapi.d.ts');
const salidaErrores = resolve(raiz, 'src/api/generado/errores.ts');
const verificar = process.argv.includes('--verificar');

if (!existsSync(resolve(contrato, 'openapi.yaml'))) {
  console.error(`No encuentro ${contrato}/openapi.yaml. Corré este script dentro del repo completo.`);
  process.exit(2);
}

const CABECERA = '// ARCHIVO GENERADO por scripts/generar-contrato.mjs: no editar a mano.\n';

const ast = await openapiTS(pathToFileURL(resolve(contrato, 'openapi.yaml')));
const tipos = CABECERA + astToString(ast);

const catalogo = JSON.parse(readFileSync(resolve(contrato, 'catalogo-errores.json'), 'utf8'));
const mensajes = Object.fromEntries(
  Object.entries(catalogo.errores).map(([codigo, e]) => [codigo, e.mensaje]),
);
const errores =
  CABECERA +
  `// Contrato ${catalogo.version}\n` +
  `export const VERSION_CATALOGO_ERRORES = ${JSON.stringify(catalogo.version)};\n` +
  `export const MENSAJES_ERROR: Readonly<Record<string, string>> = ${JSON.stringify(mensajes, null, 2)};\n`;

function escribirOComparar(ruta, contenido) {
  const actual = existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
  if (verificar) {
    if (actual !== contenido) {
      console.error(`DESACTUALIZADO: ${ruta}. Corré "npm run contrato" y revisá el diff.`);
      return false;
    }
    console.log(`ok  ${ruta}`);
    return true;
  }
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
  console.log(`escrito ${ruta}`);
  return true;
}

const ok = [escribirOComparar(salidaTipos, tipos), escribirOComparar(salidaErrores, errores)].every(Boolean);
process.exit(ok ? 0 : 1);
