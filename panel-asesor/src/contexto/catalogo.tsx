import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MENSAJES_ERROR } from '../api/generado/errores';
import { esCodigoDelContrato, esErrorApi, type CodigoAny } from '../api/errores';
import { useCliente } from './sesion';
import type { MotivoCierre, Oficio, Zona } from '../api/tipos';
import { MENSAJE_LOCAL, RESPALDO_MOTIVO, RESPALDO_OFICIO, RESPALDO_ZONA } from '../textos/panel';

export interface Catalogo {
  /** Texto del catálogo de la API por clave; si falta, el respaldo (o la clave misma). */
  t: (clave: string, respaldo?: string) => string;
  /** Mensaje de error para un código: catálogo → respaldo generado del contrato → mensaje genérico. */
  mensajeError: (codigo: CodigoAny) => string;
  oficio: (o: Oficio) => string;
  zona: (z: Zona) => string;
  motivo: (m: MotivoCierre) => string;
}

function construir(textos: Readonly<Record<string, string>> | null): Catalogo {
  const t = (clave: string, respaldo?: string) => textos?.[clave] ?? respaldo ?? clave;
  const mensajeError = (codigo: CodigoAny) => {
    if (!esCodigoDelContrato(codigo)) return MENSAJE_LOCAL[codigo];
    return textos?.[`error.${codigo}`] ?? MENSAJES_ERROR[codigo] ?? MENSAJES_ERROR.error_interno ?? '';
  };
  return {
    t,
    mensajeError,
    oficio: (o) => t(`oficio.${o}`, RESPALDO_OFICIO[o]),
    zona: (z) => t(`zona.${z}`, RESPALDO_ZONA[z]),
    motivo: (m) => t(`motivo.${m}`, RESPALDO_MOTIVO[m]),
  };
}

/** Catálogo solo con los respaldos (para pruebas y para cuando /v1/textos todavía no respondió). */
export const CATALOGO_DE_RESPALDO: Catalogo = construir(null);

const Contexto = createContext<Catalogo>(CATALOGO_DE_RESPALDO);

export function ProveedorCatalogo({ children }: { children: ReactNode }) {
  const cliente = useCliente();
  const [textos, setTextos] = useState<Readonly<Record<string, string>> | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    cliente.leerCatalogoTextos(ac.signal).then(
      (c) => {
        setTextos(c.textos);
      },
      () => {
        // Sin catálogo seguimos con los respaldos: el panel no se bloquea por esto.
      },
    );
    return () => {
      ac.abort();
    };
  }, [cliente]);

  const valor = useMemo(() => construir(textos), [textos]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCatalogo(): Catalogo {
  return useContext(Contexto);
}

/** Mensaje listo para mostrar para cualquier cosa lanzada, con aviso de reintento en los 429. */
export function useMensajeDeError(): (e: unknown) => string {
  const { mensajeError } = useCatalogo();
  return (e: unknown) => {
    if (!esErrorApi(e)) return mensajeError('error_interno');
    const base = mensajeError(e.codigo);
    if (e.status === 429 && e.reintentarEnS !== undefined) return `${base} Podés reintentar en ${e.reintentarEnS} s.`;
    return base;
  };
}
