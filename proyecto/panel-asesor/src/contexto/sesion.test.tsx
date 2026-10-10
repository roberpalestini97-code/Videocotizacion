import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJES_ERROR } from '../api/generado/errores';
import { crearServidorMock } from '../mock/servidor';
import { ASESOR, montarApp, esperarCarga, usarRelojFalso } from '../test/ayudas';

describe('sesión del panel', () => {
  it('al recargar con la cookie viva entra directo, sin pedir ingresar de nuevo', async () => {
    await montarApp({ ruta: '/registros' });
    expect(await screen.findByRole('heading', { name: 'Registros' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it('al recargar recupera el CSRF del servidor: las escrituras funcionan', async () => {
    const app = await montarApp({ ruta: '/perfil' });
    await esperarCarga();
    const nombre = await screen.findByLabelText('Nombre visible');
    await app.user.clear(nombre);
    await app.user.type(nombre, 'Juan Pérez');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Guardamos tus datos.')).toBeInTheDocument();
    const patch = app.servidor.pedidos.find((p) => p.metodo === 'PATCH')!;
    expect(patch.csrf).toBeTruthy();
    expect(patch.csrf).toBe(app.csrf);
  });

  it('sin cookie manda a Ingresar y se acuerda de la página pedida', async () => {
    await montarApp({ conSesion: false, ruta: '/registros' });
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.queryByText(MENSAJES_ERROR.sesion_vencida!)).not.toBeInTheDocument();
  });

  it('si el servidor no responde al arrancar muestra el error y deja reintentar', async () => {
    const servidor = crearServidorMock();
    servidor.inyectarFalla({ ruta: '/v1/panel/sesion', metodo: 'GET', status: 503, codigo: 'servicio_no_disponible' });
    const app = await montarApp({ servidor, conSesion: false });
    expect(await screen.findByText(MENSAJES_ERROR.servicio_no_disponible!)).toBeInTheDocument();
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
  });

  it('si la sesión vence mientras se usa, vuelve a Ingresar y lo explica', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await screen.findByRole('heading', { name: 'Registros' });
    await esperarCarga();
    app.servidor.vencerSesion();
    await app.user.click(screen.getByRole('link', { name: 'Perfil' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ERROR.sesion_vencida!);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('si la sesión fue revocada (credencial inválida) también vuelve a Ingresar', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await esperarCarga();
    app.servidor.revocarSesion();
    await app.user.click(screen.getByRole('link', { name: 'Mis cotizaciones' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ERROR.sesion_vencida!);
  });

  it('después de vencida, ingresar de nuevo funciona y vuelve a la pantalla donde estaba', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await esperarCarga();
    app.servidor.vencerSesion();
    await app.user.click(screen.getByRole('link', { name: 'Perfil' }));
    await screen.findByRole('heading', { name: 'Ingresá a tu panel' });
    await app.user.type(screen.getByLabelText('Correo electrónico'), ASESOR.email);
    await app.user.type(screen.getByLabelText('Contraseña'), 'frase-larga-de-demo-0');
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    await app.user.type(await screen.findByLabelText('Código de verificación'), '123456');
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
  });

  it('avisa dos minutos antes del vencimiento absoluto y cierra la sesión al llegar', async () => {
    usarRelojFalso();
    const app = await montarApp({ ruta: '/cotizaciones', relojFalso: true });
    await screen.findByRole('heading', { name: 'Mis cotizaciones' });
    expect(screen.queryByText(/Tu sesión se cierra a las/)).not.toBeInTheDocument();
    // La sesión del mock dura 12 h.
    // A 3 minutos del final todavía NO avisa (el aviso es a los 2).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 3_600_000 - 3 * 60_000);
    });
    expect(screen.queryByText(/Tu sesión se cierra a las/)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(60_000 + 1000);
    const aviso = await screen.findByText(/Tu sesión se cierra a las/);
    expect(aviso).toHaveTextContent(/después vas a\s+tener que ingresar de nuevo/);
    expect(app.container.querySelector('.banda [role="status"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ERROR.sesion_vencida!);
  });

  it('"Salir" cierra la sesión en el servidor (DELETE con CSRF) y lo confirma', async () => {
    const app = await montarApp();
    await esperarCarga();
    await app.user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cerraste tu sesión.');
    const borrado = app.servidor.pedidos.find((p) => p.metodo === 'DELETE')!;
    expect(borrado).toMatchObject({ ruta: '/v1/panel/sesion' });
    expect(borrado.csrf).toBeTruthy();
  });

  it('si la sesión ya no existía en el servidor, "Salir" igual termina de salir', async () => {
    const app = await montarApp();
    await esperarCarga();
    app.servidor.vencerSesion();
    await app.user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
  });

  it('si el servidor falla al salir, sigue adentro y lo avisa (no miente diciendo que saliste)', async () => {
    const app = await montarApp();
    await esperarCarga();
    app.servidor.inyectarFalla({ ruta: '/v1/panel/sesion', metodo: 'DELETE', status: 500, codigo: 'error_interno' });
    await app.user.click(screen.getByRole('button', { name: 'Salir' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    expect(alerta).toHaveFocus();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    // y se puede volver a intentar
    await app.user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
  });

  it('el menú muestra el nombre de quien ingresó', async () => {
    await montarApp();
    const cabecera = await screen.findByRole('banner');
    expect(within(cabecera).getByText(ASESOR.nombreVisible)).toBeInTheDocument();
  });
});
