// Comprueba que referenciaPrompt() cubre cada markdown T06 y coincide con Go (TestReferenciaContratoAnclas + paisajismo).
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenciaPrompt, referenciaDeCuerpo } from '../fuente/prompts.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'conductas', 'prompts');
const OFICIOS_CONTRATO = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
const ANCLAS_GO = {
  pintura: 'conducta_pintura@5f2e70a1bb1a',
  jardineria: 'conducta_jardineria@3f9fbb3beea7',
  limpieza: 'conducta_limpieza@36694d88643d',
  mantenimiento: 'conducta_mantenimiento@79b1b1006e65',
  reparaciones: 'conducta_reparaciones@741ac13899b3',
  paisajismo: 'conducta_paisajismo@0e78ce0e816c',
};

const slugs = readdirSync(DIR)
  .filter((n) => n.endsWith('.md'))
  .map((n) => n.slice(0, -3))
  .sort();

let fallas = 0;
for (const slug of slugs) {
  const ref = referenciaPrompt(slug);
  const want = ANCLAS_GO[slug];
  if (!want) {
    console.error(`sin ancla Go para slug T06: ${slug} → ${ref}`);
    fallas++;
    continue;
  }
  if (ref !== want) {
    console.error(`${slug}: got ${ref} want ${want}`);
    fallas++;
  }
  // El hash no puede depender del fin de línea del checkout (CRLF en Windows).
  const lf = readFileSync(join(DIR, `${slug}.md`), 'utf8').replace(/\r\n/g, '\n');
  const crlf = referenciaDeCuerpo(slug, lf.replace(/\n/g, '\r\n'));
  if (crlf !== ref) {
    console.error(`${slug}: con CRLF da ${crlf}, con LF ${ref}`);
    fallas++;
  }
}
for (const o of OFICIOS_CONTRATO) {
  if (!slugs.includes(o)) {
    console.error(`falta markdown para Oficio.schema: ${o}.md`);
    fallas++;
  }
}
if (fallas) {
  console.error(`referencias-prompts: ${fallas} fallas`);
  process.exit(1);
}
console.log(`referencias-prompts: ${slugs.length} slugs ok (5 Oficio + paisajismo T06)`);
