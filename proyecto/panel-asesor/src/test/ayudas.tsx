// Ayudas de las pruebas: arman la app completa contra el servidor simulado y abren sesiones sin pasar por la pantalla.
import { render, screen, within, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { expect, vi } from 'vitest';
import { App } from '../App';
import { CODIGO_TOTP_DEMO, CONTRASENA_DEMO, CUENTAS_DEMO, crearServidorMock, type OpcionesMock, type ServidorMock } from '../mock/servidor';

export { CODIGO_TOTP_DEMO, CONTRASENA_DEMO, CUENTAS_DEMO };
export const ASESOR = CUENTAS_DEMO[0]!;
export const ADMIN = CUENTAS_DEMO[1]!;

type FetchLike = (entrada: string, init: RequestInit) => Promise<Response>;

/** Abre la sesión directamente contra el mock (como si el navegador ya tuviera la cookie): login + TOTP. */
export async function abrirSesionEnMock(servidor: ServidorMock, email: string = ASESOR.email): Promise<{ csrf: string }> {
  const f = servidor.fetch as unknown as FetchLike;
  const cabeceras = { 'Content-Type': 'application/json' };
  const paso = (await (await f('/v1/panel/sesion', { method: 'POST', headers: cabeceras, body: JSON.stringify({ email, contrasena: CONTRASENA_DEMO }) })).json()) as { csrf_token: string };
  const r = await f('/v1/panel/sesion/totp', { method: 'POST', headers: { ...cabeceras, 'X-CSRF-Token': paso.csrf_token }, body: JSON.stringify({ codigo: CODIGO_TOTP_DEMO }) });
  const s = (await r.json()) as { csrf_token: string };
  return { csrf: s.csrf_token };
}

/** Llama a una ruta del mock con la sesión abierta (para preparar estado: p. ej. reautenticar antes de la prueba). */
export async function llamarMock(servidor: ServidorMock, csrf: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
  const f = servidor.fetch as unknown as FetchLike;
  return f(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
}

export interface OpcionesApp extends OpcionesMock {
  ruta?: string;
  /** Si es false, el mock arranca sin sesión (el panel manda a Ingresar). Por defecto abre la sesión. */
  conSesion?: boolean;
  email?: string;
  servidor?: ServidorMock;
  /** Reloj falso de vitest: user-event avanza los temporizadores. */
  relojFalso?: boolean;
}

export interface AppMontada extends RenderResult {
  user: UserEvent;
  servidor: ServidorMock;
  csrf: string | null;
}

export async function montarApp(opciones: OpcionesApp = {}): Promise<AppMontada> {
  const { ruta = '/cotizaciones', conSesion = true, email, servidor: dado, relojFalso = false, ...mock } = opciones;
  const servidor = dado ?? crearServidorMock(mock);
  const csrf = conSesion ? (await abrirSesionEnMock(servidor, email)).csrf : null;
  const user = userEvent.setup(relojFalso ? { advanceTimers: (ms) => vi.advanceTimersByTime(ms) } : {});
  const vista = render(<App rutaInicial={ruta} fetchImpl={servidor.fetch} />);
  return { ...vista, user, servidor, csrf };
}

/** Espera a que desaparezca todo texto "Cargando…" visible. */
export async function esperarCarga(): Promise<void> {
  await vi.waitFor(() => {
    expect(screen.queryAllByRole('status').filter((e) => /^Cargando/.test(e.textContent))).toHaveLength(0);
  });
}

export async function sinViolacionesDeAccesibilidad(contenedor: HTMLElement): Promise<void> {
  // jsdom no calcula contraste ni layout: se desactiva solo esa regla; el resto de axe corre completo.
  const resultado = await axe(contenedor, { rules: { 'color-contrast': { enabled: false } } });
  // Se compara la lista de violaciones (no solo un booleano) para que el fallo diga qué regla y qué nodo.
  expect(resultado.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([]);
}

/** Responde a la reautenticación desde el diálogo abierto. */
export async function reautenticarEnDialogo(user: UserEvent, contrasena = CONTRASENA_DEMO, codigo = CODIGO_TOTP_DEMO): Promise<void> {
  const dialogo = await screen.findByRole('dialog', { name: 'Confirmá tu identidad' });
  await user.type(within(dialogo).getByLabelText('Contraseña'), contrasena);
  await user.type(within(dialogo).getByLabelText('Código de verificación'), codigo);
  await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
}

/** Reloj falso de vitest solo para temporizadores y fecha (las promesas siguen siendo reales). */
export function usarRelojFalso(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
}
