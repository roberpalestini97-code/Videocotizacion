import { z } from "zod";
import type { Turno } from "@/data/asesores";

/** Eventos que disparan una consulta a la API del asesor. Extensible. */
export const asesorEventoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("llamada.inicio") }),
  z.object({
    tipo: z.literal("turno.solicitar"),
    /** Índice del próximo turno en la conversación (0-based). */
    indice: z.number().int().min(0),
  }),
  z.object({
    tipo: z.literal("observacion.dato"),
    etiqueta: z.string().min(1),
    valor: z.string().min(1),
  }),
  z.object({
    tipo: z.literal("observacion.camara"),
    activa: z.boolean(),
    etiquetaDispositivo: z.string().optional(),
  }),
  z.object({ tipo: z.literal("llamada.cierre") }),
]);

export type AsesorEvento = z.infer<typeof asesorEventoSchema>;

export const turnoSchema = z.object({
  de: z.enum(["asesor", "cliente"]),
  texto: z.string().min(1),
  dato: z
    .object({
      etiqueta: z.string(),
      valor: z.string(),
    })
    .optional(),
  presupuesto: z
    .object({
      total: z.string(),
      detalle: z.string(),
      plazo: z.string(),
    })
    .optional(),
});

export const asesorApiRequestSchema = z.object({
  sesionId: z.string().min(1),
  asesorId: z.string().min(1),
  evento: asesorEventoSchema,
  historial: z.array(turnoSchema).default([]),
  observaciones: z
    .array(z.object({ etiqueta: z.string(), valor: z.string() }))
    .default([]),
  /** Parámetros libres (rubro, tono, reglas override, etc.). */
  parametros: z.record(z.unknown()).optional(),
});

export type AsesorApiRequest = z.infer<typeof asesorApiRequestSchema>;

export type AsesorApiResponse = {
  ok: true;
  fuente: "guion" | "llm" | "remoto";
  /** Próximo turno a publicar en la UI (si aplica). */
  turno?: Turno;
  /** La conversación debe cerrar. */
  fin?: boolean;
  /** Eco útil para depurar prompts / reglas. */
  meta?: {
    evento: AsesorEvento["tipo"];
    reglasAplicadas: string[];
    promptResumen?: string;
  };
};

export type AsesorApiError = {
  ok: false;
  error: string;
};
