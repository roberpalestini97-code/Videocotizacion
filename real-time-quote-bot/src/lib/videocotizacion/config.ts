/**
 * Configuración del cliente de VideoCotización. Todo viene de variables VITE_*
 * (ver .env.example). Son valores PÚBLICOS: nunca poner claves secretas
 * (`vc_sec_…`) acá; el navegador solo usa la clave pública del widget (`vc_pub_…`).
 */

export type ConfigVC = {
  /** URL base del backend, sin barra final. Ej.: https://api.ejemplo.com */
  apiBase: string;
  /** Clave pública del widget (`vc_pub_…`), atada a Origin por tenant en el servidor. */
  clavePublica: string;
  /** Modo mock/dev: apunta al servidor falso local (scripts/mock-servidor-vc.mjs). */
  mock: boolean;
  /** Enlace opaco por defecto para la portada (/). Opcional. */
  enlaceDemo: string | undefined;
};

type EntornoVite = Record<string, string | boolean | undefined>;

const API_MOCK = "http://localhost:8787";
const CLAVE_MOCK = "vc_pub_mock_local_no_es_secreta";

function texto(v: string | boolean | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function leerConfig(env: EntornoVite = import.meta.env as EntornoVite): ConfigVC {
  const mock = ["1", "true", "si"].includes(texto(env["VITE_VC_MOCK"]).toLowerCase());
  const apiBase = (texto(env["VITE_VC_API_BASE"]) || (mock ? API_MOCK : "")).replace(/\/+$/, "");
  const clavePublica = texto(env["VITE_VC_CLAVE_PUBLICA"]) || (mock ? CLAVE_MOCK : "");
  const enlace = texto(env["VITE_VC_ENLACE_DEMO"]);
  return { apiBase, clavePublica, mock, enlaceDemo: enlace || undefined };
}

/** Devuelve el motivo por el que la configuración no sirve, o null si está completa. */
export function validarConfig(c: ConfigVC): string | null {
  if (!c.apiBase) return "Falta VITE_VC_API_BASE (URL del backend).";
  if (!/^https?:\/\//.test(c.apiBase)) return "VITE_VC_API_BASE tiene que empezar con http:// o https://.";
  if (!c.clavePublica) return "Falta VITE_VC_CLAVE_PUBLICA (clave pública del widget).";
  if (c.clavePublica.startsWith("vc_sec_")) {
    return "VITE_VC_CLAVE_PUBLICA es una clave SECRETA: no puede ir en el navegador.";
  }
  return null;
}
