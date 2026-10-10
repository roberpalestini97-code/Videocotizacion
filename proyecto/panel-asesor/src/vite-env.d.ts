/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Solo desarrollo (`npm run dev`): usa la API simulada. En producción se ignora y el código del mock ni se incluye. */
  readonly VITE_USAR_MOCK?: string;
  /** Prefijo de la API; vacío = mismo origen (obligatorio con la cookie __Host-vc_panel). */
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
