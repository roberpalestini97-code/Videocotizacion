import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJES_ERROR } from '../../api/generado/errores';
import { crearServidorMock } from '../../mock/servidor';
import { ADMIN, CODIGO_TOTP_DEMO, CONTRASENA_DEMO, esperarCarga, llamarMock, montarApp, reautenticarEnDialogo, sinViolacionesDeAccesibilidad, type AppMontada } from '../../test/ayudas';
import { parsearOrigins } from './EnlaceYClaves';

async function abrir(opciones: Parameters<typeof montarApp>[0] = {}) {
  const app = await montarApp({ ruta: '/perfil/widget', ...opciones });
  await screen.findByLabelText('Enlace');
  await esperarCarga();
  return app;
}
const abrirAdmin = (opciones: Parameters<typeof montarApp>[0] = {}) => abrir({ email: ADMIN.email, ...opciones });

async function reautenticarPorFuera(app: AppMontada) {
  await llamarMock(app.servidor, app.csrf!, 'POST', '/v1/panel/reautenticacion', { contrasena: CONTRASENA_DEMO, codigo_totp: CODIGO_TOTP_DEMO });
}

describe('Enlace para compartir', () => {
  it('muestra el enlace del profesional y el texto listo para compartir', async () => {
    const app = await abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Enlace y claves del widget' })).toHaveFocus();
    const url = screen.getByLabelText<HTMLInputElement>('Enlace');
    expect(url.value).toMatch(/^https:\/\/cotizar\.videocotizacion\.local\/c\/[A-Za-z0-9_-]{22}$/);
    expect(url).toHaveAttribute('readonly');
    const texto = screen.getByLabelText<HTMLTextAreaElement>('Texto para compartir');
    expect(texto.value).toBe(`Pedí tu presupuesto por videollamada: ${url.value}`);
    expect(app.servidor.pedidos.filter((p) => p.ruta === '/v1/panel/enlace')).toHaveLength(1);
  });

  it('"Copiar enlace" y "Copiar texto" copian lo que corresponde y lo confirman', async () => {
    const app = await abrir();
    const url = (screen.getByLabelText<HTMLInputElement>('Enlace')).value;
    await app.user.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    expect(await screen.findByText('Copiado.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(url);
    await app.user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await waitFor(() => { expect(screen.getAllByText('Copiado.')).toHaveLength(2); });
    expect(await navigator.clipboard.readText()).toBe(`Pedí tu presupuesto por videollamada: ${url}`);
  });

  it('si el navegador no deja copiar, pide copiar a mano', async () => {
    const app = await abrir();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denegado'));
    await app.user.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    expect(await screen.findByText('No pudimos copiar: seleccioná el texto y copialo a mano.')).toBeInTheDocument();
  });

  it('el aviso de copiado es un estado que los lectores de pantalla anuncian', async () => {
    const app = await abrir();
    await app.user.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    const estado = await screen.findByText('Copiado.');
    expect(estado).toHaveAttribute('role', 'status');
  });

  it('"Compartir por WhatsApp" arma un enlace de wa.me con el texto codificado, abre en otra pestaña y lo avisa', async () => {
    await abrir();
    const texto = (screen.getByLabelText<HTMLTextAreaElement>('Texto para compartir')).value;
    const enlace = screen.getByRole('link', { name: /Compartir por WhatsApp/ });
    expect(enlace).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(texto)}`);
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    expect(enlace).toHaveAccessibleName('Compartir por WhatsApp (se abre en otra pestaña)');
  });

  it('generar un enlace nuevo pide confirmar primero, con el foco en "Cancelar" (la opción segura)', async () => {
    const app = await abrir();
    await app.user.click(screen.getByRole('button', { name: 'Generar un enlace nuevo' }));
    const d = await screen.findByRole('dialog', { name: '¿Generar un enlace nuevo?' });
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(d).toHaveAccessibleDescription(/El enlace actual va a dejar de funcionar/);
    await app.user.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.servidor.pedidos.some((p) => p.ruta === '/v1/panel/enlace/rotacion')).toBe(false);
    expect(screen.getByRole('button', { name: 'Generar un enlace nuevo' })).toHaveFocus();
  });

  it('Escape también cancela la confirmación', async () => {
    const app = await abrir();
    await app.user.click(screen.getByRole('button', { name: 'Generar un enlace nuevo' }));
    await screen.findByRole('dialog');
    await app.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al confirmar y reautenticar, cambia el enlace, anota la fecha y avisa que el anterior dejó de andar', async () => {
    const app = await abrir();
    const anterior = (screen.getByLabelText<HTMLInputElement>('Enlace')).value;
    await app.user.click(screen.getByRole('button', { name: 'Generar un enlace nuevo' }));
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sí, generar uno nuevo' }));
    await reautenticarEnDialogo(app.user);
    expect(await screen.findByText('Listo: tu enlace nuevo ya funciona y el anterior dejó de andar.')).toBeInTheDocument();
    const nuevo = (screen.getByLabelText<HTMLInputElement>('Enlace')).value;
    expect(nuevo).not.toBe(anterior);
    expect((screen.getByLabelText<HTMLTextAreaElement>('Texto para compartir')).value).toContain(nuevo);
    expect(screen.getByText(/Último cambio de enlace:/)).toBeInTheDocument();
    expect(app.servidor.registrosDe('ase_5M2N9BKVB4MKP71EPBCDBWS8EV')[0]).toMatchObject({ accion: 'rotar_enlace' });
  });

  it('si en la reautenticación se arrepiente, el enlace queda como estaba', async () => {
    const app = await abrir();
    const anterior = (screen.getByLabelText<HTMLInputElement>('Enlace')).value;
    await app.user.click(screen.getByRole('button', { name: 'Generar un enlace nuevo' }));
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sí, generar uno nuevo' }));
    await screen.findByRole('dialog', { name: 'Confirmá tu identidad' });
    await app.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((screen.getByLabelText<HTMLInputElement>('Enlace')).value).toBe(anterior);
  });

  it('si no carga el enlace lo dice y permite reintentar', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/enlace', status: 500, codigo: 'error_interno' });
    const app = await montarApp({ servidor: s, ruta: '/perfil/widget' });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Enlace')).toBeInTheDocument();
  });
});

describe('Claves del widget', () => {
  it('quien no es administrador no ve las claves ni las pide al servidor', async () => {
    const app = await abrir();
    expect(screen.getByText('Las claves del widget las gestionan los administradores de tu equipo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear clave' })).not.toBeInTheDocument();
    expect(app.servidor.pedidos.some((p) => p.ruta === '/v1/panel/claves-widget')).toBe(false);
  });

  it('un administrador ve las claves con prefijo (nunca el valor entero), sitios, estado y último uso', async () => {
    await abrirAdmin();
    const tabla = await screen.findByRole('table', { name: 'Claves del widget' });
    const activa = within(tabla).getByRole('row', { name: /Sitio principal/ });
    expect(within(activa).getByText('vc_pub_NlwcBG…')).toBeInTheDocument();
    expect(within(activa).getByText('https://www.minegocio.com.ar')).toBeInTheDocument();
    expect(within(activa).getByText('Activa')).toBeInTheDocument();
    expect(within(activa).queryByText('Nunca')).not.toBeInTheDocument();
    const revocada = within(tabla).getByRole('row', { name: /Sitio viejo/ });
    expect(within(revocada).getByText(/^Revocada el /)).toBeInTheDocument();
    expect(within(revocada).getByText('Nunca')).toBeInTheDocument();
    expect(within(revocada).queryByRole('button')).not.toBeInTheDocument();
    expect(within(activa).getByRole('button', { name: 'Revocar la clave Sitio principal' })).toBeInTheDocument();
  });

  it('un 403 del servidor (alcance insuficiente) se muestra como error, no como pantalla vacía', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/claves-widget', status: 403, codigo: 'alcance_insuficiente' });
    await montarApp({ servidor: s, email: ADMIN.email, ruta: '/perfil/widget' });
    expect(await screen.findByText(MENSAJES_ERROR.alcance_insuficiente!)).toBeInTheDocument();
  });

  it('valida el nombre y los sitios (https, sin barra final, sin comodines, sin repetidos) antes de pedir nada', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    const crear = () => app.user.click(screen.getByRole('button', { name: 'Crear clave' }));
    await crear();
    expect(screen.getByText('El nombre tiene entre 1 y 60 caracteres y no puede llevar < ni >.')).toBeInTheDocument();
    expect(screen.getByText('Indicá entre 1 y 10 sitios, uno por línea.')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByLabelText('Nombre de la clave')).toHaveFocus(); });
    await app.user.type(screen.getByLabelText('Nombre de la clave'), 'Sitio nuevo');
    const sitios = screen.getByLabelText('Sitios autorizados');
    for (const [malo, texto] of [
      ['http://inseguro.com.ar', /no es válido/],
      ['https://www.sitio.com.ar/', /no es válido/],
      ['https://*.sitio.com.ar', /no es válido/],
      ['https://a.com.ar\nhttps://a.com.ar', /Hay sitios repetidos\./],
    ] as const) {
      await app.user.clear(sitios);
      await app.user.type(sitios, malo);
      await crear();
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
    expect(app.servidor.pedidos.some((p) => p.metodo === 'POST' && p.ruta === '/v1/panel/claves-widget')).toBe(false);
  });

  it('crea la clave: pide confirmar identidad, muestra el valor completo UNA vez con el foco en el aviso, y la lista queda con el prefijo', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await app.user.type(screen.getByLabelText('Nombre de la clave'), 'Sitio nuevo');
    await app.user.type(screen.getByLabelText('Sitios autorizados'), 'https://www.nuevo.com.ar,\nhttps://tienda.nuevo.com.ar');
    await app.user.click(screen.getByRole('button', { name: 'Crear clave' }));
    await reautenticarEnDialogo(app.user);
    const valorInput = await screen.findByLabelText<HTMLInputElement>('Valor de la clave');
    expect(valorInput.value).toMatch(/^vc_pub_[A-Za-z0-9_-]{40}$/);
    const aviso = valorInput.closest('.clave-nueva')!;
    expect(aviso).toHaveFocus();
    expect(within(aviso as HTMLElement).getByText(/esta es la única vez que la vas a ver completa/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la clave')).toHaveValue('');
    const enviado = app.servidor.pedidos.find((p) => p.metodo === 'POST' && p.ruta === '/v1/panel/claves-widget')!;
    expect(enviado.cuerpo).toEqual({ nombre: 'Sitio nuevo', origins: ['https://www.nuevo.com.ar', 'https://tienda.nuevo.com.ar'] });
    // en la tabla solo el prefijo
    const tabla = screen.getByRole('table', { name: 'Claves del widget' });
    await waitFor(() => { expect(within(tabla).getByRole('row', { name: /Sitio nuevo/ })).toBeInTheDocument(); });
    expect(within(tabla).queryByText(valorInput.value)).not.toBeInTheDocument();
    // copiar
    await app.user.click(within(aviso as HTMLElement).getByRole('button', { name: 'Copiar clave' }));
    expect(await navigator.clipboard.readText()).toBe(valorInput.value);
    // "Ya la guardé" borra el valor de la pantalla
    const valor = valorInput.value;
    await app.user.click(within(aviso as HTMLElement).getByRole('button', { name: 'Ya la guardé' }));
    expect(screen.queryByLabelText('Valor de la clave')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(valor);
    expect(app.servidor.registrosDe(ADMIN.asesorId)[0]).toMatchObject({ accion: 'crear_clave_widget' });
  });

  it('si se cancela la confirmación de identidad no se crea ninguna clave', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await app.user.type(screen.getByLabelText('Nombre de la clave'), 'Sitio nuevo');
    await app.user.type(screen.getByLabelText('Sitios autorizados'), 'https://www.nuevo.com.ar');
    await app.user.click(screen.getByRole('button', { name: 'Crear clave' }));
    await screen.findByRole('dialog', { name: 'Confirmá tu identidad' });
    await app.user.keyboard('{Escape}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Valor de la clave')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la clave')).toHaveValue('Sitio nuevo');
    expect(screen.queryByRole('row', { name: /Sitio nuevo/ })).not.toBeInTheDocument();
  });

  it('muestra el error del servidor si la creación falla', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await reautenticarPorFuera(app);
    app.servidor.inyectarFalla({ ruta: '/v1/panel/claves-widget', metodo: 'POST', status: 422, codigo: 'validacion_fallida' });
    await app.user.type(screen.getByLabelText('Nombre de la clave'), 'Sitio nuevo');
    await app.user.type(screen.getByLabelText('Sitios autorizados'), 'https://www.nuevo.com.ar');
    await app.user.click(screen.getByRole('button', { name: 'Crear clave' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.validacion_fallida!);
  });

  it('revocar pide confirmación (foco en Cancelar), después la reautenticación, y deja la clave como revocada', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await app.user.click(screen.getByRole('button', { name: 'Revocar la clave Sitio principal' }));
    const d = await screen.findByRole('dialog', { name: '¿Revocar la clave "Sitio principal"?' });
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await app.user.click(within(d).getByRole('button', { name: 'Sí, revocar' }));
    await reautenticarEnDialogo(app.user);
    expect(await screen.findByText('Revocaste la clave "Sitio principal". Deja de funcionar en menos de un minuto.')).toBeInTheDocument();
    const fila = await screen.findByRole('row', { name: /Sitio principal/ });
    await waitFor(() => { expect(within(fila).getByText(/^Revocada el /)).toBeInTheDocument(); });
    expect(within(fila).queryByRole('button')).not.toBeInTheDocument();
    // La fila ya no tiene botón: el foco no se pierde en <body>, queda en el aviso de resultado.
    expect(screen.getByText(/^Revocaste la clave/).closest('[role="status"]')).toHaveFocus();
    expect(app.servidor.registrosDe(ADMIN.asesorId)[0]).toMatchObject({ accion: 'revocar_clave_widget' });
  });

  it('cancelar la confirmación no revoca nada', async () => {
    const app = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await app.user.click(screen.getByRole('button', { name: 'Revocar la clave Sitio principal' }));
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(app.servidor.pedidos.some((p) => p.metodo === 'DELETE')).toBe(false);
  });

  it('sin claves explica cómo crear la primera', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/claves-widget', respuestaJson: { items: [] } });
    await montarApp({ servidor: s, email: ADMIN.email, ruta: '/perfil/widget' });
    expect(await screen.findByText('Todavía no creaste ninguna clave')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad (axe), como asesor y como administrador', async () => {
    const a = await abrir();
    await sinViolacionesDeAccesibilidad(a.container);
    a.unmount();
    const b = await abrirAdmin();
    await screen.findByRole('table', { name: 'Claves del widget' });
    await sinViolacionesDeAccesibilidad(b.container);
  });
});

describe('parsearOrigins', () => {
  it('separa por líneas o comas y descarta vacíos y espacios', () => {
    expect(parsearOrigins(' https://a.com.ar ,\n\nhttps://b.com.ar\n')).toEqual(['https://a.com.ar', 'https://b.com.ar']);
    expect(parsearOrigins('')).toEqual([]);
  });
});
