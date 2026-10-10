import { useRef, useState, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alerta, Boton, CampoTexto, TituloPagina } from '../componentes/basicos';
import { esErrorApi } from '../api/errores';
import { useCatalogo, useMensajeDeError } from '../contexto/catalogo';
import { useSesion } from '../contexto/sesion';
import { useSegundosRestantes } from '../util/useReloj';

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_TOTP = /^[0-9]{6}$/;
const PATRON_RECUPERACION = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Solo rutas internas: el destino viene del estado del router (nunca de la URL), pero igual se valida. */
export function destinoSeguro(desde: unknown): string {
  return typeof desde === 'string' && desde.startsWith('/') && !desde.startsWith('//') && !desde.startsWith('/ingresar')
    ? desde
    : '/cotizaciones';
}

export function Ingresar() {
  const { estado } = useSesion();
  const location = useLocation();
  const desde = (location.state as { desde?: unknown } | null)?.desde;

  if (estado.tipo === 'autenticada') return <Navigate to={destinoSeguro(desde)} replace />;

  return (
    <main className="ingreso" id="contenido" tabIndex={-1}>
      <div className="ingreso__tarjeta">
        <p className="marca">
          VideoCotización <span>Panel del asesor</span>
        </p>
        {estado.tipo === 'totp' ? <PasoCodigo /> : <PasoContrasena />}
      </div>
    </main>
  );
}

function AvisoDeSesion() {
  const { estado } = useSesion();
  const { mensajeError } = useCatalogo();
  if (estado.tipo !== 'anonimo' || !estado.aviso) return null;
  return estado.aviso === 'vencida' ? (
    <Alerta tipo="aviso">{mensajeError('sesion_vencida')}</Alerta>
  ) : (
    <Alerta tipo="exito">Cerraste tu sesión.</Alerta>
  );
}

function PasoContrasena() {
  const { ingresar } = useSesion();
  const mensaje = useMensajeDeError();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ email?: string; contrasena?: string }>({});
  const [errorEnvio, setErrorEnvio] = useState<{ texto: string; n: number } | null>(null);
  const [esperaHasta, setEsperaHasta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refEmail = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);
  const espera = useSegundosRestantes(esperaHasta);

  const enviar = async (e: SubmitEvent) => {
    e.preventDefault();
    if (enviando || espera > 0) return;
    const nuevos: { email?: string; contrasena?: string } = {};
    if (!PATRON_EMAIL.test(email.trim())) nuevos.email = 'Ingresá un correo válido, por ejemplo nombre@dominio.com.';
    if (contrasena.length < 12) nuevos.contrasena = 'La contraseña tiene al menos 12 caracteres.';
    setErrores(nuevos);
    setErrorEnvio(null);
    if (nuevos.email) {
      refEmail.current?.focus();
      return;
    }
    if (nuevos.contrasena) {
      refContrasena.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      await ingresar(email.trim(), contrasena);
      setContrasena('');
    } catch (err) {
      setEnviando(false);
      setContrasena('');
      if (esErrorApi(err) && err.status === 429 && err.reintentarEnS !== undefined) {
        setEsperaHasta(Date.now() + err.reintentarEnS * 1000);
      }
      setErrorEnvio({ texto: mensaje(err), n: (errorEnvio?.n ?? 0) + 1 });
    }
  };

  return (
    <>
      <TituloPagina titulo="Ingresar">Ingresá a tu panel</TituloPagina>
      <AvisoDeSesion />
      {errorEnvio ? (
        <Alerta key={errorEnvio.n} tipo="error" enfocar>
          {errorEnvio.texto}
        </Alerta>
      ) : null}
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <CampoTexto
          ref={refEmail}
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="username"
          value={email}
          error={errores.email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <CampoTexto
          ref={refContrasena}
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          error={errores.contrasena}
          onChange={(e) => {
            setContrasena(e.target.value);
          }}
        />
        <Boton type="submit" variante="primario" ocupado={enviando || espera > 0} className="boton--ancho">
          {enviando ? 'Ingresando…' : espera > 0 ? `Esperá ${espera} s` : 'Continuar'}
        </Boton>
      </form>
    </>
  );
}

function PasoCodigo() {
  const { confirmarTotp, volverAlInicio } = useSesion();
  const mensaje = useMensajeDeError();
  const [usarRecuperacion, setUsarRecuperacion] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | undefined>();
  const [errorEnvio, setErrorEnvio] = useState<{ texto: string; n: number } | null>(null);
  const [esperaHasta, setEsperaHasta] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refCodigo = useRef<HTMLInputElement>(null);
  const espera = useSegundosRestantes(esperaHasta);

  const enviar = async (e: SubmitEvent) => {
    e.preventDefault();
    if (enviando || espera > 0) return;
    const valor = usarRecuperacion ? codigo.trim().toUpperCase() : codigo;
    const valido = usarRecuperacion ? PATRON_RECUPERACION.test(valor) : PATRON_TOTP.test(valor);
    setErrorEnvio(null);
    if (!valido) {
      setErrorCampo(usarRecuperacion ? 'El código de recuperación tiene el formato XXXX-XXXX-XXXX.' : 'El código tiene 6 números.');
      refCodigo.current?.focus();
      return;
    }
    setErrorCampo(undefined);
    setEnviando(true);
    try {
      await confirmarTotp(usarRecuperacion ? { codigo_recuperacion: valor } : { codigo: valor });
    } catch (err) {
      setEnviando(false);
      setCodigo('');
      if (esErrorApi(err) && err.status === 429 && err.reintentarEnS !== undefined) {
        setEsperaHasta(Date.now() + err.reintentarEnS * 1000);
      }
      setErrorEnvio({ texto: mensaje(err), n: (errorEnvio?.n ?? 0) + 1 });
    }
  };

  return (
    <>
      <TituloPagina titulo="Verificación">Verificá tu identidad</TituloPagina>
      <AvisoDeSesion />
      <p>
        {usarRecuperacion
          ? 'Ingresá uno de tus códigos de recuperación. Cada uno sirve una sola vez.'
          : 'Ingresá el código de 6 números que te muestra tu aplicación de verificación.'}
      </p>
      {errorEnvio ? (
        <Alerta key={errorEnvio.n} tipo="error" enfocar>
          {errorEnvio.texto}
        </Alerta>
      ) : null}
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <CampoTexto
          key={usarRecuperacion ? 'recuperacion' : 'totp'}
          ref={refCodigo}
          etiqueta={usarRecuperacion ? 'Código de recuperación' : 'Código de verificación'}
          inputMode={usarRecuperacion ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          maxLength={usarRecuperacion ? 14 : 6}
          value={codigo}
          error={errorCampo}
          onChange={(e) => {
            setCodigo(usarRecuperacion ? e.target.value : e.target.value.replace(/\D/g, ''));
          }}
        />
        <Boton type="submit" variante="primario" ocupado={enviando || espera > 0} className="boton--ancho">
          {enviando ? 'Verificando…' : espera > 0 ? `Esperá ${espera} s` : 'Verificar'}
        </Boton>
      </form>
      <div className="acciones acciones--centro">
        <Boton
          variante="enlace"
          onClick={() => {
            setUsarRecuperacion((v) => !v);
            setCodigo('');
            setErrorCampo(undefined);
            setErrorEnvio(null);
          }}
        >
          {usarRecuperacion ? 'Usar el código de la aplicación' : 'Usar un código de recuperación'}
        </Boton>
        <Boton variante="enlace" onClick={volverAlInicio}>
          Volver
        </Boton>
      </div>
    </>
  );
}
