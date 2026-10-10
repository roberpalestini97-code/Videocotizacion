/**
 * Catálogo de eventos del asesor — punto de extensión.
 * Agregar aquí nuevos `tipo` y documentar qué dispara cada uno.
 */
export const EVENTOS_ASESOR = [
  {
    tipo: "llamada.inicio",
    dispara: "Al pasar a fase llamada",
    efecto: "Prepara sesión, inyecta reglas/parámetros del asesor",
  },
  {
    tipo: "turno.solicitar",
    dispara: "Ciclo de conversación (tras delay / fin de voz)",
    efecto: "Devuelve próximo turno (texto, dato, presupuesto)",
  },
  {
    tipo: "observacion.dato",
    dispara: "Cuando un turno aporta etiqueta/valor de cotización",
    efecto: "Registra observación en el contexto del agente",
  },
  {
    tipo: "observacion.camara",
    dispara: "Cuando el MediaStream de video está live",
    efecto: "Informa al agente que hay cámara activa",
  },
  {
    tipo: "llamada.cierre",
    dispara: "Fin de guion / respuesta fin:true",
    efecto: "Cierra sesión de API",
  },
] as const;

export type TipoEventoAsesor = (typeof EVENTOS_ASESOR)[number]["tipo"];
