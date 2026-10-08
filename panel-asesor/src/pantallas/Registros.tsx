import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Boton, Cargando, ErrorDeCarga, EstadoVacio, TituloPagina } from '../componentes/basicos';
import type { RegistroLectura } from '../api/tipos';
import { useMensajeDeError } from '../contexto/catalogo';
import { useCliente } from '../contexto/sesion';
import { ACCION_REGISTRO } from '../textos/panel';
import { formatearFechaHora } from '../util/formato';
import { useListadoPaginado } from '../util/useCarga';

const TAMANO_PAGINA = 50;
const PATRON_SESION = /^ses_[0-9A-HJKMNP-TV-Z]{26}$/;

export function Registros() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const lista = useListadoPaginado<RegistroLectura>('registros', (cursor, signal) =>
    cliente.listarRegistros({ cursor, limite: TAMANO_PAGINA, signal }),
  );

  const tabla = useRef<HTMLTableSectionElement>(null);
  const enfocarDesde = useRef<number | null>(null);
  const cantidad = lista.items.length;
  // Tras "Cargar más", el foco pasa a la primera fila nueva (el botón puede desaparecer si ya no queda nada).
  useEffect(() => {
    if (enfocarDesde.current !== null && cantidad > enfocarDesde.current) {
      tabla.current?.querySelector<HTMLElement>(`[data-indice="${String(enfocarDesde.current)}"]`)?.focus();
      enfocarDesde.current = null;
    }
  }, [cantidad]);

  return (
    <>
      <TituloPagina>Registros</TituloPagina>
      <p className="intro">
        Acá queda anotado lo que hacés con datos sensibles: ver una consulta, abrir un contacto, cambiar tu enlace o tus
        claves. Solo se agrega: nadie puede borrar ni editar una fila. No guarda datos de tus clientes, solo identificadores.
      </p>
      {lista.fase === 'cargando' ? <Cargando texto="Cargando los registros…" /> : null}
      {lista.fase === 'error' && lista.error ? (
        <ErrorDeCarga mensaje={mensaje(lista.error)} idTraza={lista.error.idTraza} alReintentar={lista.recargar} />
      ) : null}
      {lista.fase === 'ok' && lista.items.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay registros">Cuando hagas algo que quede anotado, lo vas a ver acá.</EstadoVacio>
      ) : null}
      {lista.fase === 'ok' && lista.items.length > 0 ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable: debe poder recorrerse con el teclado */}
          <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Registros de actividad">
            <table className="tabla">
              <caption className="solo-lectores">Registros de actividad, del más nuevo al más viejo</caption>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Qué hiciste</th>
                  <th scope="col">Sobre qué</th>
                </tr>
              </thead>
              <tbody ref={tabla}>
                {lista.items.map((r, i) => (
                  <tr key={r.registro_id}>
                    <td tabIndex={-1} data-indice={i}>
                      <time dateTime={r.ocurrido_en}>{formatearFechaHora(r.ocurrido_en)}</time>
                    </td>
                    <td>{ACCION_REGISTRO[r.accion]}</td>
                    <td>
                      {r.recurso_id && PATRON_SESION.test(r.recurso_id) ? (
                        <Link to={`/cotizaciones/${r.recurso_id}`}>
                          Consulta <code>{r.recurso_id}</code>
                        </Link>
                      ) : r.recurso_id ? (
                        <code>{r.recurso_id}</code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista.errorMas ? <Alerta tipo="error">{mensaje(lista.errorMas)}</Alerta> : null}
          {lista.hayMas ? (
            <div className="acciones acciones--centro">
              <Boton
                ocupado={lista.cargandoMas}
                onClick={() => {
                  enfocarDesde.current = lista.items.length;
                  lista.cargarMas();
                }}
              >
                {lista.cargandoMas ? 'Cargando…' : 'Cargar registros más viejos'}
              </Boton>
            </div>
          ) : (
            <p className="texto-chico texto-centro">No hay registros más viejos.</p>
          )}
        </>
      ) : null}
    </>
  );
}
