export { consultarAsesor } from "./consultar";
export { dispararEventoAsesor } from "./client";
export { construirPrompt, reglasDe, reglasPorAsesor } from "./prompts";
export { hablarTextoAsesor } from "./voz";
export { resolverRespuestaLocal } from "./resolver";
export { EVENTOS_ASESOR } from "./eventos";
export type {
  AsesorEvento,
  AsesorApiRequest,
  AsesorApiResponse,
  AsesorApiError,
} from "./types";
