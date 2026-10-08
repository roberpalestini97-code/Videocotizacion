import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { esperarCarga, montarApp, sinViolacionesDeAccesibilidad } from './test/ayudas';

describe('navegación del panel', () => {
  it('la raíz lleva a Mis cotizaciones', async () => {
    await montarApp({ ruta: '/' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis cotizaciones' })).toBeInTheDocument();
  });

  it('el menú principal tiene Perfil, Mis cotizaciones y Registros y marca la página actual', async () => {
    await montarApp({ ruta: '/registros' });
    const menu = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['Perfil', 'Mis cotizaciones', 'Registros']);
    expect(within(menu).getByRole('link', { name: 'Registros' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Perfil' })).not.toHaveAttribute('aria-current');
  });

  it('al navegar, el foco pasa al título de la nueva pantalla y cambia el título de la pestaña', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await screen.findByRole('heading', { level: 1, name: 'Registros' });
    expect(document.title).toBe('Registros · Panel del asesor');
    await app.user.click(screen.getByRole('link', { name: 'Mis cotizaciones' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis cotizaciones' })).toHaveFocus();
    expect(document.title).toBe('Mis cotizaciones · Panel del asesor');
  });

  it('se navega solo con el teclado (Tab + Enter)', async () => {
    const app = await montarApp({ ruta: '/registros' });
    await screen.findByRole('heading', { level: 1, name: 'Registros' });
    await app.user.click(document.body);
    await app.user.tab(); // enlace "Saltar al contenido"
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveFocus();
    await app.user.tab();
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveFocus();
    await app.user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
  });

  it('el enlace "Saltar al contenido" apunta al contenido principal, que puede recibir foco', async () => {
    await montarApp();
    const saltar = await screen.findByRole('link', { name: 'Saltar al contenido' });
    expect(saltar).toHaveAttribute('href', '#contenido');
    const principal = screen.getByRole('main');
    expect(principal).toHaveAttribute('id', 'contenido');
    expect(principal).toHaveAttribute('tabindex', '-1');
  });

  it('una dirección que no existe muestra "No encontramos esa página" con salida a Mis cotizaciones', async () => {
    await montarApp({ ruta: '/cosa-rara' });
    expect(await screen.findByRole('heading', { level: 1, name: 'No encontramos esa página' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Volver a Mis cotizaciones' })).toHaveAttribute('href', '/cotizaciones');
  });

  it('Perfil tiene tres secciones: Mis datos, Mi cuenta y Enlace y claves', async () => {
    const app = await montarApp({ ruta: '/perfil' });
    const sub = await screen.findByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(sub).getAllByRole('link').map((l) => l.textContent)).toEqual(['Mis datos', 'Mi cuenta', 'Enlace y claves']);
    expect(within(sub).getByRole('link', { name: 'Mis datos' })).toHaveAttribute('aria-current', 'page');
    await app.user.click(within(sub).getByRole('link', { name: 'Mi cuenta' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument();
    expect(within(sub).getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('aria-current', 'page');
    expect(within(sub).getByRole('link', { name: 'Mis datos' })).not.toHaveAttribute('aria-current');
  });

  it('al irse de una pantalla se cancelan sus pedidos pendientes y no queda ningún error a la vista', async () => {
    const { crearServidorMock } = await import('./mock/servidor');
    const s = crearServidorMock();
    const retenido = s.retener('/v1/panel/cotizaciones');
    const app = await montarApp({ servidor: s });
    await screen.findByRole('heading', { level: 1, name: 'Mis cotizaciones' });
    await app.user.click(screen.getByRole('link', { name: 'Registros' }));
    await screen.findByRole('heading', { level: 1, name: 'Registros' });
    retenido.liberar();
    await esperarCarga();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('el menú usa los textos del catálogo cuando la API los trae', async () => {
    const { crearServidorMock } = await import('./mock/servidor');
    const s = crearServidorMock();
    s.agregarTextos({ 'panel.menu.mis_cotizaciones': 'Mis pedidos' });
    await montarApp({ servidor: s });
    expect(await screen.findByRole('link', { name: 'Mis pedidos' })).toBeInTheDocument();
  });

  it('el diseño completo (menú, contenido, pie) no tiene violaciones de accesibilidad (axe) en cada pantalla', async () => {
    for (const ruta of ['/cotizaciones', '/registros', '/perfil', '/perfil/cuenta', '/cosa-rara']) {
      const app = await montarApp({ ruta });
      await screen.findByRole('heading', { level: 1 });
      await esperarCarga();
      await sinViolacionesDeAccesibilidad(app.container);
      app.unmount();
    }
  });
});
