import { consultarAsesor } from "./consultar";
import type { AsesorEvento, AsesorApiRequest, AsesorApiResponse } from "./types";
import type { Turno } from "@/data/asesores";

/** Cliente fino: dispara un evento y espera la respuesta tipada del asesor. */
export async function dispararEventoAsesor(input: {
  sesionId: string;
  asesorId: string;
  evento: AsesorEvento;
  historial: Turno[];
  observaciones: { etiqueta: string; valor: string }[];
  parametros?: Record<string, unknown>;
}): Promise<AsesorApiResponse> {
  const payload: AsesorApiRequest = {
    sesionId: input.sesionId,
    asesorId: input.asesorId,
    evento: input.evento,
    historial: input.historial,
    observaciones: input.observaciones,
    ...(input.parametros ? { parametros: input.parametros } : {}),
  };

  const res = await consultarAsesor({ data: payload });
  if (!res.ok) {
    throw new Error(res.error);
  }
  return res;
}
