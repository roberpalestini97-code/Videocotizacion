/**
 * Resolución del desafío anti-bots (mecanismo provisorio `prueba_de_trabajo_sha256`, P7).
 * Regla (backend/internal/desafio/libro.go): el encabezado `X-Desafio` es
 * `<desafio>.<nonce hex de 16>` y SHA-256 del texto completo (UTF-8) tiene que
 * empezar con `dificultad_bits` bits en cero.
 */
import { ErrorVC } from "./errores";

/** Más que esto tardaría minutos en un celular: se corta en vez de colgar la pantalla. */
export const DIFICULTAD_MAX_SOPORTADA = 24;

export function cerosIniciales(hash: Uint8Array): number {
  let n = 0;
  for (const b of hash) {
    if (b === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

function nonceHex(n: number): string {
  // 16 hex = 64 bits; el contador entra de sobra en un número seguro.
  return n.toString(16).padStart(16, "0");
}

export type DepsDesafio = {
  digest?: (datos: Uint8Array) => Promise<Uint8Array>;
  /** Punto de partida del contador (inyectable para pruebas). */
  inicio?: number;
  lote?: number;
  /** Cede el hilo entre lotes para no congelar la pantalla. */
  ceder?: () => Promise<void>;
};

const codificador = new TextEncoder();

async function digestWeb(datos: Uint8Array): Promise<Uint8Array> {
  const copia = new Uint8Array(datos); // evita ArrayBufferLike compartido
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copia));
}

export async function resolverDesafio(
  desafio: string,
  dificultadBits: number,
  deps: DepsDesafio = {},
): Promise<string> {
  if (dificultadBits > DIFICULTAD_MAX_SOPORTADA || dificultadBits < 0) {
    throw new ErrorVC("desafio_invalido", { mensaje: "dificultad no soportada" });
  }
  const digest = deps.digest ?? digestWeb;
  const lote = deps.lote ?? 256;
  const ceder = deps.ceder ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  let contador = deps.inicio ?? Math.floor(Math.random() * 2 ** 40);
  const tope = contador + 2 ** (dificultadBits + 6); // ~64x lo esperado
  while (contador < tope) {
    const candidatos: string[] = [];
    for (let i = 0; i < lote; i++) candidatos.push(`${desafio}.${nonceHex(contador + i)}`);
    const hashes = await Promise.all(candidatos.map((c) => digest(codificador.encode(c))));
    for (let i = 0; i < hashes.length; i++) {
      const h = hashes[i];
      const c = candidatos[i];
      if (h && c && cerosIniciales(h) >= dificultadBits) return c;
    }
    contador += lote;
    await ceder();
  }
  throw new ErrorVC("desafio_invalido", { mensaje: "no se resolvió el desafío" });
}
