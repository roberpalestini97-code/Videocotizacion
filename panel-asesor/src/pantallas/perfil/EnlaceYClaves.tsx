import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alerta, Boton, CampoAreaTexto, CampoTexto, Cargando, ErrorDeCarga, EstadoVacio, TituloPagina } from '../../componentes/basicos';
import { BotonCopiar } from '../../componentes/BotonCopiar';
import { ConfirmarDialogo } from '../../componentes/ConfirmarDialogo';
import { comoErrorApi } from '../../api/errores';
import type { ClaveWidget, EnlaceCompartir } from '../../api/tipos';
import { useMensajeDeError } from '../../contexto/catalogo';
import { esCancelacion, useReautenticacion } from '../../contexto/reautenticacion';
import { useAsesor, useCliente } from '../../contexto/sesion';
import { formatearFechaHora } from '../../util/formato';
import { useCarga } from '../../util/useCarga';

export function EnlaceYClaves() {
  const asesor = useAsesor();
  return (
    <>
      <TituloPagina>Enlace y claves del widget</TituloPagina>
      <SeccionEnlace />
      {/* Esto solo ordena la pantalla: el permiso real lo verifica el backend (403 alcance_insuficiente). */}
      {asesor.rol === 'administrador' ? (
        <SeccionClaves />
      ) : (
        <section className="tarjeta" aria-labelledby="titulo-claves-info">
          <h2 id="titulo-claves-info">Claves del widget</h2>
          <p>Las claves del widget las gestionan los administradores de tu equipo.</p>
        </section>
      )}
    </>
  );
}

// ---- Enlace para compartir ----------------------------------------------------------------------------------

export function SeccionEnlace() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const { conReautenticacion } = useReautenticacion();
  const carga = useCarga('enlace', (signal) => cliente.leerEnlace(signal));
  const [rotado, setRotado] = useState<EnlaceCompartir | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error'; texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const rotar = async () => {
    setConfirmando(false);
    setEnviando(true);
    setResultado(null);
    try {
      const nuevo = await conReautenticacion(() => cliente.rotarEnlace());
      setRotado(nuevo);
      setResultado({ tipo: 'exito', texto: 'Listo: tu enlace nuevo ya funciona y el anterior dejó de andar.', n: (resultado?.n ?? 0) + 1 });
    } catch (err) {
      if (!esCancelacion(err)) setResultado({ tipo: 'error', texto: mensaje(err), n: (resultado?.n ?? 0) + 1 });
    } finally {
      setEnviando(false);
    }
  };

  const enlace = rotado ?? (carga.estado === 'ok' ? carga.datos : null);

  return (
    <section className="tarjeta" aria-labelledby="titulo-enlace">
      <h2 id="titulo-enlace">Tu enlace para compartir</h2>
      <p>Mandáselo a tus clientes: al abrirlo hablan con el asistente de VideoCotización y la consulta te llega a vos.</p>
      {carga.estado === 'cargando' ? <Cargando texto="Cargando tu enlace…" /> : null}
      {carga.estado === 'error' ? (
        <ErrorDeCarga mensaje={mensaje(carga.error)} idTraza={carga.error.idTraza} alReintentar={carga.recargar} />
      ) : null}
      {resultado ? (
        <Alerta key={resultado.n} tipo={resultado.tipo} enfocar>
          {resultado.texto}
        </Alerta>
      ) : null}
      {enlace ? (
        <>
          <CampoTexto etiqueta="Enlace" readOnly value={enlace.url} onFocus={(e) => { e.currentTarget.select(); }} />
          <div className="acciones">
            <BotonCopiar texto={enlace.url} etiqueta="Copiar enlace" />
          </div>
          <CampoAreaTexto etiqueta="Texto para compartir" readOnly rows={3} value={enlace.texto_compartir} />
          <div className="acciones">
            <BotonCopiar texto={enlace.texto_compartir} etiqueta="Copiar texto" />
            <a className="boton boton--secundario" href={`https://wa.me/?text=${encodeURIComponent(enlace.texto_compartir)}`} target="_blank" rel="noopener noreferrer">
              Compartir por WhatsApp<span className="solo-lectores"> (se abre en otra pestaña)</span>
            </a>
          </div>
          {enlace.rotado_en ? <p className="texto-chico">Último cambio de enlace: {formatearFechaHora(enlace.rotado_en)}.</p> : null}
          <div className="acciones">
            <Boton
              variante="peligro"
              ocupado={enviando}
              onClick={() => {
                setConfirmando(true);
              }}
            >
              {enviando ? 'Cambiando…' : 'Generar un enlace nuevo'}
            </Boton>
          </div>
        </>
      ) : null}
      {confirmando ? (
        <ConfirmarDialogo
          titulo="¿Generar un enlace nuevo?"
          descripcion="El enlace actual va a dejar de funcionar: quien lo abra va a ver que no existe. Tenés que mandar el nuevo a tus clientes. Te vamos a pedir confirmar tu identidad."
          textoConfirmar="Sí, generar uno nuevo"
          peligro
          alConfirmar={() => void rotar()}
          alCancelar={() => {
            setConfirmando(false);
          }}
        />
      ) : null}
    </section>
  );
}

// ---- Claves del widget --------------------------------------------------------------------------------------

const PATRON_ORIGIN = /^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?$/;
// eslint-disable-next-line no-control-regex
const PATRON_NOMBRE = /^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F]*$/;

export function parsearOrigins(texto: string): string[] {
  return texto
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

export function SeccionClaves() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const { conReautenticacion } = useReautenticacion();
  const [version, setVersion] = useState(0);
  const lista = useCarga(`claves-${version}`, (signal) => cliente.listarClavesWidget(signal));

  // Valor completo de la clave recién creada: vive SOLO en este estado, hasta que la persona lo descarta.
  const [recienCreada, setRecienCreada] = useState<{ nombre: string; valor: string } | null>(null);
  const [aRevocar, setARevocar] = useState<ClaveWidget | null>(null);
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error'; texto: string; n: number } | null>(null);
  const refAvisoClave = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recienCreada) refAvisoClave.current?.focus();
  }, [recienCreada]);

  const revocar = async (clave: ClaveWidget) => {
    setARevocar(null);
    setResultado(null);
    try {
      await conReautenticacion(() => cliente.revocarClaveWidget(clave.clave_id));
      setVersion((v) => v + 1);
      setResultado({ tipo: 'exito', texto: `Revocaste la clave "${clave.nombre}". Deja de funcionar en menos de un minuto.`, n: (resultado?.n ?? 0) + 1 });
    } catch (err) {
      if (!esCancelacion(err)) setResultado({ tipo: 'error', texto: mensaje(err), n: (resultado?.n ?? 0) + 1 });
    }
  };

  return (
    <section className="tarjeta" aria-labelledby="titulo-claves">
      <h2 id="titulo-claves">Claves del widget</h2>
      <p>
        La clave pública es la que lleva el botón "Iniciar VideoCotización" en tu sitio. Solo funciona desde los sitios
        que autorices.
      </p>
      {resultado ? (
        <Alerta key={resultado.n} tipo={resultado.tipo} enfocar>
          {resultado.texto}
        </Alerta>
      ) : null}
      {recienCreada ? (
        <div ref={refAvisoClave} tabIndex={-1} className="alerta alerta--aviso clave-nueva">
          <strong>Clave "{recienCreada.nombre}" creada. Copiala ahora.</strong>
          <p>Por seguridad, esta es la única vez que la vas a ver completa. Si la perdés, tenés que crear otra.</p>
          <CampoTexto etiqueta="Valor de la clave" readOnly spellCheck={false} autoComplete="off" value={recienCreada.valor} onFocus={(e) => { e.currentTarget.select(); }} />
          <div className="acciones">
            <BotonCopiar texto={recienCreada.valor} etiqueta="Copiar clave" />
            <Boton
              variante="primario"
              onClick={() => {
                setRecienCreada(null);
              }}
            >
              Ya la guardé
            </Boton>
          </div>
        </div>
      ) : null}

      {lista.estado === 'cargando' ? <Cargando texto="Cargando las claves…" /> : null}
      {lista.estado === 'error' ? (
        <ErrorDeCarga mensaje={mensaje(lista.error)} idTraza={lista.error.idTraza} alReintentar={lista.recargar} />
      ) : null}
      {lista.estado === 'ok' && lista.datos.items.length === 0 ? (
        <EstadoVacio titulo="Todavía no creaste ninguna clave">Creá la primera con el formulario de abajo.</EstadoVacio>
      ) : null}
      {lista.estado === 'ok' && lista.datos.items.length > 0 ? (
        <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Claves del widget">
          <table className="tabla">
            <caption className="solo-lectores">Claves del widget</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Clave</th>
                <th scope="col">Sitios autorizados</th>
                <th scope="col">Estado</th>
                <th scope="col">Último uso</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.datos.items.map((c) => (
                <tr key={c.clave_id}>
                  <th scope="row">{c.nombre}</th>
                  <td>
                    <code>{c.prefijo}…</code>
                  </td>
                  <td>
                    <ul className="lista-simple">
                      {c.origins.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </td>
                  <td>{c.estado === 'activa' ? 'Activa' : `Revocada${c.revocada_en ? ` el ${formatearFechaHora(c.revocada_en)}` : ''}`}</td>
                  <td>{c.ultimo_uso_en ? formatearFechaHora(c.ultimo_uso_en) : 'Nunca'}</td>
                  <td>
                    {c.estado === 'activa' ? (
                      <Boton
                        variante="peligro"
                        aria-label={`Revocar la clave ${c.nombre}`}
                        onClick={() => {
                          setARevocar(c);
                        }}
                      >
                        Revocar
                      </Boton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <FormularioNuevaClave
        alCrear={async (nombre, origins) => {
          const creada = await conReautenticacion(() => cliente.crearClaveWidget({ nombre, origins }));
          setRecienCreada({ nombre: creada.clave.nombre, valor: creada.valor });
          setVersion((v) => v + 1);
        }}
      />

      {aRevocar ? (
        <ConfirmarDialogo
          titulo={`¿Revocar la clave "${aRevocar.nombre}"?`}
          descripcion="Los sitios que la usan van a dejar de poder iniciar videocotizaciones. No se puede deshacer. Te vamos a pedir confirmar tu identidad."
          textoConfirmar="Sí, revocar"
          peligro
          alConfirmar={() => void revocar(aRevocar)}
          alCancelar={() => {
            setARevocar(null);
          }}
        />
      ) : null}
    </section>
  );
}

function FormularioNuevaClave({ alCrear }: { alCrear: (nombre: string, origins: string[]) => Promise<void> }) {
  const mensaje = useMensajeDeError();
  const [nombre, setNombre] = useState('');
  const [origins, setOrigins] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; origins?: string }>({});
  const [errorEnvio, setErrorEnvio] = useState<{ texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;
    const formulario = e.currentTarget;
    const lista = parsearOrigins(origins);
    const nuevos: { nombre?: string; origins?: string } = {};
    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length < 1 || nombreLimpio.length > 60 || !PATRON_NOMBRE.test(nombreLimpio)) {
      nuevos.nombre = 'El nombre tiene entre 1 y 60 caracteres y no puede llevar < ni >.';
    }
    if (lista.length < 1 || lista.length > 10) nuevos.origins = 'Indicá entre 1 y 10 sitios, uno por línea.';
    else if (new Set(lista).size !== lista.length) nuevos.origins = 'Hay sitios repetidos.';
    else {
      const malo = lista.find((o) => !PATRON_ORIGIN.test(o));
      if (malo !== undefined) {
        nuevos.origins = `"${malo.slice(0, 80)}" no es válido: tiene que empezar con https://, sin barra final ni comodines. Ejemplo: https://www.minegocio.com.ar`;
      }
    }
    setErrores(nuevos);
    setErrorEnvio(null);
    if (nuevos.nombre ?? nuevos.origins) {
      setTimeout(() => formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setEnviando(true);
    try {
      await alCrear(nombreLimpio, lista);
      setNombre('');
      setOrigins('');
    } catch (err) {
      if (!esCancelacion(err)) setErrorEnvio({ texto: mensaje(comoErrorApi(err)), n: (errorEnvio?.n ?? 0) + 1 });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="subtarjeta" aria-labelledby="titulo-nueva-clave">
      <h3 id="titulo-nueva-clave">Crear una clave nueva</h3>
      {errorEnvio ? (
        <Alerta key={errorEnvio.n} tipo="error" enfocar>
          {errorEnvio.texto}
        </Alerta>
      ) : null}
      <CampoTexto
        etiqueta="Nombre de la clave"
        ayuda="Para reconocerla vos. Ejemplo: Sitio principal."
        maxLength={60}
        value={nombre}
        error={errores.nombre}
        onChange={(e) => {
          setNombre(e.target.value);
        }}
      />
      <CampoAreaTexto
        etiqueta="Sitios autorizados"
        ayuda="Uno por línea. Solo https, sin barra final ni comodines. Ejemplo: https://www.minegocio.com.ar"
        rows={3}
        spellCheck={false}
        value={origins}
        error={errores.origins}
        onChange={(e) => {
          setOrigins(e.target.value);
        }}
      />
      <div className="acciones">
        <Boton type="submit" variante="primario" ocupado={enviando}>
          {enviando ? 'Creando…' : 'Crear clave'}
        </Boton>
      </div>
    </form>
  );
}
