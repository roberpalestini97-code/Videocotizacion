// Comprueba que el build de producción (dist/) NO contiene el servidor simulado ni sus credenciales de demo, que
// no hay mapas de código, que la política de contenido está puesta y que no se usa el almacenamiento del navegador.
// Uso: node scripts/verificar-dist.mjs   (lo corre `npm run build` después de `vite build`)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(raiz, 'dist');
const fallas = [];
const falla = (m) => fallas.push(m);

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No hay ${dist}/index.html: corré "vite build" antes.`);
  process.exit(2);
}

// Cualquiera de estas cadenas en el bundle significa que el mock (o sus credenciales de demostración) se coló.
const PROHIBIDAS = [
  'vc-mock-solo-desarrollo', // MARCA_MOCK
  'frase-larga-de-demo-0', // CONTRASENA_DEMO
  'AB12-CD34-EF56', // CODIGO_RECUPERACION_DEMO
  'juan@asesores.local',
  'admin@asesores.local',
  'asesores.local',
  'fetchSimulado',
  'crearServidorMock',
  'generarConsultas',
  'VITE_USAR_MOCK',
];
// Prácticas que el panel se prohíbe (R03). R02 (dangerouslySetInnerHTML) lo cubre eslint: React mismo trae esa cadena.
const SOSPECHOSAS = [
  ['localStorage', 'R03: nada de sesión en el almacenamiento del navegador'],
  ['sessionStorage', 'R03: nada de sesión en el almacenamiento del navegador'],
];

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else salida.push(ruta);
  }
  return salida;
}

const todos = archivos(dist);
let bytesJs = 0;
for (const ruta of todos) {
  const rel = relative(dist, ruta);
  if (/mock|servidor|dev[-_.]/i.test(rel)) falla(`${rel}: el nombre del archivo delata código de desarrollo`);
  if (rel.endsWith('.map')) falla(`${rel}: mapa de código en producción`);
  if (!/\.(js|mjs|css|html|json|txt|svg)$/.test(rel)) continue;
  const texto = readFileSync(ruta, 'utf8');
  if (rel.endsWith('.js')) bytesJs += texto.length;
  for (const p of PROHIBIDAS) if (texto.includes(p)) falla(`${rel}: contiene "${p}" (mock o demo en producción)`);
  if (/\.(js|mjs)$/.test(rel)) {
    for (const [cadena, motivo] of SOSPECHOSAS) if (texto.includes(cadena)) falla(`${rel}: usa ${cadena} (${motivo})`);
    if (texto.includes('sourceMappingURL')) falla(`${rel}: referencia un mapa de código`);
  }
}

const html = readFileSync(join(dist, 'index.html'), 'utf8').replaceAll('&#39;', "'");
if (!/http-equiv="Content-Security-Policy"[^>]*default-src 'self'/.test(html)) falla("index.html: falta la política de contenido (default-src 'self')");
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) falla('index.html: hay un <script> en línea');
for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) falla(`index.html: recurso externo ${m[1]}`);

if (fallas.length > 0) {
  console.error('verificar-dist: FALLÓ');
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verificar-dist: ok (${String(todos.length)} archivos, ${String(Math.round(bytesJs / 1024))} KiB de JS; sin mock, sin credenciales de demo, sin mapas, con CSP)`);
