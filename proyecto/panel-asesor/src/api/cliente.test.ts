import { describe, expect, it, vi } from 'vitest';
import { crearCliente } from './cliente';
import { esErrorApi } from './errores';
import type { CodigoError } from './tipos';

function respuestaProblema(status: number, codigo: string, extra: Record<string, unknown> = {}, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: `https://x/errores/${codigo}`, title: 't', status, codigo, id_traza: 'tr_0123456789abcdef', ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...cabeceras },
  });
}

function armar(respuesta: () => Response | Promise<Response>, csrf: string | null = 'csrf-1') {
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respuesta()));
  const alSesionVencida = vi.fn<(c: CodigoError) => void>();
  const cliente = crearCliente({ fetchImpl, obtenerCsrf: () => csrf, alSesionVencida });
  return { cliente, fetchImpl, alSesionVencida };
}

const ultimaLlamada = (f: ReturnType<typeof vi.fn<typeof fetch>>) => {
  const [url, init] = f.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit, cabeceras: new Headers((init as RequestInit).headers) };
};

describe('cliente HTTP del panel', () => {
  it('manda X-CSRF-Token solo en las escrituras, nunca en las lecturas', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({}));
    await cliente.leerPerfil();
    expect(ultimaLlamada(fetchImpl).cabeceras.get('X-CSRF-Token')).toBeNull();
    await cliente.actualizarPerfil({ nombre_visible: 'Ana' });
    expect(ultimaLlamada(fetchImpl).cabeceras.get('X-CSRF-Token')).toBe('csrf-1');
  });
  it('no manda el encabezado CSRF si todavía no hay token', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({}), null);
    await cliente.iniciarSesion({ email: 'a@b.cc', contrasena: 'una-frase-larga-1' });
    expect(ultimaLlamada(fetchImpl).cabeceras.has('X-CSRF-Token')).toBe(false);
  });
  it('usa cookie del mismo origen y no cachea', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({}));
    await cliente.leerPerfil();
    expect(ultimaLlamada(fetchImpl).init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'GET' });
  });
  it('arma la consulta sin parámetros vacíos o indefinidos', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({ items: [] }));
    await cliente.listarCotizaciones({ oficio: 'pintura', desde: '', hasta: undefined }, { cursor: undefined, limite: 20 });
    expect(ultimaLlamada(fetchImpl).url).toBe('/v1/panel/cotizaciones?oficio=pintura&limite=20');
  });
  it('escapa el identificador en la ruta', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({}));
    await cliente.leerContactoCliente('ses_a/b?c');
    expect(ultimaLlamada(fetchImpl).url).toBe('/v1/panel/cotizaciones/ses_a%2Fb%3Fc/contacto');
  });
  it('manda el cuerpo como JSON con su Content-Type', async () => {
    const { cliente, fetchImpl } = armar(() => Response.json({}));
    await cliente.reautenticar({ contrasena: 'x'.repeat(12), codigo_totp: '123456' });
    const { init, cabeceras } = ultimaLlamada(fetchImpl);
    expect(cabeceras.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ contrasena: 'xxxxxxxxxxxx', codigo_totp: '123456' });
  });
  it('un 204 no intenta leer cuerpo', async () => {
    const { cliente } = armar(() => new Response(null, { status: 204 }));
    await expect(cliente.cerrarSesion()).resolves.toBeUndefined();
  });

  it.each(['sesion_vencida', 'credencial_ausente', 'credencial_invalida'] as const)('un 401 %s avisa que se perdió la sesión', async (codigo) => {
    const { cliente, alSesionVencida } = armar(() => respuestaProblema(401, codigo));
    await expect(cliente.leerPerfil()).rejects.toMatchObject({ codigo, status: 401 });
    expect(alSesionVencida).toHaveBeenCalledExactlyOnceWith(codigo);
  });
  it.each(['reautenticacion_requerida', 'credenciales_incorrectas', 'totp_invalido'] as const)('un 401 %s NO cierra la sesión', async (codigo) => {
    const { cliente, alSesionVencida } = armar(() => respuestaProblema(401, codigo));
    await expect(cliente.rotarEnlace()).rejects.toMatchObject({ codigo });
    expect(alSesionVencida).not.toHaveBeenCalled();
  });
  it('un 403 o un 404 tampoco cierran la sesión', async () => {
    const { cliente, alSesionVencida } = armar(() => respuestaProblema(403, 'alcance_insuficiente'));
    await expect(cliente.listarClavesWidget()).rejects.toMatchObject({ codigo: 'alcance_insuficiente' });
    expect(alSesionVencida).not.toHaveBeenCalled();
  });
  it('un 401 sin cuerpo del contrato se trata como credencial inválida (sesión perdida)', async () => {
    const { cliente, alSesionVencida } = armar(() => new Response('<html>', { status: 401 }));
    await expect(cliente.leerPerfil()).rejects.toMatchObject({ codigo: 'credencial_invalida' });
    expect(alSesionVencida).toHaveBeenCalledOnce();
  });

  it('conserva los errores por campo y el id de traza del 422', async () => {
    const campos = [{ campo: '/whatsapp', problema: 'Formato inválido.' }];
    const { cliente } = armar(() => respuestaProblema(422, 'validacion_fallida', { errores: campos }));
    const e = await cliente.actualizarPerfil({ whatsapp: '1' }).catch((x: unknown) => x);
    expect(esErrorApi(e, 'validacion_fallida')).toBe(true);
    expect(e).toMatchObject({ campos, idTraza: 'tr_0123456789abcdef', status: 422 });
  });
  it('toma la espera del cuerpo y, si falta, del encabezado Retry-After', async () => {
    const a = armar(() => respuestaProblema(429, 'intentos_excedidos', { reintentar_en_s: 30 }, { 'Retry-After': '99' }));
    await expect(a.cliente.leerPerfil()).rejects.toMatchObject({ reintentarEnS: 30 });
    const b = armar(() => respuestaProblema(429, 'limite_de_tasa', {}, { 'Retry-After': '12' }));
    await expect(b.cliente.leerPerfil()).rejects.toMatchObject({ reintentarEnS: 12 });
  });
  it('un 502 con HTML de un proxy es error_interno, sin filtrar el cuerpo', async () => {
    const { cliente } = armar(() => new Response('<html>bad gateway</html>', { status: 502 }));
    const e = await cliente.leerPerfil().catch((x: unknown) => x);
    expect(e).toMatchObject({ codigo: 'error_interno', status: 502 });
    expect(JSON.stringify(e)).not.toContain('bad gateway');
  });
  it('un 200 con un cuerpo que no es JSON es respuesta_invalida', async () => {
    const { cliente } = armar(() => new Response('hola', { status: 200 }));
    await expect(cliente.leerPerfil()).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
  });
  it('un fallo de red es sin_conexion (status 0)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    const cliente = crearCliente({ fetchImpl, obtenerCsrf: () => null, alSesionVencida: vi.fn() });
    await expect(cliente.leerPerfil()).rejects.toMatchObject({ codigo: 'sin_conexion', status: 0 });
  });
  it('un pedido cancelado propaga AbortError y no se confunde con una caída de red', async () => {
    const ac = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>((_u, init) => new Promise((_ok, no) => {
      init?.signal?.addEventListener('abort', () => { no(new DOMException('x', 'AbortError')); });
    }));
    const cliente = crearCliente({ fetchImpl, obtenerCsrf: () => null, alSesionVencida: vi.fn() });
    const p = cliente.leerCatalogoTextos(ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('respeta el prefijo de la API (baseUrl)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({})));
    const cliente = crearCliente({ baseUrl: '/api', fetchImpl, obtenerCsrf: () => null, alSesionVencida: vi.fn() });
    await cliente.leerEnlace();
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/v1/panel/enlace');
  });
});
