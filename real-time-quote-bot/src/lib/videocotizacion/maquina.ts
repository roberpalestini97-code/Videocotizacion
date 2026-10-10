/**
 * Máquina de estados del flujo de VideoCotización (función pura, sin efectos).
 * Las pantallas dependen SOLO de `fase`; los efectos (HTTP, cámara, socket) los
 * dispara el controlador y vuelven acá como eventos.
 *
 *  inactiva → cargando_enlace → enlace → creando_sesion → consentimiento → camara
 *           → conectando → llamada ⇄ reconectando → (finalizando) → resultado | cerrada
 *  y en cualquier punto: error, camara_denegada.
 */
import type { MotivoCierre } from "./tipos";

export type Fase =
  | "inactiva"
  | "cargando_enlace"
  | "enlace"
  | "creando_sesion"
  | "consentimiento"
  | "camara"
  | "conectando"
  | "llamada"
  | "reconectando"
  | "finalizando"
  | "resultado"
  | "cerrada"
  | "camara_denegada"
  | "error";

export type EstadoFlujo = {
  fase: Fase;
  /** Fase donde falló (para reintentar desde ahí). */
  falloEn?: Fase;
  motivoCierre?: MotivoCierre;
};

export type EventoFlujo =
  | { t: "ABRIR" }
  | { t: "ENLACE_OK" }
  | { t: "CONTINUAR" }
  | { t: "SESION_OK" }
  | { t: "ACEPTA" }
  | { t: "RECHAZA" }
  | { t: "CAMARA_OK" }
  | { t: "CAMARA_DENEGADA" }
  | { t: "FALLO" }
  | { t: "MEDIOS_LISTOS" }
  | { t: "MEDIOS_PERDIDOS" }
  | { t: "MEDIOS_RECUPERADOS" }
  | { t: "COTIZACION" }
  | { t: "SESION_CERRADA"; motivo: MotivoCierre }
  | { t: "CLIENTE_CORTA" }
  | { t: "FIN_CIERRE" }
  | { t: "REINTENTAR" }
  | { t: "REINICIAR" }
  | { t: "CERRAR" };

export const ESTADO_INICIAL: EstadoFlujo = { fase: "inactiva" };

/** Fase a la que se vuelve al reintentar un fallo. */
const REINTENTO: Partial<Record<Fase, Fase>> = {
  cargando_enlace: "cargando_enlace",
  creando_sesion: "creando_sesion",
  consentimiento: "consentimiento",
  camara: "camara",
  conectando: "conectando",
  reconectando: "conectando",
};

const FASES_EN_LLAMADA: ReadonlySet<Fase> = new Set(["conectando", "llamada", "reconectando"]);

export function transicion(s: EstadoFlujo, e: EventoFlujo): EstadoFlujo {
  const { fase } = s;
  if (e.t === "CERRAR") return ESTADO_INICIAL;
  if (e.t === "REINICIAR") {
    return fase === "error" || fase === "camara_denegada" || fase === "cerrada" || fase === "resultado"
      ? { fase: "cargando_enlace" }
      : s;
  }
  switch (e.t) {
    case "ABRIR":
      return fase === "inactiva" ? { fase: "cargando_enlace" } : s;
    case "ENLACE_OK":
      return fase === "cargando_enlace" ? { fase: "enlace" } : s;
    case "CONTINUAR":
      return fase === "enlace" ? { fase: "creando_sesion" } : s;
    case "SESION_OK":
      return fase === "creando_sesion" ? { fase: "consentimiento" } : s;
    case "ACEPTA":
      return fase === "consentimiento" ? { fase: "camara" } : s;
    case "RECHAZA":
      return fase === "consentimiento" ? { fase: "cerrada", motivoCierre: "sin_consentimiento" } : s;
    case "CAMARA_OK":
      return fase === "camara" ? { fase: "conectando" } : s;
    case "CAMARA_DENEGADA":
      return fase === "camara" ? { fase: "camara_denegada", motivoCierre: "sin_camara" } : s;
    case "FALLO":
      if (fase === "error" || fase === "inactiva" || fase === "resultado" || fase === "cerrada") return s;
      return { fase: "error", falloEn: fase };
    case "MEDIOS_LISTOS":
      return fase === "conectando" ? { fase: "llamada" } : s;
    case "MEDIOS_PERDIDOS":
      return fase === "llamada" ? { fase: "reconectando" } : s;
    case "MEDIOS_RECUPERADOS":
      return fase === "reconectando" ? { fase: "llamada" } : s;
    case "COTIZACION":
      return FASES_EN_LLAMADA.has(fase) || fase === "finalizando" ? { fase: "resultado" } : s;
    case "SESION_CERRADA":
      if (fase === "resultado") return { ...s, motivoCierre: e.motivo };
      return FASES_EN_LLAMADA.has(fase) ? { fase: "finalizando", motivoCierre: e.motivo } : s;
    case "CLIENTE_CORTA":
      return FASES_EN_LLAMADA.has(fase) ? { fase: "finalizando", motivoCierre: "cliente_cerro" } : s;
    case "FIN_CIERRE": {
      if (fase !== "finalizando") return s;
      return { fase: "cerrada", ...(s.motivoCierre ? { motivoCierre: s.motivoCierre } : {}) };
    }
    case "REINTENTAR": {
      if (fase !== "error") return s;
      const destino = (s.falloEn && REINTENTO[s.falloEn]) || "cargando_enlace";
      return { fase: destino };
    }
  }
}

export function enLlamada(f: Fase): boolean {
  return f === "llamada" || f === "reconectando";
}
