import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENSAJES_ERROR } from '../api/generado/errores';
import { CODIGO_TOTP_DEMO, CONTRASENA_DEMO, montarApp, reautenticarEnDialogo, sinViolacionesDeAccesibilidad, type AppMontada } from '../test/ayudas';

const NUEVA = 'otra-frase-bien-larga-0';

/** Pide cambiar la contraseña: el mock contesta 401 reautenticacion_requerida porque no hay ventana vigente. */
async function pedirCambioDeContrasena(app: AppMontada) {
  await app.user.type(await screen.findByLabelText('Contraseña nueva'), NUEVA);
  await app.user.type(screen.getByLabelText('Repetí la contraseña nueva'), NUEVA);
  await app.user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

const dialogo = () => screen.findByRole('dialog', { name: 'Confirmá tu identidad' });
const contarPedidos = (app: AppMontada, metodo: string, ruta: string) => app.servidor.pedidos.filter((p) => p.metodo === metodo && p.ruta === ruta).length;

describe('reautenticación en acciones sensibles', () => {
  it('cuando el servidor pide confirmar identidad abre el diálogo, con el foco en la contraseña y el resto inerte, sin mostrar un error', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const d = await dialogo();
    expect(within(d).getByLabelText('Contraseña')).toHaveFocus();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleDescription(/Esta acción es sensible/);
    expect(app.container).toHaveAttribute('inert');
    expect(screen.queryByText(MENSAJES_ERROR.reautenticacion_requerida!)).not.toBeInTheDocument();
  });

  it('si la contraseña y el código son correctos, repite la acción UNA vez y la completa', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await reautenticarEnDialogo(app.user);
    expect(await screen.findByText('Cambiaste tu contraseña. Las demás sesiones abiertas se cerraron.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(contarPedidos(app, 'POST', '/v1/panel/contrasena')).toBe(2);
    expect(contarPedidos(app, 'POST', '/v1/panel/reautenticacion')).toBe(1);
    expect(app.servidor.contrasenaDe('juan@asesores.local')).toBe(NUEVA);
    expect(app.container).not.toHaveAttribute('inert');
  });

  it('con la contraseña equivocada deja el diálogo abierto, avisa, vacía el código y NO repite la acción', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await reautenticarEnDialogo(app.user, 'contrasena-equivocada');
    const alerta = await within(await dialogo()).findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.credenciales_incorrectas!);
    expect(alerta).toHaveFocus();
    expect(screen.getByLabelText('Código de verificación')).toHaveValue('');
    expect(contarPedidos(app, 'POST', '/v1/panel/contrasena')).toBe(1);
    // y se puede corregir
    await app.user.type(screen.getByLabelText('Código de verificación'), CODIGO_TOTP_DEMO);
    await app.user.clear(screen.getByLabelText('Contraseña'));
    await app.user.type(screen.getByLabelText('Contraseña'), CONTRASENA_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Cambiaste tu contraseña/)).toBeInTheDocument();
  });

  it('con un código equivocado muestra el error del código', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await reautenticarEnDialogo(app.user, CONTRASENA_DEMO, '000000');
    expect(await within(await dialogo()).findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.totp_invalido!);
    expect(contarPedidos(app, 'POST', '/v1/panel/contrasena')).toBe(1);
  });

  it('valida los campos antes de molestar al servidor', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const d = await dialogo();
    await app.user.click(within(d).getByRole('button', { name: 'Confirmar' }));
    expect(within(d).getByText('Ingresá tu contraseña (tiene al menos 12 caracteres).')).toBeInTheDocument();
    expect(within(d).getByLabelText('Contraseña')).toHaveFocus();
    await app.user.type(within(d).getByLabelText('Contraseña'), CONTRASENA_DEMO);
    await app.user.type(within(d).getByLabelText('Código de verificación'), '12');
    await app.user.click(within(d).getByRole('button', { name: 'Confirmar' }));
    expect(within(d).getByText('El código tiene 6 números.')).toBeInTheDocument();
    expect(within(d).getByLabelText('Código de verificación')).toHaveFocus();
    expect(contarPedidos(app, 'POST', '/v1/panel/reautenticacion')).toBe(0);
  });

  it('Escape cancela: no hace la acción, no muestra error y devuelve el foco al botón que la pidió', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await dialogo();
    await app.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toHaveFocus();
    expect(app.servidor.contrasenaDe('juan@asesores.local')).toBe(CONTRASENA_DEMO);
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue(NUEVA);
  });

  it('"Cancelar" hace lo mismo que Escape', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await app.user.click(within(await dialogo()).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el foco queda atrapado en el diálogo: Tab y Mayús+Tab dan la vuelta', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const d = await dialogo();
    const contrasena = within(d).getByLabelText('Contraseña');
    const cancelar = within(d).getByRole('button', { name: 'Cancelar' });
    expect(contrasena).toHaveFocus();
    await app.user.tab({ shift: true });
    expect(cancelar).toHaveFocus();
    await app.user.tab();
    expect(contrasena).toHaveFocus();
    await app.user.tab();
    await app.user.tab();
    await app.user.tab();
    await app.user.tab();
    expect(d).toContainElement(document.activeElement as HTMLElement);
  });

  it('se confirma con Enter', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const d = await dialogo();
    await app.user.type(within(d).getByLabelText('Contraseña'), CONTRASENA_DEMO);
    await app.user.type(within(d).getByLabelText('Código de verificación'), `${CODIGO_TOTP_DEMO}{Enter}`);
    expect(await screen.findByText(/Cambiaste tu contraseña/)).toBeInTheDocument();
  });

  it('no manda dos reautenticaciones si se confirma dos veces seguidas', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const retenido = app.servidor.retener('/v1/panel/reautenticacion', 'POST');
    const d = await dialogo();
    await app.user.type(within(d).getByLabelText('Contraseña'), CONTRASENA_DEMO);
    await app.user.type(within(d).getByLabelText('Código de verificación'), CODIGO_TOTP_DEMO);
    await app.user.click(within(d).getByRole('button', { name: 'Confirmar' }));
    expect(await within(d).findByRole('button', { name: 'Verificando…' })).toHaveAttribute('aria-disabled', 'true');
    await app.user.click(within(d).getByRole('button', { name: 'Verificando…' }));
    await app.user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // mientras verifica no se puede cerrar
    retenido.liberar();
    await screen.findByText(/Cambiaste tu contraseña/);
    expect(contarPedidos(app, 'POST', '/v1/panel/reautenticacion')).toBe(1);
  });

  it('si la sesión venció mientras el diálogo estaba abierto, cierra todo y manda a Ingresar', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await dialogo();
    app.servidor.vencerSesion();
    await reautenticarEnDialogo(app.user);
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ERROR.sesion_vencida!);
    expect(document.body).not.toHaveAttribute('inert');
    expect(app.servidor.contrasenaDe('juan@asesores.local')).toBe(CONTRASENA_DEMO);
  });

  it('con la ventana de confirmación vigente no vuelve a preguntar en la acción siguiente', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await reautenticarEnDialogo(app.user);
    await screen.findByText(/Cambiaste tu contraseña/);
    await app.user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await screen.findByText(/Descargamos tus datos en el archivo/);
    expect(contarPedidos(app, 'POST', '/v1/panel/reautenticacion')).toBe(1);
  });

  it('cuando la ventana se cierra, vuelve a pedir la confirmación', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await reautenticarEnDialogo(app.user);
    await screen.findByText(/Cambiaste tu contraseña/);
    app.servidor.cerrarVentanaReautenticacion();
    await app.user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    expect(await dialogo()).toBeInTheDocument();
  });

  it('si el servidor limita los intentos, el diálogo lo dice con la espera', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    app.servidor.inyectarFalla({ ruta: '/v1/panel/reautenticacion', status: 429, codigo: 'intentos_excedidos', reintentarEnS: 30 });
    await reautenticarEnDialogo(app.user);
    expect(await within(await dialogo()).findByRole('alert')).toHaveTextContent(`${MENSAJES_ERROR.intentos_excedidos!} Podés reintentar en 30 s.`);
  });

  it('si la acción falla por otra causa después de confirmar, muestra ese error', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    await dialogo();
    app.servidor.inyectarFalla({ ruta: '/v1/panel/contrasena', status: 500, codigo: 'error_interno' });
    await reautenticarEnDialogo(app.user);
    await waitFor(() => { expect(screen.getByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el diálogo no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await montarApp({ ruta: '/perfil/cuenta' });
    await pedirCambioDeContrasena(app);
    const d = await dialogo();
    await sinViolacionesDeAccesibilidad(d);
  });
});
