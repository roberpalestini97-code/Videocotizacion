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
    cache.set(oficio, referenciaDeCuerpo(oficio, cuerpo));
  }
  return cache.get(oficio);
}

/**
 * sha256 del markdown con fines de línea normalizados a LF: un checkout en
 * Windows (CRLF) no puede cambiar la referencia. Misma regla que
 * backend/internal/prompts.referenciaDeCuerpo.
 * @param {string} slug
 * @param {string} cuerpo
 */
export function referenciaDeCuerpo(slug, cuerpo) {
  const normalizado = cuerpo.replace(/\r\n/g, '\n');
  const h = createHash('sha256').update(normalizado).digest('hex').slice(0, 12);
  return `conducta_${slug}@${h}`;
}
