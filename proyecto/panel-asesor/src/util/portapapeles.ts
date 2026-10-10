/** Copia texto al portapapeles. Devuelve false si el navegador no lo permite (hay que copiar a mano). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator.clipboard.writeText !== 'function') return false;
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Descarga un objeto como archivo .json sin pasar por el servidor. */
export function descargarJson(nombreArchivo: string, contenido: unknown): void {
  const blob = new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
