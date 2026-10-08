import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alerta, Cargando, ErrorDeCarga, TituloPagina } from '../../componentes/basicos';
import type { Cotizacion, DatosExtraidos, SesionDetalle } from '../../api/tipos';
import { useCatalogo, useMensajeDeError } from '../../contexto/catalogo';
import { useCliente } from '../../contexto/sesion';
import { ESTADO_SESION, ESTADO_TARIFAS, ETIQUETA_DATO } from '../../textos/panel';
import {
  etiquetaUnidad,
  formatearCantidad,
  formatearDuracion,
  formatearFechaHora,
  formatearMoneda,
} from '../../util/formato';
import { useCarga } from '../../util/useCarga';
import { ContactoDelCliente } from './ContactoDelCliente';

const PATRON_ID_SESION = /^ses_[0-9A-HJKMNP-TV-Z]{26}$/;

export function DetalleCotizacion() {
  const { sesionId = '' } = useParams();
  const ubicacion = useLocation();
  const contactoDisponible = (ubicacion.state as { contactoDisponible?: unknown } | null)?.contactoDisponible;
  return (
    <>
      <p className="migas">
        <Link to="/cotizaciones">← Volver a Mis cotizaciones</Link>
      </p>
      {PATRON_ID_SESION.test(sesionId) ? (
        <Contenido sesionId={sesionId} contactoDisponible={typeof contactoDisponible === 'boolean' ? contactoDisponible : undefined} />
      ) : (
        <>
          <TituloPagina titulo="Consulta no encontrada">No encontramos esa consulta</TituloPagina>
          <p>El enlace no corresponde a una consulta tuya.</p>
        </>
      )}
    </>
  );
}

function Contenido({ sesionId, contactoDisponible }: { sesionId: string; contactoDisponible: boolean | undefined }) {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const carga = useCarga(sesionId, (signal) => cliente.leerCotizacion(sesionId, signal));

  if (carga.estado === 'cargando') {
    return (
      <>
        <TituloPagina titulo="Detalle de la consulta">Detalle de la consulta</TituloPagina>
        <Cargando texto="Cargando la consulta…" />
      </>
    );
  }
  if (carga.estado === 'error') {
    return (
      <>
        <TituloPagina titulo="Detalle de la consulta">Detalle de la consulta</TituloPagina>
        <ErrorDeCarga
          mensaje={mensaje(carga.error)}
          idTraza={carga.error.idTraza}
          alReintentar={carga.error.codigo === 'no_encontrado' ? undefined : carga.recargar}
        />
      </>
    );
  }
  return <Detalle detalle={carga.datos} contactoDisponible={contactoDisponible} />;
}

export function Detalle({ detalle, contactoDisponible }: { detalle: SesionDetalle; contactoDisponible: boolean | undefined }) {
  const { motivo } = useCatalogo();
  return (
    <>
      <TituloPagina titulo="Detalle de la consulta">{`Consulta del ${formatearFechaHora(detalle.creada_en)}`}</TituloPagina>
      <ul className="etiquetas" aria-label="Estado de la consulta">
        <li className="etiqueta">{ESTADO_SESION[detalle.estado]}</li>
        {detalle.motivo_cierre ? <li className="etiqueta">{motivo(detalle.motivo_cierre)}</li> : null}
      </ul>

      <section className="tarjeta" aria-labelledby="titulo-resumen">
        <h2 id="titulo-resumen">Resumen de la consulta</h2>
        <p className="texto-libre">{detalle.resumen}</p>
        <p className="texto-chico">
          Es un resumen escrito. Las imágenes de la cámara del cliente no se guardan ni se muestran en el panel.
        </p>
      </section>

      {detalle.datos_extraidos ? <DatosRelevados datos={detalle.datos_extraidos} /> : null}
      {detalle.cotizacion ? (
        <Presupuesto cotizacion={detalle.cotizacion} />
      ) : (
        <section className="tarjeta" aria-labelledby="titulo-presupuesto">
          <h2 id="titulo-presupuesto">Presupuesto orientativo</h2>
          <p>En esta consulta todavía no se emitió un presupuesto.</p>
        </section>
      )}

      <section className="tarjeta" aria-labelledby="titulo-contacto">
        <h2 id="titulo-contacto">Contacto del cliente</h2>
        <ContactoDelCliente sesionId={detalle.sesion_id} contactoDisponible={contactoDisponible} />
      </section>

      {detalle.respuestas_modelo && detalle.respuestas_modelo.length > 0 ? <RespuestasDelAsistente detalle={detalle} /> : null}

      <details className="tarjeta desplegable">
        <summary>Datos técnicos</summary>
        <dl className="datos">
          <Dato titulo="Duración">{formatearDuracion(detalle.duracion_s)}</Dato>
          <Dato titulo="Avatar">{detalle.modo_avatar === '3d' ? '3D en vivo' : 'Clips pregrabados'}</Dato>
          {detalle.cerrada_en ? <Dato titulo="Cerrada">{formatearFechaHora(detalle.cerrada_en)}</Dato> : null}
          <Dato titulo="Versión de tarifas">{detalle.versiones.tarifas}</Dato>
          <Dato titulo="Versión del guion">{detalle.versiones.prompt}</Dato>
          <Dato titulo="Versión del esquema">{detalle.versiones.esquema_salida}</Dato>
          <Dato titulo="Identificador">
            <code>{detalle.sesion_id}</code>
          </Dato>
        </dl>
      </details>
    </>
  );
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function humanizar(codigo: string): string {
  const t = codigo.replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function DatosRelevados({ datos }: { datos: DatosExtraidos }) {
  const { oficio, zona } = useCatalogo();
  return (
    <section className="tarjeta" aria-labelledby="titulo-datos-relevados">
      <h2 id="titulo-datos-relevados">Datos relevados</h2>
      <dl className="datos">
        <Dato titulo="Oficio">{oficio(datos.oficio)}</Dato>
        {datos.tarea ? <Dato titulo="Tarea">{humanizar(datos.tarea)}</Dato> : null}
        <Dato titulo="Zona">{datos.fuera_de_zona ? `${zona(datos.zona)} (fuera de las zonas que atendemos)` : zona(datos.zona)}</Dato>
        {datos.superficie_centesimas_m2 !== undefined ? (
          <Dato titulo="Superficie">{formatearCantidad(datos.superficie_centesimas_m2)} m²</Dato>
        ) : null}
        {datos.cantidad_unidades !== undefined ? <Dato titulo="Cantidad">{datos.cantidad_unidades} unidades</Dato> : null}
        {datos.interior_exterior ? <Dato titulo="Interior o exterior">{ETIQUETA_DATO.interior_exterior[datos.interior_exterior]}</Dato> : null}
        {datos.altura ? <Dato titulo="Altura">{ETIQUETA_DATO.altura[datos.altura]}</Dato> : null}
        {datos.estado_superficie ? <Dato titulo="Estado de la superficie">{ETIQUETA_DATO.estado_superficie[datos.estado_superficie]}</Dato> : null}
        {datos.urgencia ? <Dato titulo="Urgencia">{ETIQUETA_DATO.urgencia[datos.urgencia]}</Dato> : null}
        {datos.plazo ? <Dato titulo="Plazo">{ETIQUETA_DATO.plazo[datos.plazo]}</Dato> : null}
        {datos.observaciones ? <Dato titulo="Observaciones del cliente"><span className="texto-libre">{datos.observaciones}</span></Dato> : null}
        <Dato titulo="Datos que faltan">
          {datos.faltantes.length === 0 ? (
            'Ninguno'
          ) : (
            <ul className="lista-simple">
              {datos.faltantes.map((f) => (
                <li key={f}>{humanizar(f)}</li>
              ))}
            </ul>
          )}
        </Dato>
        {datos.corregido_por_cliente ? <Dato titulo="Correcciones">El cliente corrigió algún dato durante la llamada.</Dato> : null}
      </dl>
    </section>
  );
}

function Presupuesto({ cotizacion: c }: { cotizacion: Cotizacion }) {
  return (
    <section className="tarjeta" aria-labelledby="titulo-presupuesto">
      <h2 id="titulo-presupuesto">Presupuesto orientativo</h2>
      {c.tarifas.estado === 'referencia_publica_sin_validar' ? (
        <Alerta tipo="aviso">{ESTADO_TARIFAS.referencia_publica_sin_validar}</Alerta>
      ) : null}
      {c.fuera_de_zona ? <Alerta tipo="info">El trabajo es fuera de las zonas que atendemos: confirmá si podés ir.</Alerta> : null}
      <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Ítems del presupuesto">
        <table className="tabla">
          <caption className="solo-lectores">Ítems del presupuesto orientativo</caption>
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="num">Cantidad</th>
              <th scope="col" className="num">Precio unitario</th>
              <th scope="col" className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((it, i) => (
              <tr key={`${it.codigo_tarea}-${String(i)}`}>
                <th scope="row">{it.descripcion}</th>
                <td className="num">
                  {formatearCantidad(it.cantidad_centesimas)} {etiquetaUnidad(it.unidad)}
                </td>
                <td className="num">{formatearMoneda(it.precio_unitario_centavos, c.moneda)}</td>
                <td className="num">{formatearMoneda(it.importe_centavos, c.moneda)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total orientativo
              </th>
              <td className="num">
                <strong>{formatearMoneda(c.total_centavos, c.moneda)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="texto-chico">{c.leyenda}</p>
      <p className="texto-chico">
        Emitido el {formatearFechaHora(c.emitida_en)} · Válido por {c.validez_dias} días · Tarifas {c.tarifas.version}.
      </p>
    </section>
  );
}

function RespuestasDelAsistente({ detalle }: { detalle: SesionDetalle }) {
  const turnos = detalle.respuestas_modelo ?? [];
  const hayInyeccion = turnos.some((t) => t.salida.intento_inyeccion);
  return (
    <details className="tarjeta desplegable">
      <summary>Qué dijo el asistente ({turnos.length} turnos)</summary>
      {hayInyeccion ? (
        <Alerta tipo="aviso">En algún momento el cliente intentó darle instrucciones raras al asistente. No cambió el presupuesto.</Alerta>
      ) : null}
      <ol className="turnos">
        {turnos.map((t) => (
          <li key={t.turno}>
            <span className="texto-chico">Turno {t.turno}</span>
            <p className="texto-libre">{t.salida.respuesta_hablada}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
