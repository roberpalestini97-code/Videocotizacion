import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENSAJES_ERROR } from '../../api/generado/errores';
import { crearServidorMock } from '../../mock/servidor';
import { ASESOR, esperarCarga, montarApp, sinViolacionesDeAccesibilidad } from '../../test/ayudas';
import { formatearMoneda } from '../../util/formato';

const tarjetas = () => screen.queryAllByRole('article');
const consultas = (n = 45) => crearServidorMock({ cantidadConsultas: n });
const pedidosListado = (s: ReturnType<typeof crearServidorMock>) => s.pedidos.filter((p) => p.ruta === '/v1/panel/cotizaciones');

describe('Mis cotizaciones: lista', () => {
  it('muestra la primera página (20), con el título enfocado, y avisa si hay más', async () => {
    await montarApp();
    expect(await screen.findByRole('heading', { name: 'Mis cotizaciones' })).toHaveFocus();
    await esperarCarga();
    expect(tarjetas()).toHaveLength(20);
    expect(screen.getByRole('button', { name: 'Cargar más cotizaciones' })).toBeInTheDocument();
    expect(document.title).toBe('Mis cotizaciones · Panel del asesor');
  });

  it('cada tarjeta dice oficio, zona, estado, resumen y si hay presupuesto, con el total en pesos formateado', async () => {
    const s = consultas();
    await montarApp({ servidor: s });
    await esperarCarga();
    const con = s.consultasDe(ASESOR.asesorId).find((f) => f.detalle.cotizacion && !f.detalle.cotizacion.fuera_de_zona)!;
    const titulo = document.getElementById(`cot-${con.detalle.sesion_id}`)!;
    const art = titulo.closest('article')!;
    expect(within(art).getByText(formatearMoneda(con.detalle.cotizacion!.total_centavos, 'ARS'))).toBeInTheDocument();
    expect(within(art).getByText('Completada')).toBeInTheDocument();
    expect(within(art).getByText(con.detalle.resumen)).toBeInTheDocument();
  });

  it('sin presupuesto emitido lo dice, y una consulta en curso se marca como tal', async () => {
    const s = consultas();
    await montarApp({ servidor: s });
    await esperarCarga();
    const enCurso = s.consultasDe(ASESOR.asesorId).find((f) => f.detalle.estado === 'en_curso')!;
    const art = document.getElementById(`cot-${enCurso.detalle.sesion_id}`)!.closest('article')!;
    expect(within(art).getByText('En curso')).toBeInTheDocument();
    expect(within(art).getByText('Sin presupuesto emitido')).toBeInTheDocument();
    expect(within(art).queryByText(/Código de referencia/)).not.toBeInTheDocument();
  });

  it('muestra el código de referencia solo cuando el listado lo trae', async () => {
    const s = consultas();
    await montarApp({ servidor: s });
    await esperarCarga();
    const con = s.consultasDe(ASESOR.asesorId).find((f) => f.codigoReferencia)!;
    const art = document.getElementById(`cot-${con.detalle.sesion_id}`)!.closest('article')!;
    expect(within(art).getByText(con.codigoReferencia!)).toBeInTheDocument();
    expect(screen.getAllByText(/Código de referencia:/).length).toBeLessThan(tarjetas().length);
  });

  it('marca "Dejó contacto" con el texto del catálogo, y solo en las consultas que lo tienen', async () => {
    const s = consultas();
    s.agregarTextos({ 'panel.contacto_disponible': 'Dejó sus datos' });
    await montarApp({ servidor: s });
    await esperarCarga();
    const visibles = s.consultasDe(ASESOR.asesorId).slice(0, 20);
    expect(screen.getAllByText('Dejó sus datos')).toHaveLength(visibles.filter((f) => f.contactoDisponible).length);
    expect(screen.queryByText('Dejó contacto')).not.toBeInTheDocument();
  });

  it('si el catálogo de textos no responde, usa los textos de respaldo y el panel sigue andando', async () => {
    const s = consultas();
    s.inyectarFalla({ ruta: '/v1/textos', status: 500, codigo: 'error_interno' });
    await montarApp({ servidor: s });
    await esperarCarga();
    expect(tarjetas()).toHaveLength(20);
    expect(screen.getAllByText('Dejó contacto').length).toBeGreaterThan(0);
    // El motivo "cliente_cerro": catálogo = "El cliente cortó la llamada"; respaldo = "El cliente cortó".
    expect(screen.getAllByText('El cliente cortó').length).toBeGreaterThan(0);
    expect(screen.queryByText('El cliente cortó la llamada')).not.toBeInTheDocument();
  });

  it('el motivo de cierre sale del catálogo cuando responde', async () => {
    await montarApp();
    await esperarCarga();
    await waitFor(() => { expect(screen.getAllByText('El cliente cortó la llamada').length).toBeGreaterThan(0); });
  });

  it('marca "Fuera de zona" las consultas fuera de las zonas atendidas', async () => {
    const s = consultas();
    await montarApp({ servidor: s });
    await esperarCarga();
    const fuera = s.consultasDe(ASESOR.asesorId).slice(0, 20).filter((f) => f.detalle.datos_extraidos?.fuera_de_zona);
    expect(fuera.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fuera de zona')).toHaveLength(fuera.length);
  });

  it('el enlace al detalle apunta a la consulta y su nombre accesible dice de cuál es', async () => {
    const s = consultas();
    await montarApp({ servidor: s });
    await esperarCarga();
    const primera = s.consultasDe(ASESOR.asesorId)[0]!;
    const enlace = screen.getAllByRole('link', { name: /Ver detalle de la consulta del/ })[0]!;
    expect(enlace).toHaveAttribute('href', `/cotizaciones/${primera.detalle.sesion_id}`);
  });
});

describe('Mis cotizaciones: más resultados', () => {
  it('"Cargar más" agrega la página siguiente, anuncia cuántas llegaron y pasa el foco a la primera nueva', async () => {
    const app = await montarApp();
    await esperarCarga();
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(40); });
    expect(screen.getByText('Se cargaron 20 cotizaciones más.')).toBeInTheDocument();
    const primeraNueva = tarjetas()[20]!.querySelector('h2')!;
    expect(primeraNueva).toHaveFocus();
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(45); });
    expect(screen.queryByRole('button', { name: 'Cargar más cotizaciones' })).not.toBeInTheDocument();
    expect(screen.getByText('No hay más cotizaciones.')).toBeInTheDocument();
    expect(screen.getByText('Se cargaron 5 cotizaciones más.')).toBeInTheDocument();
  });

  it('usa el singular cuando llega una sola más', async () => {
    const app = await montarApp({ cantidadConsultas: 21 });
    await esperarCarga();
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    expect(await screen.findByText('Se cargó 1 cotización más.')).toBeInTheDocument();
  });

  it('no repite cotizaciones al paginar', async () => {
    const app = await montarApp();
    await esperarCarga();
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(40); });
    const ids = tarjetas().map((a) => a.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(40);
  });

  it('si falla "cargar más", avisa sin perder lo que ya se vio y deja reintentar', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    s.inyectarFalla({ ruta: '/v1/panel/cotizaciones', status: 503, codigo: 'servicio_no_disponible' });
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.servicio_no_disponible!);
    expect(tarjetas()).toHaveLength(20);
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(40); });
  });

  it('no manda dos pedidos de "cargar más" si se hace clic dos veces', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    const retenido = s.retener('/v1/panel/cotizaciones');
    await app.user.click(screen.getByRole('button', { name: 'Cargar más cotizaciones' }));
    await app.user.click(await screen.findByRole('button', { name: 'Cargando…' }));
    retenido.liberar();
    await waitFor(() => { expect(tarjetas()).toHaveLength(40); });
    expect(pedidosListado(s).filter((p) => p.consulta.cursor)).toHaveLength(1);
  });
});

describe('Mis cotizaciones: filtros', () => {
  it('filtra por oficio y manda el filtro al servidor', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    await app.user.selectOptions(screen.getByLabelText('Oficio'), 'jardineria');
    await app.user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => { expect(pedidosListado(s).at(-1)!.consulta.oficio).toBe('jardineria'); });
    await waitFor(() => {
      const t = tarjetas();
      expect(t.length).toBeGreaterThan(0);
      for (const a of t) expect(a.querySelector('h2')).toHaveTextContent(/^Jardinería/);
    });
  });

  it('filtra por fechas (desde/hasta, inclusive)', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    await app.user.type(screen.getByLabelText('Desde'), '2020-01-01');
    await app.user.type(screen.getByLabelText('Hasta'), '2020-12-31');
    await app.user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByText('No hay cotizaciones con esos filtros')).toBeInTheDocument();
    expect(pedidosListado(s).at(-1)!.consulta).toMatchObject({ desde: '2020-01-01', hasta: '2020-12-31' });
  });

  it('no deja filtrar con "desde" posterior a "hasta" y no consulta al servidor', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    const antes = pedidosListado(s).length;
    await app.user.type(screen.getByLabelText('Desde'), '2026-10-08');
    await app.user.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await app.user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(screen.getByText('La fecha "desde" no puede ser posterior a "hasta".')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription('La fecha "desde" no puede ser posterior a "hasta".');
    expect(pedidosListado(s)).toHaveLength(antes);
  });

  it('si cambia el filtro con un pedido en vuelo, la respuesta vieja no pisa la nueva', async () => {
    const s = consultas();
    const retenido = s.retener('/v1/panel/cotizaciones');
    const app = await montarApp({ servidor: s });
    await screen.findByRole('heading', { name: 'Mis cotizaciones' });
    await app.user.selectOptions(screen.getByLabelText('Oficio'), 'jardineria');
    await app.user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => { expect(pedidosListado(s)).toHaveLength(2); });
    retenido.liberar();
    await waitFor(() => { expect(tarjetas().length).toBeGreaterThan(0); });
    for (const a of tarjetas()) expect(a.querySelector('h2')).toHaveTextContent(/^Jardinería/);
  });

  it('"Limpiar" borra los filtros y vuelve a pedir todo', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    await app.user.selectOptions(screen.getByLabelText('Oficio'), 'limpieza');
    await app.user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => { expect(pedidosListado(s).at(-1)!.consulta.oficio).toBe('limpieza'); });
    await app.user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(20); });
    expect(pedidosListado(s).at(-1)!.consulta).not.toHaveProperty('oficio');
    expect(screen.getByLabelText('Oficio')).toHaveValue('');
  });

  it('se filtra con Enter desde un campo de fecha', async () => {
    const s = consultas();
    const app = await montarApp({ servidor: s });
    await esperarCarga();
    await app.user.type(screen.getByLabelText('Hasta'), '2020-01-01{Enter}');
    expect(await screen.findByText('No hay cotizaciones con esos filtros')).toBeInTheDocument();
  });

  it('las opciones del filtro usan los nombres del catálogo', async () => {
    const s = consultas();
    s.agregarTextos({ 'oficio.jardineria': 'Parques y jardines' });
    await montarApp({ servidor: s });
    await esperarCarga();
    await waitFor(() => { expect(within(screen.getByLabelText('Oficio')).getByRole('option', { name: 'Parques y jardines' })).toBeInTheDocument(); });
  });
});

describe('Mis cotizaciones: vacío, errores y accesibilidad', () => {
  it('sin ninguna cotización explica cómo se llena', async () => {
    await montarApp({ cantidadConsultas: 0 });
    expect(await screen.findByText('Todavía no tenés cotizaciones')).toBeInTheDocument();
    expect(screen.getByText(/Cuando un cliente use tu enlace/)).toBeInTheDocument();
  });

  it('si no carga, muestra el error con el código para soporte y permite reintentar', async () => {
    const s = consultas();
    s.inyectarFalla({ ruta: '/v1/panel/cotizaciones', status: 500, codigo: 'error_interno' });
    const app = await montarApp({ servidor: s });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    expect(alerta).toHaveTextContent(/Código para soporte: tr_[0-9a-f]{16}/);
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => { expect(tarjetas()).toHaveLength(20); });
  });

  it('un 429 dice cuánto esperar', async () => {
    const s = consultas();
    s.inyectarFalla({ ruta: '/v1/panel/cotizaciones', status: 429, codigo: 'limite_de_tasa', reintentarEnS: 7 });
    await montarApp({ servidor: s });
    expect(await screen.findByRole('alert')).toHaveTextContent(`${MENSAJES_ERROR.limite_de_tasa!} Podés reintentar en 7 s.`);
  });

  it('sin conexión lo dice con las palabras del panel', async () => {
    const s = consultas();
    s.inyectarFalla({ ruta: '/v1/panel/cotizaciones', sinConexion: true });
    await montarApp({ servidor: s });
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
  });

  it('un administrador solo ve SUS cotizaciones, no las de otro asesor', async () => {
    const s = consultas();
    await montarApp({ servidor: s, email: 'admin@asesores.local' });
    await esperarCarga();
    const ajena = s.consultasDe(ASESOR.asesorId)[0]!;
    expect(document.getElementById(`cot-${ajena.detalle.sesion_id}`)).toBeNull();
    const propia = s.consultasDe('ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5')[0]!;
    expect(document.getElementById(`cot-${propia.detalle.sesion_id}`)).not.toBeNull();
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const app = await montarApp();
    await esperarCarga();
    await sinViolacionesDeAccesibilidad(app.container);
  });
});
