import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENSAJES_ERROR } from '../../api/generado/errores';
import { crearServidorMock, type ServidorMock } from '../../mock/servidor';
import type { FilaConsulta } from '../../mock/datos';
import { ASESOR, esperarCarga, montarApp, sinViolacionesDeAccesibilidad } from '../../test/ayudas';
import { formatearCantidad, formatearFechaHora, formatearMoneda } from '../../util/formato';

function filas(s: ServidorMock): readonly FilaConsulta[] {
  return s.consultasDe(ASESOR.asesorId);
}
const conPresupuesto = (s: ServidorMock) => filas(s).find((f) => f.detalle.cotizacion && !f.detalle.cotizacion.fuera_de_zona && f.contactoDisponible)!;
const sinContacto = (s: ServidorMock) => filas(s).find((f) => f.detalle.cotizacion && !f.contactoDisponible)!;
const fueraDeZona = (s: ServidorMock) => filas(s).find((f) => f.detalle.cotizacion?.fuera_de_zona)!;
const enCurso = (s: ServidorMock) => filas(s).find((f) => f.detalle.estado === 'en_curso')!;

async function abrirDetalle(fila: FilaConsulta, servidor: ServidorMock, opciones: { desdeLista?: boolean } = {}) {
  if (!opciones.desdeLista) {
    const app = await montarApp({ servidor, ruta: `/cotizaciones/${fila.detalle.sesion_id}` });
    await screen.findByRole('heading', { level: 1 });
    await esperarCarga();
    return app;
  }
  const app = await montarApp({ servidor, ruta: '/cotizaciones' });
  await esperarCarga();
  const art = document.getElementById(`cot-${fila.detalle.sesion_id}`)!.closest('article')!;
  await app.user.click(within(art).getByRole('link', { name: /Ver detalle/ }));
  await screen.findByRole('heading', { name: /^Consulta del/ });
  await esperarCarga();
  return app;
}

describe('Detalle de una cotización', () => {
  it('muestra el título con la fecha, lo enfoca y ofrece volver a la lista', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s);
    const titulo = screen.getByRole('heading', { level: 1 });
    expect(titulo.textContent).toBe(`Consulta del ${formatearFechaHora(fila.detalle.creada_en)}`);
    await waitFor(() => {
      expect(titulo).toHaveFocus();
    });
    expect(screen.getByRole('link', { name: '← Volver a Mis cotizaciones' })).toHaveAttribute('href', '/cotizaciones');
    expect(document.title).toBe('Detalle de la consulta · Panel del asesor');
  });

  it('el presupuesto se muestra como tabla con cantidades, precios e importes bien formateados y el total orientativo', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s);
    const c = fila.detalle.cotizacion!;
    const tabla = screen.getByRole('table', { name: 'Ítems del presupuesto orientativo' });
    const item = c.items[0]!;
    const filaItem = within(tabla).getByRole('row', { name: new RegExp(item.descripcion) });
    expect(within(filaItem).getByText(formatearMoneda(item.precio_unitario_centavos, 'ARS'))).toBeInTheDocument();
    expect(within(filaItem).getByText(formatearMoneda(item.importe_centavos, 'ARS'))).toBeInTheDocument();
    expect(within(filaItem).getByText(new RegExp(`^${formatearCantidad(item.cantidad_centesimas)} `))).toBeInTheDocument();
    const total = within(tabla).getByRole('row', { name: /Total orientativo/ });
    expect(total).toHaveTextContent(formatearMoneda(c.total_centavos, 'ARS'));
    expect(screen.getByText(c.leyenda)).toBeInTheDocument();
    expect(screen.getByText(/Válido por 15 días · Tarifas 2026\.1\./)).toBeInTheDocument();
    expect(screen.getByText('Tarifas de referencia: todavía no las validó un profesional.')).toBeInTheDocument();
  });

  it('NO muestra código de referencia ni derivación a WhatsApp: viven solo en el listado (contrato 0.1.4)', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s);
    expect(screen.queryByText(/Código de referencia/)).not.toBeInTheDocument();
    expect(screen.queryByText(fila.codigoReferencia!)).not.toBeInTheDocument();
    expect(screen.queryByText(/derivaci/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('wa.me/?');
  });

  it('muestra los datos relevados con etiquetas en castellano y avisa lo que falta', async () => {
    const s = crearServidorMock();
    const fila = filas(s).find((f) => f.detalle.datos_extraidos?.tarea && f.detalle.datos_extraidos.faltantes.length > 0)!;
    await abrirDetalle(fila, s);
    const seccion = document.getElementById('titulo-datos-relevados')!.closest('section')!;
    const d = fila.detalle.datos_extraidos!;
    expect(within(seccion).getByText('Pintura interior')).toBeInTheDocument();
    expect(within(seccion).getByText(d.interior_exterior === 'interior' ? 'Interior' : 'Exterior')).toBeInTheDocument();
    expect(within(seccion).getByText('Hasta 3 m')).toBeInTheDocument();
    expect(within(seccion).getByText('Medidas')).toBeInTheDocument();
    expect(within(seccion).getByText('Estado superficie')).toBeInTheDocument();
  });

  it('una consulta fuera de zona lo avisa en los datos y en el presupuesto', async () => {
    const s = crearServidorMock();
    const fila = fueraDeZona(s);
    await abrirDetalle(fila, s);
    expect(screen.getByText(/fuera de las zonas que atendemos\)/)).toBeInTheDocument();
    expect(screen.getByText('El trabajo es fuera de las zonas que atendemos: confirmá si podés ir.')).toBeInTheDocument();
    expect(screen.getByText('Traslado fuera de zona')).toBeInTheDocument();
  });

  it('una consulta en curso dice que todavía no hay presupuesto y no inventa una tabla', async () => {
    const s = crearServidorMock();
    await abrirDetalle(enCurso(s), s);
    expect(screen.getByText('En esta consulta todavía no se emitió un presupuesto.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('lo que dijo el asistente va plegado, con la cuenta de turnos y la advertencia si hubo un intento de manipularlo', async () => {
    const s = crearServidorMock();
    const fila = enCurso(s); // i=0: el mock marca intento_inyeccion en el turno 2
    await abrirDetalle(fila, s);
    const resumen = screen.getByText('Qué dijo el asistente (2 turnos)');
    expect(resumen.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/intentó darle instrucciones raras al asistente/)).toBeInTheDocument();
    expect(screen.getByText('Buenísimo. ¿Me decís más o menos cuánto miden los ambientes?')).toBeInTheDocument();
  });

  it('los datos técnicos traen la duración, el avatar y las versiones', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s);
    const det = screen.getByText('Datos técnicos').closest('details')!;
    expect(within(det).getByText(fila.detalle.sesion_id)).toBeInTheDocument();
    expect(within(det).getByText('2026.1')).toBeInTheDocument();
    expect(within(det).getByText('conducta_base@0a1b2c3d4e5f')).toBeInTheDocument();
    expect(within(det).getByText(/^Duración$/)).toBeInTheDocument();
  });

  it('abrir una consulta queda anotado en Registros', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s);
    expect(s.registrosDe(ASESOR.asesorId)[0]).toMatchObject({ accion: 'ver_detalle', recurso_id: fila.detalle.sesion_id });
  });

  it('un identificador con formato inválido no consulta al servidor', async () => {
    const s = crearServidorMock();
    await montarApp({ servidor: s, ruta: '/cotizaciones/../../etc/passwd' });
    expect(await screen.findByRole('heading', { name: 'No encontramos esa página' })).toBeInTheDocument();
    await montarApp({ servidor: s, ruta: '/cotizaciones/ses_corto' });
    expect(await screen.findByRole('heading', { name: 'No encontramos esa consulta' })).toBeInTheDocument();
    expect(s.pedidos.some((p) => p.ruta.includes('ses_corto'))).toBe(false);
  });

  it('una consulta que no existe, o es de otro asesor, da el mismo "no encontrado" y no ofrece reintentar', async () => {
    const s = crearServidorMock();
    const ajena = s.consultasDe('ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5')[0]!;
    await montarApp({ servidor: s, ruta: `/cotizaciones/${ajena.detalle.sesion_id}` });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.no_encontrado!);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Detalle de la consulta');
  });

  it('si falla la carga permite reintentar', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    s.inyectarFalla({ ruta: `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`, status: 500, codigo: 'error_interno' });
    const app = await montarApp({ servidor: s, ruta: `/cotizaciones/${fila.detalle.sesion_id}` });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_ERROR.error_interno!);
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /^Consulta del/ })).toBeInTheDocument();
  });

  it('no ejecuta ni interpreta HTML que venga en los textos del cliente', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    const hostil = { ...fila.detalle, resumen: '<img src=x onerror="alert(1)">Resumen', datos_extraidos: { ...fila.detalle.datos_extraidos, observaciones: '<script>alert(2)</script>' } };
    s.inyectarFalla({ ruta: `/v1/panel/cotizaciones/${fila.detalle.sesion_id}`, respuestaJson: hostil });
    await montarApp({ servidor: s, ruta: `/cotizaciones/${fila.detalle.sesion_id}` });
    expect(await screen.findByText('<img src=x onerror="alert(1)">Resumen')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
  });

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const s = crearServidorMock();
    const app = await abrirDetalle(conPresupuesto(s), s);
    await sinViolacionesDeAccesibilidad(app.container);
  });
});

describe('Detalle: contacto del cliente', () => {
  it('no se lee hasta que la persona lo pide (cada lectura queda registrada)', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    await abrirDetalle(fila, s, { desdeLista: true });
    expect(s.pedidos.some((p) => p.ruta.endsWith('/contacto'))).toBe(false);
    expect(screen.getByText(/cada vez que los abrís queda un registro/)).toBeInTheDocument();
    expect(screen.queryByText(fila.contacto!.nombre)).not.toBeInTheDocument();
  });

  it('al pedirlo muestra nombre, teléfono con enlaces para llamar y escribir por WhatsApp, correo y preferencia, y mueve el foco', async () => {
    const s = crearServidorMock();
    const fila = filas(s).find((f) => f.contacto?.email && f.contacto.telefono)!;
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    const bloque = await screen.findByLabelText('Datos de contacto del cliente');
    expect(bloque).toHaveFocus();
    expect(within(bloque).getByText(fila.contacto!.nombre)).toBeInTheDocument();
    expect(within(bloque).getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', `tel:${fila.contacto!.telefono}`);
    const wa = within(bloque).getByRole('link', { name: /Escribir por WhatsApp/ });
    expect(wa).toHaveAttribute('href', `https://wa.me/${fila.contacto!.telefono!.replace('+', '')}`);
    expect(wa).toHaveAttribute('target', '_blank');
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(bloque).getByRole('link', { name: fila.contacto!.email! })).toHaveAttribute('href', `mailto:${fila.contacto!.email!}`);
    expect(within(bloque).getByText(/Versión 2026-10-08\.1, el /)).toBeInTheDocument();
    expect(within(bloque).getByText(/Esta lectura quedó registrada\. Hoy te quedan 19 lecturas de contactos\./)).toBeInTheDocument();
  });

  it('la lectura queda registrada en el servidor', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    await screen.findByLabelText('Datos de contacto del cliente');
    expect(s.registrosDe(ASESOR.asesorId)[0]).toMatchObject({ accion: 'ver_contacto', recurso_id: fila.detalle.sesion_id });
  });

  it('"Ocultar los datos" los saca de la pantalla y devuelve el foco al botón', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    await screen.findByLabelText('Datos de contacto del cliente');
    await app.user.click(screen.getByRole('button', { name: 'Ocultar los datos' }));
    expect(screen.queryByText(fila.contacto!.nombre)).not.toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Ver datos de contacto' })).toHaveFocus(); });
  });

  it('usa el singular cuando queda una sola lectura y avisa cuando ya no quedan', async () => {
    const s = crearServidorMock({ limiteLecturasContacto: 2 });
    const [a, b] = filas(s).filter((f) => f.contactoDisponible);
    const app = await abrirDetalle(a!, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    expect(await screen.findByText(/Hoy te queda 1 lectura de contactos\./)).toBeInTheDocument();
    await app.user.click(screen.getByRole('link', { name: '← Volver a Mis cotizaciones' }));
    await esperarCarga();
    const art = document.getElementById(`cot-${b!.detalle.sesion_id}`)!.closest('article')!;
    await app.user.click(within(art).getByRole('link', { name: /Ver detalle/ }));
    await app.user.click(await screen.findByRole('button', { name: 'Ver datos de contacto' }));
    expect(await screen.findByText(/Ya no te quedan lecturas de contactos por hoy\./)).toBeInTheDocument();
  });

  it('al llegar al tope diario avisa con cuánto esperar y no muestra datos', async () => {
    const s = crearServidorMock({ limiteLecturasContacto: 1 });
    const [a, b] = filas(s).filter((f) => f.contactoDisponible);
    const app = await abrirDetalle(a!, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    await screen.findByLabelText('Datos de contacto del cliente');
    await app.user.click(screen.getByRole('link', { name: '← Volver a Mis cotizaciones' }));
    await esperarCarga();
    const art = document.getElementById(`cot-${b!.detalle.sesion_id}`)!.closest('article')!;
    await app.user.click(within(art).getByRole('link', { name: /Ver detalle/ }));
    await app.user.click(await screen.findByRole('button', { name: 'Ver datos de contacto' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(`${MENSAJES_ERROR.limite_lecturas_contacto!} Podés reintentar en 1 h.`);
    expect(screen.queryByText(b!.contacto!.nombre)).not.toBeInTheDocument();
  });

  it('si el listado dijo que NO dejó contacto, no ofrece pedirlo', async () => {
    const s = crearServidorMock();
    const fila = sinContacto(s);
    await abrirDetalle(fila, s, { desdeLista: true });
    expect(screen.getByText('El cliente no dejó datos de contacto en esta consulta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver datos de contacto' })).not.toBeInTheDocument();
    expect(s.pedidos.some((p) => p.ruta.endsWith('/contacto'))).toBe(false);
  });

  it('si se llega al detalle sin pasar por el listado (no se sabe si hay contacto), igual se puede pedir y el 404 se explica', async () => {
    const s = crearServidorMock();
    const fila = sinContacto(s);
    const app = await abrirDetalle(fila, s);
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(MENSAJES_ERROR.no_encontrado!);
    expect(alerta).toHaveTextContent('Puede ser que el cliente no haya dejado sus datos de contacto.');
  });

  it('no arma enlaces con teléfonos o correos raros y no interpreta HTML del cliente', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    s.inyectarFalla({
      ruta: `/v1/panel/cotizaciones/${fila.detalle.sesion_id}/contacto`,
      respuestaJson: {
        sesion_id: fila.detalle.sesion_id,
        nombre: '<b onclick="x()">Carlos</b>',
        telefono: 'javascript:alert(1)',
        email: 'no es un correo "><x',
        consentido_en: '2026-10-08T13:16:00Z',
        aviso_version: '2026-10-08.1',
        lectura: { registro_id: 'reg_916KPKQ91R99GN90D0SN9M59QR', lecturas_restantes_hoy: 3 },
      },
    });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    const bloque = await screen.findByLabelText('Datos de contacto del cliente');
    expect(within(bloque).getByText('<b onclick="x()">Carlos</b>')).toBeInTheDocument();
    expect(within(bloque).queryByRole('link')).not.toBeInTheDocument();
    expect(bloque.querySelector('b')).toBeNull();
  });

  it('no manda dos lecturas si se hace clic dos veces', async () => {
    const s = crearServidorMock();
    const fila = conPresupuesto(s);
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    const retenido = s.retener(/\/contacto$/);
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    await app.user.click(await screen.findByRole('button', { name: 'Abriendo…' }));
    retenido.liberar();
    await screen.findByLabelText('Datos de contacto del cliente');
    expect(s.pedidos.filter((p) => p.ruta.endsWith('/contacto'))).toHaveLength(1);
  });

  it('con los datos abiertos no tiene violaciones de accesibilidad (axe)', async () => {
    const s = crearServidorMock();
    const fila = filas(s).find((f) => f.contacto?.email)!;
    const app = await abrirDetalle(fila, s, { desdeLista: true });
    await app.user.click(screen.getByRole('button', { name: 'Ver datos de contacto' }));
    await screen.findByLabelText('Datos de contacto del cliente');
    await sinViolacionesDeAccesibilidad(app.container);
  });
});
