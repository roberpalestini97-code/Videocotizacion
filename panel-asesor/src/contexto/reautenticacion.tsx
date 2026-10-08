import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Alerta, Boton, CampoTexto } from '../componentes/basicos';
import { Dialogo } from '../componentes/Dialogo';
import { ErrorApi, esErrorApi } from '../api/errores';
import { useMensajeDeError } from './catalogo';
import { useCliente } from './sesion';

/** El usuario cerró el diálogo de reautenticación: la acción no se hizo y no es un error para mostrar. */
export class ReautenticacionCancelada extends Error {
  constructor() {
    super('reautenticacion_cancelada');
    this.name = 'ReautenticacionCancelada';
  }
}

export function esCancelacion(e: unknown): boolean {
  return e instanceof ReautenticacionCancelada;
}

interface ValorReautenticacion {
  /**
   * Ejecuta una acción sensible. Si el servidor contesta 401 `reautenticacion_requerida` (la sesión sigue viva),
   * pide contraseña + código, y si salen bien repite la acción una sola vez. Lanza `ReautenticacionCancelada` si
   * la persona cierra el diálogo. El front no decide qué es sensible: lo decide el backend.
   */
  conReautenticacion: <T>(accion: () => Promise<T>) => Promise<T>;
}

const Contexto = createContext<ValorReautenticacion | null>(null);

interface Pendiente {
  resolver: () => void;
  rechazar: (e: unknown) => void;
}

/** Se monta solo debajo de la ruta protegida: si la sesión se pierde, se desmonta y cancela lo pendiente. */
export function ProveedorReautenticacion({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const pendiente = useRef<{ promesa: Promise<void>; control: Pendiente } | null>(null);

  const pedir = useCallback((): Promise<void> => {
    if (pendiente.current) return pendiente.current.promesa;
    let control: Pendiente | undefined;
    const promesa = new Promise<void>((resolver, rechazar) => {
      control = { resolver, rechazar };
    });
    pendiente.current = { promesa, control: control as Pendiente };
    setAbierto(true);
    return promesa;
  }, []);

  const cerrar = useCallback((resultado: 'ok' | 'cancelado' | { error: unknown }) => {
    const actual = pendiente.current;
    pendiente.current = null;
    setAbierto(false);
    if (!actual) return;
    if (resultado === 'ok') actual.control.resolver();
    else if (resultado === 'cancelado') actual.control.rechazar(new ReautenticacionCancelada());
    else actual.control.rechazar(resultado.error);
  }, []);

  useEffect(
    () => () => {
      pendiente.current?.control.rechazar(new ErrorApi('sesion_vencida', 401));
      pendiente.current = null;
    },
    [],
  );

  const conReautenticacion = useCallback(
    async <T,>(accion: () => Promise<T>): Promise<T> => {
      try {
        return await accion();
      } catch (e) {
        if (!esErrorApi(e, 'reautenticacion_requerida')) throw e;
        await pedir();
        return accion();
      }
    },
    [pedir],
  );

  const valor = useMemo(() => ({ conReautenticacion }), [conReautenticacion]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {abierto ? <DialogoReautenticacion alCerrar={cerrar} /> : null}
    </Contexto.Provider>
  );
}

export function useReautenticacion(): ValorReautenticacion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useReautenticacion debe usarse dentro de <ProveedorReautenticacion>');
  return valor;
}

// ---------------------------------------------------------------------------------------------------------

const PATRON_TOTP = /^[0-9]{6}$/;

function DialogoReautenticacion({ alCerrar }: { alCerrar: (r: 'ok' | 'cancelado' | { error: unknown }) => void }) {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [errores, setErrores] = useState<{ contrasena?: string; codigo?: string }>({});
  const [errorEnvio, setErrorEnvio] = useState<{ texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refContrasena = useRef<HTMLInputElement>(null);
  const refCodigo = useRef<HTMLInputElement>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const nuevos: { contrasena?: string; codigo?: string } = {};
    if (contrasena.length < 12) nuevos.contrasena = 'Ingresá tu contraseña (tiene al menos 12 caracteres).';
    if (!PATRON_TOTP.test(codigo)) nuevos.codigo = 'El código tiene 6 números.';
    setErrores(nuevos);
    setErrorEnvio(null);
    if (nuevos.contrasena) return void refContrasena.current?.focus();
    if (nuevos.codigo) return void refCodigo.current?.focus();
    setEnviando(true);
    try {
      await cliente.reautenticar({ contrasena, codigo_totp: codigo });
      setContrasena('');
      alCerrar('ok');
    } catch (err) {
      setEnviando(false);
      if (esErrorApi(err, 'sesion_vencida') || esErrorApi(err, 'credencial_ausente')) {
        // El callback global ya mandó a la pantalla de ingreso; acá solo se libera la acción pendiente.
        alCerrar({ error: err });
        return;
      }
      setCodigo('');
      setErrorEnvio({ texto: mensaje(err), n: (errorEnvio?.n ?? 0) + 1 });
    }
  };

  return (
    <Dialogo
      titulo="Confirmá tu identidad"
      descripcion="Esta acción es sensible: ingresá de nuevo tu contraseña y el código de tu aplicación de verificación."
      alCerrar={
        enviando
          ? undefined
          : () => {
              alCerrar('cancelado');
            }
      }
    >
      <form onSubmit={(e) => void enviar(e)} noValidate>
        {errorEnvio ? (
          <Alerta key={errorEnvio.n} tipo="error" enfocar>
            {errorEnvio.texto}
          </Alerta>
        ) : null}
        <CampoTexto
          ref={refContrasena}
          data-foco-inicial=""
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          error={errores.contrasena}
          onChange={(e) => {
            setContrasena(e.target.value);
          }}
        />
        <CampoTexto
          ref={refCodigo}
          etiqueta="Código de verificación"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          error={errores.codigo}
          onChange={(e) => {
            setCodigo(e.target.value.replace(/\D/g, ''));
          }}
        />
        <div className="acciones">
          <Boton type="submit" variante="primario" ocupado={enviando}>
            {enviando ? 'Verificando…' : 'Confirmar'}
          </Boton>
          <Boton
            ocupado={enviando}
            onClick={() => {
              alCerrar('cancelado');
            }}
          >
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
