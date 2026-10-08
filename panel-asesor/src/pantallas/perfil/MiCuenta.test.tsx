import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJES_ERROR } from '../../api/generado/errores';
import { crearServidorMock } from '../../mock/servidor';
import { CODIGO_TOTP_DEMO, CONTRASENA_DEMO, esperarCarga, llamarMock, montarApp, reautenticarEnDialogo, sinViolacionesDeAccesibilidad } from '../../test/ayudas';
import { formatearFechaCorta, mesActual } from '../../util/formato';
import { porcentaje } from './MiCuenta';

async function abrirCuenta(opciones: Parameters<typeof montarApp>[0] = {}) {
  const app = await montarApp({ ruta: '/perfil/cuenta', ...opciones });
  await screen.findByRole('heading', { name: 'Tu consumo' });
  await esperarCarga();
  return app;
}
const seccionConsumo = () => screen.getByRole('heading', { name: 'Tu consumo' }).closest('section')!;

describe('Mi cuenta: consumo', () => {
  it('muestra los minutos usados del mes, el porcentaje, la barra y las llamadas simultáneas', async () => {
    const s = crearServidorMock();
    s.forzarConsumo({ segundos_usados: 12_600, segundos_tope: 30_000, simultaneas_en_curso: 2, simultaneas_tope: 5 });
    await abrirCuenta({ servidor: s });
    const sec = within(seccionConsumo());
    expect(seccionConsumo().querySelector('.consumo__cifra')).toHaveTextContent('210 de 500 minutos usados (42 %)');
    const barra = sec.getByRole('progressbar', { name: /Minutos usados en/ });
    expect(barra).toHaveAttribute('max', '30000');
    expect(barra).toHaveAttribute('value', '12600');
    expect(sec.getByText(/Videocotizaciones en curso ahora/)).toHaveTextContent('2 de 5 simultáneas');
  });

  it('lista el consumo día por día, el más nuevo primero, con la fecha en palabras', async () => {
    await abrirCuenta();
    const tabla = within(seccionConsumo()).getByRole('table', { name: 'Consumo día por día' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    const hoy = `${mesActual()}-`;
    expect(filas.length).toBeGreaterThan(0);
    const primero = within(filas[0]!).getAllByRole('rowheader')[0]!;
    expect(primero.textContent).toMatch(/^\d{1,2} de [a-z]+ de \d{4}$/);
    const dias = filas.map((f) => within(f).getByRole('rowheader').textContent);
    expect(dias[0]).not.toBe(dias.at(-1));
    expect(hoy).toMatch(/^\d{4}-\d{2}-$/);
    expect(within(filas[0]!).getAllByRole('cell')).toHaveLength(3);
  });

  it('cambiar de mes pide ese mes al servidor y muestra el mes completo', async () => {
    const s = crearServidorMock();
    const app = await abrirCuenta({ servidor: s });
    const selector = screen.getByLabelText('Mes');
    expect(selector).toHaveValue(mesActual());
    const opciones = within(selector).getAllByRole('option');
    expect(opciones).toHaveLength(6);
    await app.user.selectOptions(selector, opciones[1]!.getAttribute('value')!);
    await waitFor(() => { expect(s.pedidos.filter((p) => p.ruta === '/v1/panel/consumo').at(-1)!.consulta.periodo).toBe(opciones[1]!.getAttribute('value')); });
    await esperarCarga();
    const filas = within(seccionConsumo()).getAllByRole('row').slice(1);
    expect(filas.length).toBeGreaterThanOrEqual(28);
  });

  it.each([
    ['p50', 15_000, /Ya usaste la mitad de tus minutos del mes\./, 'status'],
    ['p80', 24_000, /Ya usaste más del 80 % de tus minutos del mes\./, 'status'],
    ['p100', 30_000, /Llegaste al tope de minutos del mes\./, 'alert'],
  ] as const)('con la alerta %s avisa con el texto correcto', async (_alerta, usados, texto, rol) => {
    const s = crearServidorMock();
    s.forzarConsumo({ segundos_usados: usados });
    await abrirCuenta({ servidor: s });
    const aviso = within(seccionConsumo()).getByText(texto);
    expect(aviso.closest(`[role="${rol}"]`)).not.toBeNull();
  });

  it('sin alerta no muestra ningún aviso de consumo', async () => {
    const s = crearServidorMock();
    s.forzarConsumo({ segundos_usados: 1_200 });
    await abrirCuenta({ servidor: s });
    expect(within(seccionConsumo()).queryByText(/Ya usaste|Llegaste al tope/)).not.toBeInTheDocument();
  });

  it('un mes sin actividad dice que no hubo videocotizaciones', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/consumo', respuestaJson: { ambito: 'asesor', periodo: '2026-10', segundos_usados: 0, segundos_tope: 30000, simultaneas_en_curso: 0, simultaneas_tope: 5, alerta: 'ninguna', diario: [], actualizado_en: '2026-10-08T13:00:00Z' } });
    await abrirCuenta({ servidor: s });
    expect(within(seccionConsumo()).getByText('Sin actividad en este mes')).toBeInTheDocument();
    expect(within(seccionConsumo()).queryByRole('table')).not.toBeInTheDocument();
  });

  it('si no carga el consumo lo dice y permite reintentar sin romper el resto de la pantalla', async () => {
    const s = crearServidorMock();
    s.inyectarFalla({ ruta: '/v1/panel/consumo', status: 500, codigo: 'error_interno' });
    const app = await montarApp({ servidor: s, ruta: '/perfil/cuenta' });
    await screen.findByRole('heading', { name: 'Tu consumo' });
    expect(await within(seccionConsumo()).findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    expect(screen.getByRole('heading', { name: 'Cambiar la contraseña' })).toBeInTheDocument();
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => { expect(within(seccionConsumo()).getByRole('table')).toBeInTheDocument(); });
  });

  it('el porcentaje es entero y nunca redondea para arriba (499 de 500 es 99 %, no 100 %)', () => {
    expect(porcentaje(12, 500)).toBe(2);
    expect(porcentaje(499, 500)).toBe(99);
    expect(porcentaje(500, 500)).toBe(100);
    expect(porcentaje(10, 0)).toBe(0);
  });

  it('las fechas del consumo no se corren de día', () => {
    expect(formatearFechaCorta('2026-10-01')).toBe('1 de octubre de 2026');
  });
});

describe('Mi cuenta: cambiar la contraseña', () => {
  const NUEVA = 'otra-frase-bien-larga-0';
  const escribir = async (app: Awaited<ReturnType<typeof abrirCuenta>>, nueva = NUEVA, repetida = NUEVA) => {
    await app.user.type(screen.getByLabelText('Contraseña nueva'), nueva);
    await app.user.type(screen.getByLabelText('Repetí la contraseña nueva'), repetida);
  };

  it('valida el largo y que las dos coincidan, antes de pedir nada', async () => {
    const app = await abrirCuenta();
    await escribir(app, 'corta', 'corta');
    await app.user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText('La contraseña nueva tiene entre 12 y 256 caracteres.')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByLabelText('Contraseña nueva')).toHaveFocus(); });
    await app.user.clear(screen.getByLabelText('Contraseña nueva'));
    await app.user.clear(screen.getByLabelText('Repetí la contraseña nueva'));
    await escribir(app, NUEVA, 'otra-cosa-distinta-0');
    await app.user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText('Las dos contraseñas tienen que ser iguales.')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByLabelText('Repetí la contraseña nueva')).toHaveFocus(); });
    expect(app.servidor.pedidos.some((p) => p.ruta === '/v1/panel/contrasena')).toBe(false);
  });

  it('pide confirmar la identidad, cambia la contraseña, vacía los campos y lo anuncia', async () => {
    const app = await abrirCuenta();
    await escribir(app);
    await app.user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await reautenticarEnDialogo(app.user);
    expect(await screen.findByText('Cambiaste tu contraseña. Las demás sesiones abiertas se cerraron.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
    expect(screen.getByLabelText('Repetí la contraseña nueva')).toHaveValue('');
    expect(app.servidor.registrosDe('ase_5M2N9BKVB4MKP71EPBCDBWS8EV')[0]).toMatchObject({ accion: 'cambio_contrasena' });
  });

  it('si el servidor rechaza la nueva contraseña, lo muestra y no la da por cambiada', async () => {
    const app = await abrirCuenta();
    await escribir(app);
    app.servidor.inyectarFalla({ ruta: '/v1/panel/contrasena', status: 422, codigo: 'validacion_fallida' });
    await app.user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.validacion_fallida!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Mi cuenta: descargar mis datos', () => {
  it('después de confirmar la identidad baja un JSON con el nombre del día y queda anotado', async () => {
    const app = await abrirCuenta();
    const descargas: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
    let contenido = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      // jsdom no trae Blob.text(): se lee con FileReader.
      const lector = new FileReader();
      lector.onload = () => { contenido = lector.result as string; };
      lector.readAsText(b as Blob);
      return 'blob:x';
    });
    await app.user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await reautenticarEnDialogo(app.user);
    const aviso = await screen.findByText(/Descargamos tus datos en el archivo/);
    expect(descargas).toHaveLength(1);
    expect(descargas[0]).toMatch(/^videocotizacion-mi-cuenta-\d{4}-\d{2}-\d{2}\.json$/);
    expect(aviso).toHaveTextContent(descargas[0]!);
    await waitFor(() => { expect(contenido).not.toBe(''); });
    expect(JSON.parse(contenido)).toMatchObject({ formato_version: '1', perfil: { email: 'juan@asesores.local' } });
    expect(app.servidor.registrosDe('ase_5M2N9BKVB4MKP71EPBCDBWS8EV')[0]).toMatchObject({ accion: 'exportar_mi_cuenta' });
  });

  it('si se cancela la confirmación no se baja nada y no se muestra un error', async () => {
    const app = await abrirCuenta();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await app.user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await screen.findByRole('dialog');
    await app.user.keyboard('{Escape}');
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar mis datos' })).toHaveFocus();
  });

  it('si el servidor falla lo avisa', async () => {
    const app = await abrirCuenta();
    // Con la ventana de confirmación ya abierta, la falla le toca a la exportación misma.
    await llamarMock(app.servidor, app.csrf!, 'POST', '/v1/panel/reautenticacion', { contrasena: CONTRASENA_DEMO, codigo_totp: CODIGO_TOTP_DEMO });
    app.servidor.inyectarFalla({ ruta: '/v1/panel/mi-cuenta/exportacion', status: 500, codigo: 'error_interno' });
    await app.user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!);
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await abrirCuenta();
    await sinViolacionesDeAccesibilidad(app.container);
  });
});
