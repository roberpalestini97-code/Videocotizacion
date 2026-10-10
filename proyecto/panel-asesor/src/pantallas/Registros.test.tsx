import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENSAJES_ERROR } from '../api/generado/errores';
import { crearServidorMock } from '../mock/servidor';
import { ASESOR, abrirSesionEnMock, esperarCarga, llamarMock, montarApp, sinViolacionesDeAccesibilidad } from '../test/ayudas';

const filasDeDatos = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('Registros', () => {
  it('lista lo que hiciste, del más nuevo al más viejo, con el título enfocado', async () => {
    await montarApp({ ruta: '/registros' });
    expect(await screen.findByRole('heading', { name: 'Registros' })).toHaveFocus();
    await esperarCarga();
    const filas = filasDeDatos();
    // 3 ingresos anteriores del mock + el de esta sesión.
    expect(filas).toHaveLength(4);
    for (const f of filas) expect(f).toHaveTextContent('Ingresaste al panel');
    const tiempos = filas.map((f) => within(f).getByRole('time').getAttribute('datetime')!);
    expect([...tiempos].sort().reverse()).toEqual(tiempos);
    expect(screen.getByRole('table', { name: 'Registros de actividad, del más nuevo al más viejo' })).toBeInTheDocument();
  });

  it('explica que es solo de agregar y que no guarda datos del cliente, y no ofrece borrar ni editar', async () => {
    await montarApp({ ruta: '/registros' });
    await esperarCarga();
    expect(screen.getByText(/Solo se agrega: nadie puede borrar ni editar una fila\./)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryAllByRole('button')).toHaveLength(0);
  });

  it('cada acción se escribe en castellano y las consultas llevan a su detalle', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s);
    const fila = s.consultasDe(ASESOR.asesorId).find((f) => f.contactoDisponible)!;
    await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`);
    await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}/contacto`);
    await montarApp({ servidor: s, conSesion: false, ruta: '/registros' }); // la sesión ya está abierta en el mock
    await esperarCarga();
    const filas = filasDeDatos();
    expect(filas[0]).toHaveTextContent('Viste el contacto de un cliente');
    expect(filas[1]).toHaveTextContent('Viste el detalle de una cotización');
    const enlace = within(filas[0]!).getByRole('link', { name: new RegExp(fila.detalle.sesion_id) });
    expect(enlace).toHaveAttribute('href', `/cotizaciones/${fila.detalle.sesion_id}`);
  });

  it('un recurso que no es una consulta se muestra como código, sin enlace; sin recurso, un guion', async () => {
    const s = crearServidorMock();
    const lectura = (accion: string, recurso?: string) => ({ registro_id: 'reg_916KPKQ91R99GN90D0SN9M59QR', ocurrido_en: '2026-10-08T13:00:00Z', asesor_id: ASESOR.asesorId, accion, ...(recurso ? { recurso_id: recurso } : {}) });
    s.inyectarFalla({ ruta: '/v1/panel/registros', respuestaJson: { items: [lectura('crear_clave_widget', 'cpw_F47FE4NAE2YBQ039R346YGWPPB'), lectura('rotar_enlace'), lectura('cambio_contrasena')] } });
    await montarApp({ servidor: s, ruta: '/registros' });
    await esperarCarga();
    const filas = filasDeDatos();
    expect(filas[0]).toHaveTextContent('Creaste una clave del widget');
    expect(within(filas[0]!).getByText('cpw_F47FE4NAE2YBQ039R346YGWPPB')).toBeInTheDocument();
    expect(within(filas[0]!).queryByRole('link')).not.toBeInTheDocument();
    expect(filas[1]).toHaveTextContent('Cambiaste tu enlace para compartir');
    expect(within(filas[1]!).getByText('—')).toBeInTheDocument();
    expect(filas[2]).toHaveTextContent('Cambiaste tu contraseña');
  });

  it('pagina con "Cargar registros más viejos" y pasa el foco a la primera fila nueva', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s);
    const fila = s.consultasDe(ASESOR.asesorId)[1]!;
    for (let i = 0; i < 56; i += 1) await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`);
    const app = await montarApp({ servidor: s, conSesion: false, ruta: '/registros' });
    await esperarCarga();
    expect(filasDeDatos()).toHaveLength(50);
    await app.user.click(screen.getByRole('button', { name: 'Cargar registros más viejos' }));
    await waitFor(() => { expect(filasDeDatos()).toHaveLength(60); });
    expect(within(filasDeDatos()[50]!).getAllByRole('cell')[0]).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Cargar registros más viejos' })).not.toBeInTheDocument();
    expect(screen.getByText('No hay registros más viejos.')).toBeInTheDocument();
  });

  it('sin registros lo dice', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/registros', respuestaJson: { items: [] } });
    await montarApp({ servidor: s, ruta: '/registros' });
    expect(await screen.findByText('Todavía no hay registros')).toBeInTheDocument();
  });

  it('si no carga muestra el error y permite reintentar', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/registros', status: 500, codigo: 'error_interno' });
    const app = await montarApp({ servidor: s, ruta: '/registros' });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => { expect(filasDeDatos()).toHaveLength(4); });
  });

  it('cada asesor ve solo sus propios registros', async () => {
    const s = crearServidorMock();
    const { csrf } = await abrirSesionEnMock(s, 'admin@asesores.local');
    const fila = s.consultasDe('ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5')[0]!;
    await llamarMock(s, csrf, 'GET', `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`);
    expect(s.registrosDe(ASESOR.asesorId).some((r) => r.accion === 'ver_detalle')).toBe(false);
    await montarApp({ servidor: s, conSesion: false, ruta: '/registros' });
    await esperarCarga();
    expect(filasDeDatos()).toHaveLength(5);
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await esperarCarga();
    await sinViolacionesDeAccesibilidad(app.container);
  });
});
