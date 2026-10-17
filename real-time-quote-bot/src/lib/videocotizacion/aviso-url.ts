/**
 * El contrato publica el aviso en una URL https absoluta
 * (`https://cotizar.<dominio>/privacidad/<versión>`). Ese dominio todavía no
 * resuelve: el texto se sirve en este front, en el mismo path.
 */
export function rutaLocalDelAviso(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.pathname.startsWith("/privacidad/")) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    return url;
  }
  return url;
}
