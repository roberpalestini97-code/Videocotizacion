// Referencias conducta_{oficio}@sha256 del markdown T06 (misma regla que backend/internal/prompts).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'conductas', 'prompts');

const cache = new Map();

/** @param {string} oficio */
export function referenciaPrompt(oficio) {
  if (!cache.has(oficio)) {
    const cuerpo = readFileSync(join(DIR, `${oficio}.md`), 'utf8');
    // Forma canónica CRLF (igual que hashCanonico en Go): las anclas publicadas se
    // calcularon con checkout CRLF en Windows; así no dependen del SO ni de autocrlf.
    const canonico = cuerpo.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    const h = createHash('sha256').update(canonico).digest('hex').slice(0, 12);
    cache.set(oficio, `conducta_${oficio}@${h}`);
  }
  return cache.get(oficio);
}
