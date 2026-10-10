// El servidor simulado es una pieza más del panel: si se aparta del contrato, el panel "anda" en desarrollo y se
// rompe contra el backend real. Cada respuesta del mock se valida contra contracts/schemas/*.schema.json.
import { describe, expect, it } from 'vitest';
import { CODIGO_TOTP_DEMO, CONTRASENA_DEMO, CUENTAS_DEMO, crearServidorMock, type ServidorMock } from '../mock/servidor';
import { MENSAJES_ERROR, VERSION_CATALOGO_ERRORES } from '../api/generado/errores';
import { catalogoDeErroresDelContrato, problemasContraEsquema } from './esquemas';
import { abrirSesionEnMock, llamarMock } from './ayudas';

async function cuerpo(r: Response): Promise<unknown> {
  return r.json();
}

async function conReautenticacion(s: ServidorMock, csrf: string): Promise<void> {
  const r = await llamarMock(s, csrf, 'POST', '/v1/panel/reautenticacion', { contrasena: CONTRASENA_DEMO, codigo_totp: CODIGO_TOTP_DEMO });
  expect(r.status).toBe(200);
}

describe('el servidor simulado cumple el contrato 0.1.4', () => {
  it('login y TOTP devuelven LoginPaso y SesionPanel válidos', async () => {
    const s = crearServidorMock();
    const f = s.fetch as unknown as (u: string, i: RequestInit) => Promise<Response>;
    const h = { 'Content-Type': 'application/json' };
    const paso = await f('/v1/panel/sesion', { method: 'POST', headers: h, body: JSON.stringify({ email: CUENTAS_DEMO[0]!.email, contrasena: CONTRASENA_DEMO }) });
    expect(paso.status).toBe(200);
    expect(paso.headers.get('Set-Cookie')).toMatch(/^__Host-vc_panel=.*Secure; HttpOnly; SameSite=Strict; Path=\/$/);
    const pasoJson = (await cuerpo(paso)) as { csrf_token: string };
    expect(problemasContraEsquema('LoginPaso', pasoJson)).toEqual([]);
    const ses = await f('/v1/panel/sesion/totp', { method: 'POST', headers: { ...h, 'X-CSRF-Token': pasoJson.csrf_token }, body: JSON.stringify({ codigo: CODIGO_TOTP_DEMO }) });
    expect(problemasContraEsquema('SesionPanel', await cuerpo(ses))).toEqual([]);
  });

  it('GET /v1/panel/sesion después del login es SesionPanel válida', async () => {
    const s = crearServidorMock();
    await abrirSesionEnMock(s);
    const r = await llamarMock(s, '', 'GET', '/v1/panel/sesion');
    expect(problemasContraEsquema('SesionPanel', await cuerpo(r))).toEqual([]);
  });

  it('el catálogo de textos es CatalogoTextos válido y trae un texto por cada código de error', async () => {
    const s = crearServidorMock();
    const datos = (await cuerpo(await llamarMock(s, '', 'GET', '/v1/textos'))) as { textos: Record<string, string> };
    expect(problemasContraEsquema('CatalogoTextos', datos)).toEqual([]);
    for (const codigo of Object.keys(MENSAJES_ERROR)) expect(datos.textos).toHaveProperty(`error.${codigo}`);
  });

  it('el perfil, su actualización y la exportación son válidos', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s);
    const perfil = await cuerpo(await llamarMock(s, csrf, 'GET', '/v1/panel/perfil'));
    expect(problemasContraEsquema('PerfilAsesor', perfil)).toEqual([]);
    const nuevo = await cuerpo(await llamarMock(s, csrf, 'PATCH', '/v1/panel/perfil', { nombre_visible: 'Juan Pérez', zonas: ['cobo'] }));
    expect(problemasContraEsquema('PerfilAsesor', nuevo)).toEqual([]);
    await conReautenticacion(s, csrf);
    const exp = await llamarMock(s, csrf, 'POST', '/v1/panel/mi-cuenta/exportacion');
    expect(exp.status).toBe(200);
    expect(problemasContraEsquema('ExportacionMiCuenta', await cuerpo(exp))).toEqual([]);
  });

  it('todas las páginas del listado de cotizaciones son ListadoCotizaciones válido', async () => {
    const s = crearServidorMock({ cantidadConsultas: 45 });
    const { csrf } = await abrirSesionEnMock(s);
    let cursor: string | undefined;
    let total = 0;
    do {
      const r = await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones?limite=20${cursor ? `&cursor=${cursor}` : ''}`);
      const pagina = (await cuerpo(r)) as { items: unknown[]; siguiente_cursor?: string };
      expect(problemasContraEsquema('ListadoCotizaciones', pagina)).toEqual([]);
      total += pagina.items.length;
      cursor = pagina.siguiente_cursor;
    } while (cursor);
    expect(total).toBe(45);
  });

  it('el detalle de cada consulta es SesionDetalle válido y no trae código de referencia, derivación ni contacto_disponible', async () => {
    const s = crearServidorMock({ cantidadConsultas: 45 });
    const { csrf } = await abrirSesionEnMock(s);
    const propias = s.consultasDe(CUENTAS_DEMO[0]!.asesorId);
    expect(propias).toHaveLength(45);
    for (const fila of propias) {
      const r = await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`);
      const d = (await cuerpo(r)) as Record<string, unknown>;
      expect(problemasContraEsquema('SesionDetalle', d), fila.detalle.sesion_id).toEqual([]);
      expect(d).not.toHaveProperty('codigo_referencia');
      expect(d).not.toHaveProperty('derivacion');
      expect(d).not.toHaveProperty('contacto_disponible');
    }
  });

  it('el contacto del cliente es ContactoCliente válido y el límite diario responde 429 limite_lecturas_contacto', async () => {
    const s = crearServidorMock({ limiteLecturasContacto: 3 });
    const { csrf } = await abrirSesionEnMock(s);
    const conContacto = s.consultasDe(CUENTAS_DEMO[0]!.asesorId).filter((f) => f.contactoDisponible);
    expect(conContacto.length).toBeGreaterThan(3);
    const restantes: number[] = [];
    for (const fila of conContacto.slice(0, 3)) {
      const c = (await cuerpo(await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}/contacto`))) as { lectura: { lecturas_restantes_hoy: number } };
      expect(problemasContraEsquema('ContactoCliente', c)).toEqual([]);
      restantes.push(c.lectura.lecturas_restantes_hoy);
    }
    expect(restantes).toEqual([2, 1, 0]);
    const r = await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${conContacto[3]!.detalle.sesion_id}/contacto`);
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('3600');
    const e = (await cuerpo(r)) as { codigo: string };
    expect(e.codigo).toBe('limite_lecturas_contacto');
    expect(problemasContraEsquema('Error', e)).toEqual([]);
  });

  it('los registros (con lecturas nuevas incluidas) son ListadoRegistros válido', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s);
    const fila = s.consultasDe(CUENTAS_DEMO[0]!.asesorId)[1]!;
    await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`);
    const r = (await cuerpo(await llamarMock(s, csrf, 'GET', '/v1/panel/registros'))) as { items: { accion: string; recurso_id?: string }[] };
    expect(problemasContraEsquema('ListadoRegistros', r)).toEqual([]);
    expect(r.items[0]).toMatchObject({ accion: 'ver_detalle', recurso_id: fila.detalle.sesion_id });
    expect(r.items[1]).toMatchObject({ accion: 'inicio_sesion' });
  });

  it('el consumo, mensual y de meses anteriores, es Consumo válido con alerta coherente', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s);
    for (const periodo of ['', '?periodo=2026-09', '?periodo=2026-02']) {
      const c = (await cuerpo(await llamarMock(s, csrf, 'GET', `/v1/panel/consumo${periodo}`))) as { diario: unknown[] };
      expect(problemasContraEsquema('Consumo', c), periodo).toEqual([]);
    }
    s.forzarConsumo({ segundos_usados: 30000 });
    const lleno = (await cuerpo(await llamarMock(s, csrf, 'GET', '/v1/panel/consumo'))) as { alerta: string };
    expect(lleno.alerta).toBe('p100');
  });

  it('el enlace, su rotación y las claves del widget son válidos; el valor completo sale solo al crear', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s, CUENTAS_DEMO[1]!.email);
    expect(problemasContraEsquema('EnlaceCompartir', await cuerpo(await llamarMock(s, csrf, 'GET', '/v1/panel/enlace')))).toEqual([]);
    await conReautenticacion(s, csrf);
    expect(problemasContraEsquema('EnlaceCompartir', await cuerpo(await llamarMock(s, csrf, 'POST', '/v1/panel/enlace/rotacion')))).toEqual([]);
    const crear = await llamarMock(s, csrf, 'POST', '/v1/panel/claves-widget', { nombre: 'Sitio nuevo', origins: ['https://www.nuevo.com.ar'] });
    expect(crear.status).toBe(201);
    const creada = (await cuerpo(crear)) as { valor: string };
    expect(problemasContraEsquema('ClaveWidgetCreada', creada)).toEqual([]);
    const lista = await cuerpo(await llamarMock(s, csrf, 'GET', '/v1/panel/claves-widget'));
    expect(problemasContraEsquema('ListadoClavesWidget', lista)).toEqual([]);
    expect(JSON.stringify(lista)).not.toContain(creada.valor);
  });

  it('cada error del mock es Error (problem+json) válido y su status coincide con catalogo-errores.json', async () => {
    const catalogo = catalogoDeErroresDelContrato();
    const s = crearServidorMock();
    const f = s.fetch as unknown as (u: string, i: RequestInit) => Promise<Response>;
    const casos: [string, string, RequestInit][] = [
      ['GET', '/v1/panel/perfil', {}],
      ['POST', '/v1/panel/sesion', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@y.zz', contrasena: 'incorrecta-incorrecta' }) }],
      ['POST', '/v1/panel/sesion', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'malo', contrasena: 'c' }) }],
      ['POST', '/v1/panel/sesion', { headers: { 'Content-Type': 'text/plain' }, body: 'hola' }],
      ['POST', '/v1/panel/sesion', { headers: { 'Content-Type': 'application/json' }, body: '{no es json' }],
      ['GET', '/v1/no-existe', {}],
    ];
    const vistos = new Set<string>();
    for (const [metodo, ruta, init] of casos) {
      const r = await f(ruta, { method: metodo, ...init });
      expect(r.headers.get('Content-Type')).toBe('application/problem+json');
      const e = (await cuerpo(r)) as { codigo: string; status: number };
      expect(problemasContraEsquema('Error', e), `${metodo} ${ruta}`).toEqual([]);
      expect(e.status).toBe(r.status);
      expect(catalogo.errores[e.codigo]?.http, e.codigo).toBe(r.status);
      vistos.add(e.codigo);
    }
    expect([...vistos].sort()).toEqual(['credencial_ausente', 'credenciales_incorrectas', 'no_encontrado', 'solicitud_invalida', 'tipo_de_contenido_no_soportado', 'validacion_fallida']);
  });

  it('los mensajes de error generados para el panel coinciden con catalogo-errores.json', () => {
    const catalogo = catalogoDeErroresDelContrato();
    expect(VERSION_CATALOGO_ERRORES).toBe(catalogo.version);
    expect(Object.keys(MENSAJES_ERROR).sort()).toEqual(Object.keys(catalogo.errores).sort());
    for (const [codigo, e] of Object.entries(catalogo.errores)) expect(MENSAJES_ERROR[codigo]).toBe(e.mensaje);
  });
});
