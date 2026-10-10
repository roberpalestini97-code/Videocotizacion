import { asesores } from "@/data/asesores";
import { construirPrompt, reglasDe } from "./prompts";
import type { AsesorApiRequest, AsesorApiResponse } from "./types";

/**
 * Resolución local determinista (guion + reglas).
 * Usada cuando no hay ASESOR_API_URL / OPENAI_API_KEY, y como fallback.
 */
export function resolverRespuestaLocal(req: AsesorApiRequest): AsesorApiResponse {
  const asesor = asesores.find((a) => a.id === req.asesorId);
  if (!asesor) {
    return {
      ok: true,
      fuente: "guion",
      fin: true,
      meta: { evento: req.evento.tipo, reglasAplicadas: [] },
    };
  }

  const reglas = reglasDe(asesor);
  const prompt = construirPrompt(asesor, {
    eventoTipo: req.evento.tipo,
    historial: req.historial,
    observaciones: req.observaciones,
    indice: req.evento.tipo === "turno.solicitar" ? req.evento.indice : undefined,
  });

  switch (req.evento.tipo) {
    case "llamada.cierre":
      return {
        ok: true,
        fuente: "guion",
        fin: true,
        meta: {
          evento: req.evento.tipo,
          reglasAplicadas: prompt.reglasAplicadas,
          promptResumen: prompt.system.slice(0, 180),
        },
      };

    case "observacion.dato":
      return {
        ok: true,
        fuente: "guion",
        meta: {
          evento: req.evento.tipo,
          reglasAplicadas: reglas.reglas,
          promptResumen: `Observación registrada: ${req.evento.etiqueta}=${req.evento.valor}`,
        },
      };

    case "observacion.camara":
      return {
        ok: true,
        fuente: "guion",
        meta: {
          evento: req.evento.tipo,
          reglasAplicadas: reglas.reglas,
          promptResumen: req.evento.activa
            ? `Cámara activa (${req.evento.etiquetaDispositivo ?? "sin etiqueta"})`
            : "Cámara inactiva",
        },
      };

    case "llamada.inicio":
    case "turno.solicitar": {
      const indice =
        req.evento.tipo === "turno.solicitar" ? req.evento.indice : 0;

      if (indice >= asesor.guion.length) {
        return {
          ok: true,
          fuente: "guion",
          fin: true,
          meta: {
            evento: req.evento.tipo,
            reglasAplicadas: prompt.reglasAplicadas,
            promptResumen: prompt.user.slice(0, 180),
          },
        };
      }

      // llamada.inicio solo prepara contexto; el primer turno lo pide turno.solicitar
      if (req.evento.tipo === "llamada.inicio") {
        return {
          ok: true,
          fuente: "guion",
          meta: {
            evento: req.evento.tipo,
            reglasAplicadas: prompt.reglasAplicadas,
            promptResumen: `Sesión lista · ${asesor.nombre} · ${asesor.rubro}`,
          },
        };
      }

      const turno = asesor.guion[indice]!;
      return {
        ok: true,
        fuente: "guion",
        turno,
        meta: {
          evento: req.evento.tipo,
          reglasAplicadas: prompt.reglasAplicadas,
          promptResumen: prompt.user.slice(0, 240),
        },
      };
    }

    default: {
      const _exhaustive: never = req.evento;
      void _exhaustive;
      return {
        ok: true,
        fuente: "guion",
        fin: true,
        meta: { evento: "llamada.cierre", reglasAplicadas: [] },
      };
    }
  }
}
