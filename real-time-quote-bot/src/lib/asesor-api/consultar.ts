import { createServerFn } from "@tanstack/react-start";
import { asesores } from "@/data/asesores";
import { construirPrompt, reglasDe } from "./prompts";
import { resolverRespuestaLocal } from "./resolver";
import {
  asesorApiRequestSchema,
  type AsesorApiRequest,
  type AsesorApiResponse,
  type AsesorApiError,
} from "./types";

async function respuestaRemotaOLlm(
  req: AsesorApiRequest,
): Promise<AsesorApiResponse | null> {
  const remoto = process.env.ASESOR_API_URL;
  const key = process.env.OPENAI_API_KEY ?? process.env.ASESOR_API_KEY;
  const asesor = asesores.find((a) => a.id === req.asesorId);
  if (!asesor) return null;

  const prompt = construirPrompt(asesor, {
    eventoTipo: req.evento.tipo,
    historial: req.historial,
    observaciones: req.observaciones,
    indice: req.evento.tipo === "turno.solicitar" ? req.evento.indice : undefined,
  });

  if (remoto) {
    const res = await fetch(remoto, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        ...req,
        prompt,
        avatar: asesor.avatar,
        reglas: reglasDe(asesor),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AsesorApiResponse>;
    return {
      ok: true,
      fuente: "remoto",
      turno: data.turno,
      fin: data.fin,
      meta: {
        evento: req.evento.tipo,
        reglasAplicadas: prompt.reglasAplicadas,
        promptResumen: prompt.user.slice(0, 240),
        ...data.meta,
      },
    };
  }

  if (key) {
    const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const model = process.env.ASESOR_MODEL ?? "gpt-4o-mini";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        de?: "asesor" | "cliente";
        texto?: string;
        dato?: { etiqueta: string; valor: string };
        presupuesto?: { total: string; detalle: string; plazo: string };
        fin?: boolean;
      };
      if (parsed.fin) {
        return {
          ok: true,
          fuente: "llm",
          fin: true,
          meta: {
            evento: req.evento.tipo,
            reglasAplicadas: prompt.reglasAplicadas,
          },
        };
      }
      if (!parsed.texto || !parsed.de) return null;
      return {
        ok: true,
        fuente: "llm",
        turno: {
          de: parsed.de,
          texto: parsed.texto,
          ...(parsed.dato ? { dato: parsed.dato } : {}),
          ...(parsed.presupuesto ? { presupuesto: parsed.presupuesto } : {}),
        },
        meta: {
          evento: req.evento.tipo,
          reglasAplicadas: prompt.reglasAplicadas,
          promptResumen: prompt.user.slice(0, 240),
        },
      };
    } catch {
      return null;
    }
  }

  return null;
}

export const consultarAsesor = createServerFn({ method: "POST" })
  .validator(asesorApiRequestSchema)
  .handler(async ({ data }): Promise<AsesorApiResponse | AsesorApiError> => {
    try {
      const llm = await respuestaRemotaOLlm(data);
      if (llm) return llm;
      return resolverRespuestaLocal(data);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Error en consultarAsesor",
      };
    }
  });
