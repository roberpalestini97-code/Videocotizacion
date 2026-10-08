import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCALIZABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface PropsDialogo {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  /** Escape y clic en el fondo. `undefined` = no se puede cerrar (p. ej. mientras envía). */
  alCerrar?: (() => void) | undefined;
}

/**
 * Diálogo modal accesible: role="dialog" + aria-modal, foco atrapado, Escape, devuelve el foco a quien lo abrió y
 * deja el resto de la página inerte mientras está abierto.
 */
export function Dialogo({ titulo, descripcion, children, alCerrar }: PropsDialogo) {
  const idTitulo = useId();
  const idDescripcion = useId();
  const caja = useRef<HTMLDivElement>(null);
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => {
    alCerrarRef.current = alCerrar;
  });

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const contenedor = caja.current?.parentElement?.parentElement ?? null; // el portal
    const inertizados: Element[] = [];
    for (const hijo of Array.from(document.body.children)) {
      if (hijo !== contenedor && !hijo.hasAttribute('inert')) {
        hijo.setAttribute('inert', '');
        inertizados.push(hijo);
      }
    }
    const primero = caja.current?.querySelector<HTMLElement>('[data-foco-inicial]') ?? caja.current?.querySelector<HTMLElement>(FOCALIZABLES);
    (primero ?? caja.current)?.focus();
    return () => {
      for (const el of inertizados) el.removeAttribute('inert');
      // Si quien abrió el diálogo ya no está (p. ej. se refrescó la lista), el foco no queda perdido en <body>.
      if (anterior?.isConnected) anterior.focus();
      else document.querySelector<HTMLElement>('main')?.focus();
    };
  }, []);

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && alCerrarRef.current) {
      e.stopPropagation();
      alCerrarRef.current();
      return;
    }
    if (e.key !== 'Tab' || !caja.current) return;
    const items = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES));
    const primero = items[0];
    const ultimo = items[items.length - 1];
    if (!primero || !ultimo) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === caja.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  return createPortal(
    <div className="dialogo-fondo">
      <div
        ref={caja}
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descripcion ? idDescripcion : undefined}
        tabIndex={-1}
        onKeyDown={alTeclear}
      >
        <h2 id={idTitulo} className="dialogo__titulo">
          {titulo}
        </h2>
        {descripcion ? (
          <p id={idDescripcion} className="dialogo__descripcion">
            {descripcion}
          </p>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
