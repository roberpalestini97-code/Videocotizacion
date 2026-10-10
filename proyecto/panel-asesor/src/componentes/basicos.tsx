import {
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';

// ---- Alerta -------------------------------------------------------------------------------------------

export type TipoAlerta = 'error' | 'exito' | 'info' | 'aviso';

interface PropsAlerta {
  tipo: TipoAlerta;
  children: ReactNode;
  /** Mueve el foco a la alerta al aparecer (errores de envío). Cambiar la `key` repite el foco. */
  enfocar?: boolean;
  titulo?: string;
}

/** Los errores usan role="alert" (se anuncian ya); el resto, role="status" (se anuncian sin interrumpir). */
export function Alerta({ tipo, children, enfocar = false, titulo }: PropsAlerta) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enfocar) ref.current?.focus();
  }, [enfocar]);
  return (
    <div ref={ref} className={`alerta alerta--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'} tabIndex={-1}>
      {titulo ? <strong className="alerta__titulo">{titulo}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

// ---- Botón --------------------------------------------------------------------------------------------

interface PropsBoton extends ComponentPropsWithRef<'button'> {
  variante?: 'primario' | 'secundario' | 'peligro' | 'enlace';
  /** Ocupado: queda en el orden de tabulación (no se pierde el foco) pero no responde. */
  ocupado?: boolean;
}

export function Boton({ variante = 'secundario', ocupado = false, className, onClick, type = 'button', ...resto }: PropsBoton) {
  return (
    <button
      {...resto}
      type={type}
      aria-disabled={ocupado || resto.disabled ? true : undefined}
      className={['boton', `boton--${variante}`, className].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (ocupado) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}

// ---- Campos -------------------------------------------------------------------------------------------

interface PropsCampo extends Omit<ComponentPropsWithRef<'input'>, 'id'> {
  etiqueta: string;
  ayuda?: string | undefined;
  error?: string | undefined;
}

export function CampoTexto({ etiqueta, ayuda, error, className, ...input }: PropsCampo) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {ayuda ? (
        <p id={idAyuda} className="campo__ayuda">
          {ayuda}
        </p>
      ) : null}
      <input {...input} id={id} className={className} aria-invalid={error ? true : undefined} aria-describedby={describe} />
      {error ? (
        <p id={idError} className="campo__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface PropsAreaTexto extends Omit<ComponentPropsWithRef<'textarea'>, 'id'> {
  etiqueta: string;
  ayuda?: string | undefined;
  error?: string | undefined;
}

export function CampoAreaTexto({ etiqueta, ayuda, error, ...area }: PropsAreaTexto) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {ayuda ? (
        <p id={idAyuda} className="campo__ayuda">
          {ayuda}
        </p>
      ) : null}
      <textarea {...area} id={id} aria-invalid={error ? true : undefined} aria-describedby={describe} />
      {error ? (
        <p id={idError} className="campo__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface PropsSelect extends Omit<ComponentPropsWithRef<'select'>, 'id'> {
  etiqueta: string;
}

export function CampoSelect({ etiqueta, children, ...select }: PropsSelect) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select {...select} id={id}>
        {children}
      </select>
    </div>
  );
}

interface PropsGrupo<V extends string> {
  leyenda: string;
  ayuda?: string | undefined;
  error?: string | undefined;
  opciones: readonly { valor: V; etiqueta: string }[];
  seleccion: readonly V[];
  alCambiar: (nueva: V[]) => void;
}

/** Casillas agrupadas en un fieldset: un solo tab por casilla, la leyenda se lee al entrar. */
export function GrupoCasillas<V extends string>({ leyenda, ayuda, error, opciones, seleccion, alCambiar }: PropsGrupo<V>) {
  const id = useId();
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset className="grupo" aria-describedby={describe} aria-invalid={error ? true : undefined}>
      <legend>{leyenda}</legend>
      {ayuda ? (
        <p id={`${id}-ayuda`} className="campo__ayuda">
          {ayuda}
        </p>
      ) : null}
      <div className="grupo__opciones">
        {opciones.map((o) => (
          <label key={o.valor} className="casilla">
            <input
              type="checkbox"
              checked={seleccion.includes(o.valor)}
              onChange={(e) => {
                alCambiar(e.target.checked ? [...seleccion, o.valor] : seleccion.filter((x) => x !== o.valor));
              }}
            />
            <span>{o.etiqueta}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="campo__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---- Estados de carga / vacío / error ----------------------------------------------------------------------

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p className="cargando" role="status">
      {texto}
    </p>
  );
}

export function EstadoVacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <p className="vacio__titulo">{titulo}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Error de carga con su botón para reintentar. El mensaje ya viene del catálogo. */
export function ErrorDeCarga({ mensaje, idTraza, alReintentar }: { mensaje: string; idTraza?: string | undefined; alReintentar?: (() => void) | undefined }) {
  return (
    <Alerta tipo="error">
      <p>{mensaje}</p>
      {idTraza ? <p className="texto-chico">Código para soporte: {idTraza}</p> : null}
      {alReintentar ? (
        <Boton variante="secundario" onClick={alReintentar}>
          Reintentar
        </Boton>
      ) : null}
    </Alerta>
  );
}

// ---- Título de página con foco --------------------------------------------------------------------------------

/**
 * h1 de cada pantalla: al montarse recibe el foco (navegación por teclado y lectores de pantalla saben que la vista
 * cambió) y actualiza el título de la pestaña.
 */
export function TituloPagina({ children, titulo }: { children: string; titulo?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${titulo ?? children} · Panel del asesor`;
    ref.current?.focus({ preventScroll: false });
  }, [children, titulo]);
  return (
    <h1 ref={ref} tabIndex={-1} className="titulo-pagina">
      {children}
    </h1>
  );
}
