// Comprueba que referenciaPrompt() cubre cada markdown T06 y coincide con Go (TestReferenciaContratoAnclas + paisajismo).
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenciaPrompt } from '../fuente/prompts.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'conductas', 'prompts');
const OFICIOS_CONTRATO = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
const ANCLAS_GO = {
  pintura: 'conducta_pintura@fdee14cbdaf7',
  jardineria: 'conducta_jardineria@de1c6081d09a',
  limpieza: 'conducta_limpieza@9d7e87923bd4',
  mantenimiento: 'conducta_mantenimiento@cb79d8745105',
  reparaciones: 'conducta_reparaciones@cdb349e3a2e9',
  paisajismo: 'conducta_paisajismo@5cc33b65b089',
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
