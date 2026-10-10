import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Boton, CampoSelect, CampoTexto, Cargando, ErrorDeCarga, EstadoVacio, TituloPagina } from '../../componentes/basicos';
import type { FiltrosCotizaciones, Oficio, ResumenCotizacion } from '../../api/tipos';
import { useCatalogo, useMensajeDeError } from '../../contexto/catalogo';
import { useCliente } from '../../contexto/sesion';
import { ESTADO_SESION } from '../../textos/panel';
import { formatearFechaHora, formatearMoneda, plural } from '../../util/formato';
import { useListadoPaginado } from '../../util/useCarga';

const OFICIOS: readonly Oficio[] = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
const TAMANO_PAGINA = 20;

export function MisCotizaciones() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const [filtros, setFiltros] = useState<FiltrosCotizaciones>({});
  const clave = JSON.stringify(filtros);
  const lista = useListadoPaginado<ResumenCotizacion>(clave, (cursor, signal) =>
    cliente.listarCotizaciones(filtros, { cursor, limite: TAMANO_PAGINA, signal }),
  );
  const contenedor = useRef<HTMLUListElement>(null);
  const enfocarDesde = useRef<number | null>(null);

  // Tras "Cargar más", el foco pasa a la primera cotización nueva: el botón desaparece cuando no queda nada más.
  const cantidad = lista.items.length;
  useEffect(() => {
    if (enfocarDesde.current !== null && cantidad > enfocarDesde.current) {
      contenedor.current?.querySelector<HTMLElement>(`[data-indice="${String(enfocarDesde.current)}"]`)?.focus();
      enfocarDesde.current = null;
    }
  }, [cantidad]);

  const hayFiltros = Object.keys(filtros).length > 0;

  return (
    <>
      <TituloPagina>Mis cotizaciones</TituloPagina>
      <p className="intro">
        Acá ves un resumen escrito de cada videocotización que te llegó. Las imágenes de la cámara del cliente no se guardan.
      </p>
      <Filtros aplicados={filtros} alAplicar={setFiltros} />

      {lista.fase === 'cargando' ? <Cargando texto="Cargando tus cotizaciones…" /> : null}
      {lista.fase === 'error' && lista.error ? (
        <ErrorDeCarga mensaje={mensaje(lista.error)} idTraza={lista.error.idTraza} alReintentar={lista.recargar} />
      ) : null}
      {lista.fase === 'ok' && lista.items.length === 0 ? (
        <EstadoVacio titulo={hayFiltros ? 'No hay cotizaciones con esos filtros' : 'Todavía no tenés cotizaciones'}>
          {hayFiltros
            ? 'Probá cambiando o limpiando los filtros.'
            : 'Cuando un cliente use tu enlace y termine una videocotización, la vas a ver acá.'}
        </EstadoVacio>
      ) : null}
      {lista.fase === 'ok' && lista.items.length > 0 ? (
        <>
          <ul className="lista-tarjetas" ref={contenedor} aria-label="Cotizaciones">
            {lista.items.map((c, i) => (
              <FilaCotizacion key={c.sesion_id} cotizacion={c} indice={i} />
            ))}
          </ul>
          <p className="solo-lectores" role="status">
            {lista.agregados > 0 ? `Se ${plural(lista.agregados, 'cargó 1 cotización más', `cargaron ${String(lista.agregados)} cotizaciones más`)}.` : ''}
          </p>
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
                {lista.cargandoMas ? 'Cargando…' : 'Cargar más cotizaciones'}
              </Boton>
            </div>
          ) : (
            <p className="texto-chico texto-centro">No hay más cotizaciones.</p>
          )}
        </>
      ) : null}
    </>
  );
}

function Filtros({ aplicados, alAplicar }: { aplicados: FiltrosCotizaciones; alAplicar: (f: FiltrosCotizaciones) => void }) {
  const { oficio } = useCatalogo();
  const [oficioSel, setOficioSel] = useState<Oficio | ''>(aplicados.oficio ?? '');
  const [desde, setDesde] = useState(aplicados.desde ?? '');
  const [hasta, setHasta] = useState(aplicados.hasta ?? '');
  const [error, setError] = useState<string | undefined>();

  const enviar = (e: SubmitEvent) => {
    e.preventDefault();
    if (desde !== '' && hasta !== '' && desde > hasta) {
      setError('La fecha "desde" no puede ser posterior a "hasta".');
      return;
    }
    setError(undefined);
    const f: FiltrosCotizaciones = {};
    if (oficioSel !== '') f.oficio = oficioSel;
    if (desde !== '') f.desde = desde;
    if (hasta !== '') f.hasta = hasta;
    alAplicar(f);
  };

  const limpiar = () => {
    setOficioSel('');
    setDesde('');
    setHasta('');
    setError(undefined);
    alAplicar({});
  };

  return (
    <form onSubmit={enviar} noValidate className="filtros" aria-label="Filtrar cotizaciones">
      <CampoSelect
        etiqueta="Oficio"
        value={oficioSel}
        onChange={(e) => {
          setOficioSel(e.target.value as Oficio | '');
        }}
      >
        <option value="">Todos</option>
        {OFICIOS.map((o) => (
          <option key={o} value={o}>
            {oficio(o)}
          </option>
        ))}
      </CampoSelect>
      <CampoTexto
        etiqueta="Desde"
        type="date"
        value={desde}
        onChange={(e) => {
          setDesde(e.target.value);
        }}
      />
      <CampoTexto
        etiqueta="Hasta"
        type="date"
        value={hasta}
        error={error}
        onChange={(e) => {
          setHasta(e.target.value);
        }}
      />
      <div className="acciones filtros__acciones">
        <Boton type="submit" variante="primario">
          Filtrar
        </Boton>
        <Boton onClick={limpiar}>Limpiar</Boton>
      </div>
    </form>
  );
}

function FilaCotizacion({ cotizacion: c, indice }: { cotizacion: ResumenCotizacion; indice: number }) {
  const { oficio, zona, motivo, t } = useCatalogo();
  const titulo = `${c.oficio ? oficio(c.oficio) : 'Oficio sin definir'} · ${c.zona ? zona(c.zona) : 'zona sin definir'}`;
  const idTitulo = `cot-${c.sesion_id}`;
  return (
    <li>
      <article className="tarjeta tarjeta--fila" aria-labelledby={idTitulo}>
        <header>
          <h2 id={idTitulo} tabIndex={-1} data-indice={indice} className="tarjeta__titulo">
            {titulo}
          </h2>
          <p className="texto-chico">
            <time dateTime={c.creada_en}>{formatearFechaHora(c.creada_en)}</time>
          </p>
        </header>
        <ul className="etiquetas" aria-label="Estado">
          <li className="etiqueta">{ESTADO_SESION[c.estado]}</li>
          {c.motivo_cierre ? <li className="etiqueta">{motivo(c.motivo_cierre)}</li> : null}
          {c.fuera_de_zona ? <li className="etiqueta etiqueta--aviso">Fuera de zona</li> : null}
          {c.contacto_disponible ? <li className="etiqueta etiqueta--ok">{t('panel.contacto_disponible', 'Dejó contacto')}</li> : null}
        </ul>
        <p className="tarjeta__resumen">{c.resumen}</p>
        <p className="tarjeta__total">
          {c.total ? (
            <>
              Presupuesto orientativo: <strong>{formatearMoneda(c.total.total_centavos, c.total.moneda)}</strong>
            </>
          ) : (
            'Sin presupuesto emitido'
          )}
        </p>
        {c.codigo_referencia ? (
          <p className="texto-chico">
            Código de referencia: <code>{c.codigo_referencia}</code>
          </p>
        ) : null}
        <Link className="boton boton--secundario" to={`/cotizaciones/${c.sesion_id}`} state={{ contactoDisponible: c.contacto_disponible }}>
          Ver detalle<span className="solo-lectores"> de la consulta del {formatearFechaHora(c.creada_en)}</span>
        </Link>
      </article>
    </li>
  );
}
