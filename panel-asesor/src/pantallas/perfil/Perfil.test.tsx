import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENSAJES_ERROR } from '../../api/generado/errores';
import { crearServidorMock } from '../../mock/servidor';
import { ADMIN, ASESOR, esperarCarga, montarApp, sinViolacionesDeAccesibilidad, type AppMontada } from '../../test/ayudas';
import { normalizarTelefono } from './Perfil';

const patches = (app: AppMontada) => app.servidor.pedidos.filter((p) => p.metodo === 'PATCH');

async function abrirPerfil(opciones: Parameters<typeof montarApp>[0] = {}) {
  const app = await montarApp({ ruta: '/perfil', ...opciones });
  await screen.findByLabelText('Nombre visible');
  return app;
}

describe('Perfil: datos', () => {
  it('muestra los datos actuales del asesor y los de la cuenta', async () => {
    await abrirPerfil();
    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toHaveFocus();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue(ASESOR.nombreVisible);
    expect(screen.getByLabelText('WhatsApp')).toHaveValue(ASESOR.whatsapp);
    expect(screen.getByRole('checkbox', { name: 'Pintura' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Jardinería' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Limpieza' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cobo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Parque Lago' })).not.toBeChecked();
    const cuenta = screen.getByText('Datos de la cuenta').closest('section')!;
    expect(within(cuenta).getByText(ASESOR.email)).toBeInTheDocument();
    expect(within(cuenta).getByText('Asesor')).toBeInTheDocument();
    expect(within(cuenta).getByText('Activa')).toBeInTheDocument();
    expect(within(cuenta).getByText(/Versión 2026-10-08\.1, el /)).toBeInTheDocument();
  });

  it('un administrador se muestra como Administrador', async () => {
    await abrirPerfil({ email: ADMIN.email });
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('las casillas de zonas son las cuatro que se atienden (sin "fuera de zona")', async () => {
    await abrirPerfil();
    const grupo = screen.getByRole('group', { name: 'Zonas donde trabajás' });
    expect(within(grupo).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['Mar Chiquita', 'Cobo', 'Santa Clara del Mar', 'Parque Lago']);
  });

  it('si no carga muestra el error y permite reintentar', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/perfil', status: 503, codigo: 'servicio_no_disponible' });
    const app = await montarApp({ servidor: s, ruta: '/perfil' });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.servicio_no_disponible!);
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Nombre visible')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await abrirPerfil();
    await sinViolacionesDeAccesibilidad(app.container);
  });
});

describe('Perfil: guardar', () => {
  it('sin cambios lo dice y no manda nada', async () => {
    const app = await abrirPerfil();
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByText('No hay cambios para guardar.')).toBeInTheDocument();
    expect(patches(app)).toHaveLength(0);
  });

  it('manda solo lo que cambió y confirma', async () => {
    const app = await abrirPerfil();
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.type(screen.getByLabelText('Nombre visible'), '  Juan Pérez  ');
    await app.user.click(screen.getByRole('checkbox', { name: 'Parque Lago' }));
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Guardamos tus datos.')).toBeInTheDocument();
    expect(patches(app)).toHaveLength(1);
    expect(patches(app)[0]!.cuerpo).toEqual({ nombre_visible: 'Juan Pérez', zonas: ['mar_chiquita', 'cobo', 'parque_lago'] });
    // Y vuelve a comparar contra lo guardado: guardar otra vez sin tocar nada no manda nada.
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No hay cambios para guardar.')).toBeInTheDocument();
    expect(patches(app)).toHaveLength(1);
  });

  it('normaliza el teléfono (espacios, guiones y paréntesis) antes de mandarlo', async () => {
    expect(normalizarTelefono('+54 9 (223) 555-0199')).toBe('+5492235550199');
    const app = await abrirPerfil();
    await app.user.clear(screen.getByLabelText('WhatsApp'));
    await app.user.type(screen.getByLabelText('WhatsApp'), '+54 9 223 555-0199');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Guardamos tus datos.');
    expect(patches(app)[0]!.cuerpo).toEqual({ whatsapp: '+5492235550199' });
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('+5492235550199');
  });

  it('valida el nombre (vacío o con < >) y lleva el foco al campo', async () => {
    const app = await abrirPerfil();
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByText('El nombre tiene entre 1 y 60 caracteres y no puede llevar < ni >.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre visible')).toHaveFocus();
    await app.user.type(screen.getByLabelText('Nombre visible'), 'Juan <b>');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByLabelText('Nombre visible')).toHaveAttribute('aria-invalid', 'true');
    expect(patches(app)).toHaveLength(0);
  });

  it('valida el WhatsApp con código de país', async () => {
    const app = await abrirPerfil();
    await app.user.clear(screen.getByLabelText('WhatsApp'));
    await app.user.type(screen.getByLabelText('WhatsApp'), '223 555 0199');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByText('Ingresá el número con código de país, por ejemplo +5492231234567.')).toBeInTheDocument();
    expect(screen.getByLabelText('WhatsApp')).toHaveFocus();
    expect(patches(app)).toHaveLength(0);
  });

  it('exige al menos un oficio y una zona, y enfoca la primera casilla del grupo con error', async () => {
    const app = await abrirPerfil();
    await app.user.click(screen.getByRole('checkbox', { name: 'Pintura' }));
    await app.user.click(screen.getByRole('checkbox', { name: 'Jardinería' }));
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByText('Elegí al menos un oficio.')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole('checkbox', { name: 'Pintura' })).toHaveFocus(); });
    expect(screen.getByRole('group', { name: 'Oficios' })).toHaveAccessibleDescription('Elegí al menos un oficio.');
    await app.user.click(screen.getByRole('checkbox', { name: 'Pintura' }));
    await app.user.click(screen.getByRole('checkbox', { name: 'Cobo' }));
    await app.user.click(screen.getByRole('checkbox', { name: 'Mar Chiquita' }));
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByText('Elegí al menos una zona.')).toBeInTheDocument();
    expect(patches(app)).toHaveLength(0);
  });

  it('muestra los errores por campo que devuelve el servidor (422)', async () => {
    const app = await abrirPerfil();
    app.servidor.inyectarFalla({ ruta: '/v1/panel/perfil', metodo: 'PATCH', status: 422, codigo: 'validacion_fallida', campos: [{ campo: '/whatsapp', problema: 'Ese número ya está en uso.' }] });
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.type(screen.getByLabelText('Nombre visible'), 'Otro Nombre');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Ese número ya está en uso.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(MENSAJES_ERROR.validacion_fallida!);
    expect(screen.getByLabelText('WhatsApp')).toHaveAccessibleDescription(/Ese número ya está en uso\./);
  });

  it('si el servidor falla, avisa con foco en la alerta y conserva lo escrito', async () => {
    const app = await abrirPerfil();
    app.servidor.inyectarFalla({ ruta: '/v1/panel/perfil', metodo: 'PATCH', status: 500, codigo: 'error_interno' });
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.type(screen.getByLabelText('Nombre visible'), 'Otro Nombre');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    expect(alerta).toHaveFocus();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Otro Nombre');
  });

  it('no manda dos guardados si se hace clic dos veces', async () => {
    const app = await abrirPerfil();
    const retenido = app.servidor.retener('/v1/panel/perfil', 'PATCH');
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.type(screen.getByLabelText('Nombre visible'), 'Otro Nombre');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await app.user.click(await screen.findByRole('button', { name: 'Guardando…' }));
    retenido.liberar();
    await screen.findByText('Guardamos tus datos.');
    expect(patches(app)).toHaveLength(1);
  });

  it('el guardado se ve después de recargar la pantalla', async () => {
    const s = crearServidorMock();
    const app = await abrirPerfil({ servidor: s });
    await app.user.clear(screen.getByLabelText('Nombre visible'));
    await app.user.type(screen.getByLabelText('Nombre visible'), 'Nombre Nuevo');
    await app.user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Guardamos tus datos.');
    app.unmount();
    await abrirPerfil({ servidor: s, conSesion: false });
    await esperarCarga();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Nombre Nuevo');
  });
});
