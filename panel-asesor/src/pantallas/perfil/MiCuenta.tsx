import { useState, type FormEvent } from 'react';
import { Alerta, Boton, Cargando, CampoSelect, CampoTexto, EstadoVacio, ErrorDeCarga, TituloPagina } from '../../componentes/basicos';
import type { Consumo } from '../../api/tipos';
import { useMensajeDeError } from '../../contexto/catalogo';
import { esCancelacion, useReautenticacion } from '../../contexto/reautenticacion';
import { useCliente } from '../../contexto/sesion';
import { ALERTA_CONSUMO } from '../../textos/panel';
import { aMinutos, etiquetaPeriodo, formatearDuracion, formatearFechaCorta, formatearFechaHora, ultimosPeriodos } from '../../util/formato';
import { descargarJson } from '../../util/portapapeles';
import { useCarga } from '../../util/useCarga';

export function MiCuenta() {
  return (
    <>
      <TituloPagina>Mi cuenta</TituloPagina>
      <SeccionConsumo />
      <SeccionContrasena />
      <SeccionExportacion />
    </>
  );
}

// ---- Consumo ---------------------------------------------------------------------------------------------

function SeccionConsumo() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const periodos = ultimosPeriodos(6);
  const [periodo, setPeriodo] = useState(periodos[0] ?? '');
  const carga = useCarga(periodo, (signal) => cliente.leerConsumo(periodo, signal));

  return (
    <section className="tarjeta" aria-labelledby="titulo-consumo">
      <h2 id="titulo-consumo">Tu consumo</h2>
      <CampoSelect
        etiqueta="Mes"
        value={periodo}
        onChange={(e) => {
          setPeriodo(e.target.value);
        }}
      >
        {periodos.map((p) => (
          <option key={p} value={p}>
            {etiquetaPeriodo(p)}
          </option>
        ))}
      </CampoSelect>
      {carga.estado === 'cargando' ? <Cargando texto="Cargando el consumo…" /> : null}
      {carga.estado === 'error' ? (
        <ErrorDeCarga mensaje={mensaje(carga.error)} idTraza={carga.error.idTraza} alReintentar={carga.recargar} />
      ) : null}
      {carga.estado === 'ok' ? <DetalleConsumo consumo={carga.datos} /> : null}
    </section>
  );
}

/** Porcentaje entero sin float: 12 de 500 → 2. */
export function porcentaje(usado: number, tope: number): number {
  if (tope <= 0) return 0;
  return Math.floor((usado * 100) / tope);
}

function DetalleConsumo({ consumo }: { consumo: Consumo }) {
  const usadosMin = aMinutos(consumo.segundos_usados);
  const topeMin = aMinutos(consumo.segundos_tope);
  const pct = porcentaje(consumo.segundos_usados, consumo.segundos_tope);
  const aviso = ALERTA_CONSUMO[consumo.alerta];
  return (
    <>
      {aviso ? <Alerta tipo={consumo.alerta === 'p100' ? 'error' : 'aviso'}>{aviso}</Alerta> : null}
      <p className="consumo__cifra">
        <strong>{usadosMin}</strong> de <strong>{topeMin}</strong> minutos usados ({pct} %)
      </p>
      <progress
        className="consumo__barra"
        max={Math.max(1, consumo.segundos_tope)}
        value={Math.min(consumo.segundos_usados, Math.max(1, consumo.segundos_tope))}
        aria-label={`Minutos usados en ${etiquetaPeriodo(consumo.periodo)}`}
      >
        {pct} %
      </progress>
      <p>
        Videocotizaciones en curso ahora: <strong>{consumo.simultaneas_en_curso}</strong> de{' '}
        <strong>{consumo.simultaneas_tope}</strong> simultáneas.
      </p>
      {consumo.diario.length === 0 ? (
        <EstadoVacio titulo="Sin actividad en este mes">Todavía no hubo videocotizaciones en este período.</EstadoVacio>
      ) : (
        <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Consumo día por día">
          <table className="tabla">
            <caption className="solo-lectores">Consumo día por día</caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Tiempo</th>
                <th scope="col">Sesiones</th>
                <th scope="col">Cotizaciones emitidas</th>
              </tr>
            </thead>
            <tbody>
              {consumo.diario.map((d) => (
                <tr key={d.fecha}>
                  <th scope="row">{formatearFechaCorta(d.fecha)}</th>
                  <td>{formatearDuracion(d.segundos)}</td>
                  <td>{d.sesiones}</td>
                  <td>{d.cotizaciones_emitidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="texto-chico">Actualizado el {formatearFechaHora(consumo.actualizado_en)}.</p>
    </>
  );
}

// ---- Contraseña ------------------------------------------------------------------------------------------

function SeccionContrasena() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const { conReautenticacion } = useReautenticacion();
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<{ nueva?: string; repetida?: string }>({});
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error'; texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;
    const formulario = e.currentTarget;
    const nuevos: { nueva?: string; repetida?: string } = {};
    if (nueva.length < 12 || nueva.length > 256) nuevos.nueva = 'La contraseña nueva tiene entre 12 y 256 caracteres.';
    if (repetida !== nueva) nuevos.repetida = 'Las dos contraseñas tienen que ser iguales.';
    setErrores(nuevos);
    setResultado(null);
    if (nuevos.nueva ?? nuevos.repetida) {
      setTimeout(() => formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setEnviando(true);
    try {
      await conReautenticacion(() => cliente.cambiarContrasena({ contrasena_nueva: nueva }));
      setNueva('');
      setRepetida('');
      setResultado({ tipo: 'exito', texto: 'Cambiaste tu contraseña. Las demás sesiones abiertas se cerraron.', n: (resultado?.n ?? 0) + 1 });
    } catch (err) {
      if (!esCancelacion(err)) setResultado({ tipo: 'error', texto: mensaje(err), n: (resultado?.n ?? 0) + 1 });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="tarjeta" aria-labelledby="titulo-contrasena">
      <h2 id="titulo-contrasena">Cambiar la contraseña</h2>
      <p>Te vamos a pedir que confirmes tu identidad con tu contraseña actual y tu código de verificación.</p>
      {resultado ? (
        <Alerta key={resultado.n} tipo={resultado.tipo} enfocar>
          {resultado.texto}
        </Alerta>
      ) : null}
      <CampoTexto
        etiqueta="Contraseña nueva"
        ayuda="Al menos 12 caracteres. Una frase larga es más segura que una palabra rara."
        type="password"
        autoComplete="new-password"
        value={nueva}
        error={errores.nueva}
        onChange={(e) => {
          setNueva(e.target.value);
        }}
      />
      <CampoTexto
        etiqueta="Repetí la contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={repetida}
        error={errores.repetida}
        onChange={(e) => {
          setRepetida(e.target.value);
        }}
      />
      <div className="acciones">
        <Boton type="submit" variante="primario" ocupado={enviando}>
          {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
        </Boton>
      </div>
    </form>
  );
}

// ---- Exportación -----------------------------------------------------------------------------------------

function SeccionExportacion() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const { conReautenticacion } = useReautenticacion();
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error'; texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const exportar = async () => {
    if (enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const datos = await conReautenticacion(() => cliente.exportarMiCuenta());
      const nombre = `videocotizacion-mi-cuenta-${datos.generada_en.slice(0, 10)}.json`;
      descargarJson(nombre, datos);
      setResultado({ tipo: 'exito', texto: `Descargamos tus datos en el archivo ${nombre}.`, n: (resultado?.n ?? 0) + 1 });
    } catch (err) {
      if (!esCancelacion(err)) setResultado({ tipo: 'error', texto: mensaje(err), n: (resultado?.n ?? 0) + 1 });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="tarjeta" aria-labelledby="titulo-exportar">
      <h2 id="titulo-exportar">Descargar mis datos</h2>
      <p>
        Es tu derecho de acceso: un archivo con tu perfil, el registro de lo que viste en el panel y tu consumo. Queda
        asentado en Registros.
      </p>
      {resultado ? (
        <Alerta key={resultado.n} tipo={resultado.tipo} enfocar={resultado.tipo === 'error'}>
          {resultado.texto}
        </Alerta>
      ) : null}
      <div className="acciones">
        <Boton ocupado={enviando} onClick={() => void exportar()}>
          {enviando ? 'Preparando…' : 'Descargar mis datos'}
        </Boton>
      </div>
    </section>
  );
}
