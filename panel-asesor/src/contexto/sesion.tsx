import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { crearCliente, type ClientePanel } from '../api/cliente';
import { comoErrorApi, esAbortado, type ErrorApi } from '../api/errores';
import type { SesionPanel, TotpSolicitud } from '../api/tipos';

export type Asesor = SesionPanel['asesor'];

export type EstadoSesion =
  | { tipo: 'cargando' }
  /** No se pudo ni preguntar si hay sesión (red caída, 5xx). */
  | { tipo: 'error_inicial'; error: ErrorApi }
  | { tipo: 'anonimo'; aviso?: 'vencida' | 'cerrada' }
  /** Contraseña correcta; falta el código TOTP (R38). */
  | { tipo: 'totp'; venceEn: string }
  | {
      tipo: 'autenticada';
      asesor: Asesor;
      venceInactividadEn: string;
      venceAbsolutoEn: string;
      reautenticadoHasta?: string | undefined;
    };

/** Minutos de aviso antes del vencimiento absoluto de la sesión (R34). */
export const AVISO_VENCIMIENTO_MS = 2 * 60_000;

interface ValorSesion {
  estado: EstadoSesion;
  cliente: ClientePanel;
  ingresar: (email: string, contrasena: string) => Promise<void>;
  confirmarTotp: (solicitud: TotpSolicitud) => Promise<void>;
  /** Vuelve al paso de la contraseña (descarta el paso TOTP). */
  volverAlInicio: () => void;
  salir: () => Promise<void>;
  reintentarInicio: () => void;
  /** Vencimiento absoluto, solo cuando faltan menos de AVISO_VENCIMIENTO_MS. */
  avisoVencimiento: string | null;
}

const Contexto = createContext<ValorSesion | null>(null);

function desdeSesionPanel(s: SesionPanel): EstadoSesion {
  return {
    tipo: 'autenticada',
    asesor: s.asesor,
    venceInactividadEn: s.vence_inactividad_en,
    venceAbsolutoEn: s.vence_absoluto_en,
    reautenticadoHasta: s.reautenticado_hasta,
  };
}

export interface PropiedadesProveedorSesion {
  children: ReactNode;
  baseUrl?: string;
  /** Solo para pruebas y para el mock de desarrollo. */
  fetchImpl?: typeof fetch;
}

export function ProveedorSesion({ children, baseUrl, fetchImpl }: PropiedadesProveedorSesion) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);
  const [avisoPara, setAvisoPara] = useState<string | null>(null);
  const csrf = useRef<string | null>(null);

  const [cliente] = useState(() =>
    crearCliente({
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(fetchImpl ? { fetchImpl } : {}),
      obtenerCsrf: () => csrf.current,
      alSesionVencida: () => {
        csrf.current = null;
        setEstado((previo) =>
          previo.tipo === 'autenticada' || previo.tipo === 'totp' ? { tipo: 'anonimo', aviso: 'vencida' } : previo,
        );
      },
    }),
  );

  // Al cargar o recargar: ¿hay una sesión viva? También recupera el CSRF, que no se guarda en ningún lado.
  useEffect(() => {
    const ac = new AbortController();
    cliente.leerSesion(ac.signal).then(
      (s) => {
        if (ac.signal.aborted) return;
        csrf.current = s.csrf_token;
        setEstado(desdeSesionPanel(s));
      },
      (e: unknown) => {
        if (ac.signal.aborted || esAbortado(e)) return;
        const error = comoErrorApi(e);
        if (error.status === 401) setEstado({ tipo: 'anonimo' });
        else setEstado({ tipo: 'error_inicial', error });
      },
    );
    return () => {
      ac.abort();
    };
  }, [cliente, intento]);

  // Aviso y cierre al llegar el vencimiento absoluto de la sesión.
  const venceAbsolutoEn = estado.tipo === 'autenticada' ? estado.venceAbsolutoEn : null;
  useEffect(() => {
    if (venceAbsolutoEn === null) return;
    const faltan = Date.parse(venceAbsolutoEn) - Date.now();
    const alAviso = setTimeout(() => {
      setAvisoPara(venceAbsolutoEn);
    }, Math.max(0, faltan - AVISO_VENCIMIENTO_MS));
    const alVencer = setTimeout(() => {
      csrf.current = null;
      setEstado({ tipo: 'anonimo', aviso: 'vencida' });
    }, Math.max(0, faltan));
    return () => {
      clearTimeout(alAviso);
      clearTimeout(alVencer);
    };
  }, [venceAbsolutoEn]);

  const ingresar = useCallback(
    async (email: string, contrasena: string) => {
      const paso = await cliente.iniciarSesion({ email, contrasena });
      csrf.current = paso.csrf_token;
      setEstado({ tipo: 'totp', venceEn: paso.vence_en });
    },
    [cliente],
  );

  const confirmarTotp = useCallback(
    async (solicitud: TotpSolicitud) => {
      const s = await cliente.verificarTotp(solicitud);
      csrf.current = s.csrf_token;
      setEstado(desdeSesionPanel(s));
    },
    [cliente],
  );

  const volverAlInicio = useCallback(() => {
    csrf.current = null;
    setEstado({ tipo: 'anonimo' });
  }, []);

  const salir = useCallback(async () => {
    try {
      await cliente.cerrarSesion();
    } catch (e) {
      // 401: la sesión ya no existía en el servidor; igual terminamos de salir. Cualquier otro error: seguimos
      // adentro, porque la cookie HttpOnly sigue viva y mostrar "saliste" sería mentira.
      if (comoErrorApi(e).status !== 401) throw e;
    }
    csrf.current = null;
    setEstado({ tipo: 'anonimo', aviso: 'cerrada' });
  }, [cliente]);

  const reintentarInicio = useCallback(() => {
    setEstado({ tipo: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  const valor = useMemo<ValorSesion>(
    () => ({
      estado,
      cliente,
      ingresar,
      confirmarTotp,
      volverAlInicio,
      salir,
      reintentarInicio,
      avisoVencimiento: venceAbsolutoEn !== null && avisoPara === venceAbsolutoEn ? venceAbsolutoEn : null,
    }),
    [estado, cliente, ingresar, confirmarTotp, volverAlInicio, salir, reintentarInicio, venceAbsolutoEn, avisoPara],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return valor;
}

export function useCliente(): ClientePanel {
  return useSesion().cliente;
}

/** Datos del asesor autenticado; solo se llama debajo de la ruta protegida. */
export function useAsesor(): Asesor {
  const { estado } = useSesion();
  if (estado.tipo !== 'autenticada') throw new Error('useAsesor requiere una sesión autenticada');
  return estado.asesor;
}
