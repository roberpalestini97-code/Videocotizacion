import { useEffect, useEffectEvent, useReducer, useState } from 'react';
import { comoErrorApi, esAbortado, type ErrorApi } from '../api/errores';

export type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error'; error: ErrorApi }
  | { estado: 'ok'; datos: T };

interface Resultado<T> {
  clave: string;
  version: number;
  datos?: T;
  error?: ErrorApi;
}

/**
 * Carga un recurso al montar y cada vez que cambia `clave` (serialización de los parámetros). Cancela el pedido
 * al desmontar o al cambiar de clave (R07). `recargar()` repite el pedido. Sin setState síncrono en efectos:
 * "cargando" se deriva de que el resultado guardado no corresponde a la clave/versión pedidas.
 */
export function useCarga<T>(clave: string, cargar: (signal: AbortSignal) => Promise<T>): Carga<T> & { recargar: () => void } {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const pedir = useEffectEvent(cargar);

  useEffect(() => {
    const ac = new AbortController();
    pedir(ac.signal).then(
      (datos) => {
        if (!ac.signal.aborted) setResultado({ clave, version, datos });
      },
      (e: unknown) => {
        if (!ac.signal.aborted && !esAbortado(e)) setResultado({ clave, version, error: comoErrorApi(e) });
      },
    );
    return () => {
      ac.abort();
    };
  }, [clave, version]);

  const recargar = () => {
    setVersion((v) => v + 1);
  };
  const vigente = resultado?.clave === clave && resultado.version === version;
  if (!vigente || !resultado) return { estado: 'cargando', recargar };
  if (resultado.error) return { estado: 'error', error: resultado.error, recargar };
  return { estado: 'ok', datos: resultado.datos as T, recargar };
}

// ---------------------------------------------------------------------------------------------------------

interface PaginaApi<I> {
  items: I[];
  siguiente_cursor?: string | undefined;
}

interface EstadoLista<I> {
  clave: string;
  version: number;
  fase: 'cargando' | 'ok' | 'error';
  items: I[];
  siguiente: string | undefined;
  error: ErrorApi | null;
  cargandoMas: boolean;
  errorMas: ErrorApi | null;
  /** Cuántos ítems se agregaron en la última carga adicional (para anunciarlo y mover el foco). */
  agregados: number;
}

type Accion<I> =
  | { tipo: 'primera'; clave: string; version: number; pagina: PaginaApi<I> }
  | { tipo: 'falla_primera'; clave: string; version: number; error: ErrorApi }
  | { tipo: 'pide_mas'; clave: string }
  | { tipo: 'mas'; clave: string; pagina: PaginaApi<I> }
  | { tipo: 'falla_mas'; clave: string; error: ErrorApi };

function reductor<I>(estado: EstadoLista<I>, a: Accion<I>): EstadoLista<I> {
  switch (a.tipo) {
    case 'primera':
      return { ...estado, clave: a.clave, version: a.version, fase: 'ok', items: a.pagina.items, siguiente: a.pagina.siguiente_cursor, error: null, cargandoMas: false, errorMas: null, agregados: 0 };
    case 'falla_primera':
      return { ...estado, clave: a.clave, version: a.version, fase: 'error', items: [], siguiente: undefined, error: a.error, cargandoMas: false, errorMas: null, agregados: 0 };
    case 'pide_mas':
      return a.clave === estado.clave ? { ...estado, cargandoMas: true, errorMas: null } : estado;
    case 'mas':
      if (a.clave !== estado.clave) return estado;
      return { ...estado, items: [...estado.items, ...a.pagina.items], siguiente: a.pagina.siguiente_cursor, cargandoMas: false, agregados: a.pagina.items.length };
    case 'falla_mas':
      return a.clave === estado.clave ? { ...estado, cargandoMas: false, errorMas: a.error } : estado;
  }
}

/** Listado paginado por cursor ("Cargar más"). La clave identifica filtros; cambiarla reinicia la lista. */
export function useListadoPaginado<I>(
  clave: string,
  pedirPagina: (cursor: string | undefined, signal: AbortSignal) => Promise<PaginaApi<I>>,
) {
  const [version, setVersion] = useState(0);
  const [estado, despachar] = useReducer(reductor<I>, {
    clave: '', version: -1, fase: 'cargando', items: [], siguiente: undefined, error: null, cargandoMas: false, errorMas: null, agregados: 0,
  });
  const pedir = useEffectEvent(pedirPagina);
  const [controlMas, setControlMas] = useState<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    pedir(undefined, ac.signal).then(
      (pagina) => {
        if (!ac.signal.aborted) despachar({ tipo: 'primera', clave, version, pagina });
      },
      (e: unknown) => {
        if (!ac.signal.aborted && !esAbortado(e)) despachar({ tipo: 'falla_primera', clave, version, error: comoErrorApi(e) });
      },
    );
    return () => {
      ac.abort();
    };
  }, [clave, version]);

  useEffect(() => {
    // Si se desmonta o cambia la lista mientras "cargar más" está en vuelo, se cancela.
    return () => {
      controlMas?.abort();
    };
  }, [controlMas]);

  const vigente = estado.clave === clave && estado.version === version;

  const cargarMas = () => {
    if (!vigente || estado.siguiente === undefined || estado.cargandoMas) return;
    const ac = new AbortController();
    setControlMas(ac);
    despachar({ tipo: 'pide_mas', clave });
    pedir(estado.siguiente, ac.signal).then(
      (pagina) => {
        if (!ac.signal.aborted) despachar({ tipo: 'mas', clave, pagina });
      },
      (e: unknown) => {
        if (!ac.signal.aborted && !esAbortado(e)) despachar({ tipo: 'falla_mas', clave, error: comoErrorApi(e) });
      },
    );
  };

  return {
    fase: vigente ? estado.fase : ('cargando' as const),
    items: vigente ? estado.items : [],
    hayMas: vigente && estado.siguiente !== undefined,
    error: vigente ? estado.error : null,
    cargandoMas: vigente && estado.cargandoMas,
    errorMas: vigente ? estado.errorMas : null,
    agregados: vigente ? estado.agregados : 0,
    cargarMas,
    recargar: () => {
      setVersion((v) => v + 1);
    },
  };
}
