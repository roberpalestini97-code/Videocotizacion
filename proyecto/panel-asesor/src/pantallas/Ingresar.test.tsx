import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJES_ERROR } from '../api/generado/errores';
import { CODIGO_RECUPERACION_DEMO, crearServidorMock } from '../mock/servidor';
import { ASESOR, CODIGO_TOTP_DEMO, CONTRASENA_DEMO, montarApp, sinViolacionesDeAccesibilidad, usarRelojFalso, type AppMontada } from '../test/ayudas';
import { destinoSeguro } from './Ingresar';

async function escribirCredenciales(app: AppMontada, email = ASESOR.email, contrasena = CONTRASENA_DEMO) {
  await app.user.type(await screen.findByLabelText('Correo electrónico'), email);
  await app.user.type(screen.getByLabelText('Contraseña'), contrasena);
  await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function llegarAlPasoDelCodigo(app: AppMontada) {
  await escribirCredenciales(app);
  await screen.findByRole('heading', { name: 'Verificá tu identidad' });
}

describe('Ingresar: contraseña', () => {
  it('muestra el formulario, pone el foco en el título y no pide nada al servidor todavía', async () => {
    const app = await montarApp({ conSesion: false });
    const titulo = await screen.findByRole('heading', { name: 'Ingresá a tu panel' });
    // El foco se pone en un efecto después de pintar: en CI el título aparece antes que el foco.
    await waitFor(() => expect(titulo).toHaveFocus());
    expect(document.title).toBe('Ingresar · Panel del asesor');
    expect(app.servidor.pedidos.map((p) => `${p.metodo} ${p.ruta}`)).not.toContain('POST /v1/panel/sesion');
  });

  it('no deja pasar un correo mal escrito ni una contraseña corta, avisa en el campo y lleva el foco ahí', async () => {
    const app = await montarApp({ conSesion: false });
    await app.user.type(await screen.findByLabelText('Correo electrónico'), 'juan@');
    await app.user.type(screen.getByLabelText('Contraseña'), 'corta');
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Ingresá un correo válido, por ejemplo nombre@dominio.com.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription('Ingresá un correo válido, por ejemplo nombre@dominio.com.');
    expect(app.servidor.pedidos.some((p) => p.metodo === 'POST')).toBe(false);
  });

  it('con el correo bien y la contraseña corta, el foco va a la contraseña', async () => {
    const app = await montarApp({ conSesion: false });
    await app.user.type(await screen.findByLabelText('Correo electrónico'), ASESOR.email);
    await app.user.type(screen.getByLabelText('Contraseña'), 'corta');
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('La contraseña tiene al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
  });

  it('con la contraseña incorrecta muestra el mensaje uniforme, lo anuncia como alerta, vacía la contraseña y no revela si el correo existe', async () => {
    const app = await montarApp({ conSesion: false });
    await escribirCredenciales(app, ASESOR.email, 'contrasena-equivocada');
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.credenciales_incorrectas!);
    expect(alerta).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    // Un correo que no existe da exactamente el mismo mensaje (R37).
    await app.user.clear(screen.getByLabelText('Correo electrónico'));
    await app.user.type(screen.getByLabelText('Correo electrónico'), 'nadie@asesores.local');
    await app.user.type(screen.getByLabelText('Contraseña'), 'otra-contrasena-mala');
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => { expect(screen.getByRole('alert')).toHaveTextContent(MENSAJES_ERROR.credenciales_incorrectas!); });
    expect(screen.queryByText(/no existe/i)).not.toBeInTheDocument();
  });

  it('el mensaje de error sale del catálogo de la API cuando lo trae (manda sobre el respaldo del panel)', async () => {
    const servidor = crearServidorMock();
    servidor.agregarTextos({ 'error.credenciales_incorrectas': 'Texto del catálogo para credenciales' });
    const app = await montarApp({ servidor, conSesion: false });
    await escribirCredenciales(app, ASESOR.email, 'contrasena-equivocada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Texto del catálogo para credenciales');
  });

  it('con contraseña correcta pasa al paso del código y deja el correo fuera de la vista de la contraseña', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    expect(screen.getByRole('heading', { name: 'Verificá tu identidad' })).toHaveFocus();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it('no manda dos pedidos si se hace clic dos veces mientras el primero sigue en curso', async () => {
    const app = await montarApp({ conSesion: false });
    const retenido = app.servidor.retener('/v1/panel/sesion', 'POST');
    await app.user.type(await screen.findByLabelText('Correo electrónico'), ASESOR.email);
    await app.user.type(screen.getByLabelText('Contraseña'), CONTRASENA_DEMO);
    const boton = screen.getByRole('button', { name: 'Continuar' });
    await app.user.click(boton);
    expect(await screen.findByRole('button', { name: 'Ingresando…' })).toHaveAttribute('aria-disabled', 'true');
    await app.user.click(screen.getByRole('button', { name: 'Ingresando…' }));
    await app.user.keyboard('{Enter}');
    retenido.liberar();
    await screen.findByRole('heading', { name: 'Verificá tu identidad' });
    expect(app.servidor.pedidos.filter((p) => p.metodo === 'POST' && p.ruta === '/v1/panel/sesion')).toHaveLength(1);
  });

  it('se puede enviar con Enter desde el campo de la contraseña', async () => {
    const app = await montarApp({ conSesion: false });
    await app.user.type(await screen.findByLabelText('Correo electrónico'), ASESOR.email);
    await app.user.type(screen.getByLabelText('Contraseña'), `${CONTRASENA_DEMO}{Enter}`);
    expect(await screen.findByRole('heading', { name: 'Verificá tu identidad' })).toBeInTheDocument();
  });

  it('tras demasiados intentos bloquea el botón con una cuenta regresiva y lo libera al cumplirse', async () => {
    usarRelojFalso();
    const app = await montarApp({ conSesion: false, intentosMaximos: 2, relojFalso: true });
    await escribirCredenciales(app, ASESOR.email, 'contrasena-equivocada');
    await screen.findByRole('alert');
    await app.user.type(screen.getByLabelText('Contraseña'), 'contrasena-equivocada');
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    const espera = await screen.findByRole('button', { name: 'Esperá 60 s' });
    expect(espera).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(`${MENSAJES_ERROR.intentos_excedidos!} Podés reintentar en 60 s.`);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.getByRole('button', { name: 'Esperá 50 s' })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('si no hay conexión lo dice y deja reintentar', async () => {
    const app = await montarApp({ conSesion: false });
    app.servidor.inyectarFalla({ ruta: '/v1/panel/sesion', metodo: 'POST', sinConexion: true });
    await escribirCredenciales(app);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
    await app.user.type(screen.getByLabelText('Contraseña'), CONTRASENA_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Verificá tu identidad' })).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await montarApp({ conSesion: false });
    await screen.findByRole('heading', { name: 'Ingresá a tu panel' });
    await sinViolacionesDeAccesibilidad(app.container);
  });
});

describe('Ingresar: código de verificación (TOTP)', () => {
  it('rechaza un código de menos de 6 números sin molestar al servidor', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), '12345');
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('El código tiene 6 números.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de verificación')).toHaveFocus();
    expect(app.servidor.pedidos.some((p) => p.ruta === '/v1/panel/sesion/totp')).toBe(false);
  });

  it('descarta las letras que se escriban en el campo del código', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), '12ab34cd56');
    expect(screen.getByLabelText('Código de verificación')).toHaveValue('123456');
  });

  it('con un código incorrecto avisa, lo vacía y deja volver a intentar', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), '000000');
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.totp_invalido!);
    expect(alerta).toHaveFocus();
    expect(screen.getByLabelText('Código de verificación')).toHaveValue('');
    await app.user.type(screen.getByLabelText('Código de verificación'), CODIGO_TOTP_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: 'Mis cotizaciones' })).toBeInTheDocument();
  });

  it('con el código correcto entra al panel, en Mis cotizaciones', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), CODIGO_TOTP_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: 'Mis cotizaciones' })).toBeInTheDocument();
    expect(screen.getByText(ASESOR.nombreVisible)).toBeInTheDocument();
    // Y el ingreso quedó anotado en Registros.
    expect(app.servidor.registrosDe(ASESOR.asesorId)[0]).toMatchObject({ accion: 'inicio_sesion' });
  });

  it('con un código de recuperación entra, y ese código no sirve una segunda vez', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    // Se escribe en minúsculas: el panel lo normaliza.
    await app.user.type(screen.getByLabelText('Código de recuperación'), CODIGO_RECUPERACION_DEMO.toLowerCase());
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    await screen.findByRole('heading', { name: 'Mis cotizaciones' });
    await app.user.click(screen.getByRole('button', { name: 'Salir' }));
    await escribirCredenciales(app);
    await screen.findByRole('heading', { name: 'Verificá tu identidad' });
    await app.user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    await app.user.type(screen.getByLabelText('Código de recuperación'), CODIGO_RECUPERACION_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.totp_invalido!);
  });

  it('valida el formato del código de recuperación', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    await app.user.type(screen.getByLabelText('Código de recuperación'), 'ABC');
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('El código de recuperación tiene el formato XXXX-XXXX-XXXX.')).toBeInTheDocument();
  });

  it('se puede alternar entre el código de la aplicación y el de recuperación sin arrastrar lo escrito', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), '123');
    await app.user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    expect(screen.getByLabelText('Código de recuperación')).toHaveValue('');
    await app.user.click(screen.getByRole('button', { name: 'Usar el código de la aplicación' }));
    expect(screen.getByLabelText('Código de verificación')).toHaveValue('');
  });

  it('"Volver" regresa a la contraseña', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await app.user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('heading', { name: 'Ingresá a tu panel' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('tras varios códigos malos bloquea el reintento con cuenta regresiva', async () => {
    usarRelojFalso();
    const app = await montarApp({ conSesion: false, intentosMaximos: 2, relojFalso: true });
    await llegarAlPasoDelCodigo(app);
    for (let i = 0; i < 2; i += 1) {
      await app.user.type(screen.getByLabelText('Código de verificación'), '000000');
      await app.user.click(screen.getByRole('button', { name: /^(Verificar|Esperá)/ }));
      await screen.findByRole('alert');
    }
    expect(await screen.findByRole('button', { name: 'Esperá 30 s' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await montarApp({ conSesion: false });
    await llegarAlPasoDelCodigo(app);
    await sinViolacionesDeAccesibilidad(app.container);
  });
});

describe('Ingresar: a dónde vuelve', () => {
  it('después de ingresar vuelve a la página que se había pedido', async () => {
    const app = await montarApp({ conSesion: false, ruta: '/registros' });
    await llegarAlPasoDelCodigo(app);
    await app.user.type(screen.getByLabelText('Código de verificación'), CODIGO_TOTP_DEMO);
    await app.user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: 'Registros' })).toBeInTheDocument();
  });

  it('quien ya tiene sesión y abre /ingresar va directo a Mis cotizaciones', async () => {
    await montarApp({ ruta: '/ingresar' });
    expect(await screen.findByRole('heading', { name: 'Mis cotizaciones' })).toBeInTheDocument();
  });

  it('solo acepta destinos internos del panel (nada de redirecciones abiertas)', () => {
    expect(destinoSeguro('/registros')).toBe('/registros');
    expect(destinoSeguro('/cotizaciones?oficio=pintura')).toBe('/cotizaciones?oficio=pintura');
    expect(destinoSeguro('//evil.example')).toBe('/cotizaciones');
    expect(destinoSeguro('https://evil.example')).toBe('/cotizaciones');
    expect(destinoSeguro('/ingresar')).toBe('/cotizaciones');
    expect(destinoSeguro(undefined)).toBe('/cotizaciones');
    expect(destinoSeguro(42)).toBe('/cotizaciones');
  });
});
