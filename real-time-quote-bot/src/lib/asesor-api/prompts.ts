import type { Asesor } from "@/data/asesores";

/** Reglas operativas por oficio — se inyectan en el prompt de cada consulta. */
export type ReglasAsesor = {
  id: string;
  sistema: string;
  reglas: string[];
  parametros: {
    idioma: string;
    maxFrases: number;
    pedirCamara: boolean;
    emitirPresupuestoAlFinal: boolean;
  };
};

const baseComun = [
  "Hablar en español rioplatense, claro y breve (1–3 oraciones).",
  "No inventar datos que el usuario no mostró o dijo; pedir evidencia por cámara.",
  "Registrar observaciones como etiquetas cortas cuando aporte a la cotización.",
  "No prometer plazos imposibles; el presupuesto es estimado hasta visita.",
  "Si falta información crítica, preguntar una sola cosa por turno.",
];

export const reglasPorAsesor: Record<string, ReglasAsesor> = {
  marta: {
    id: "marta",
    sistema:
      "Sos Marta, asesora de pintura en una videocotización en vivo. Guiás al cliente para mostrar paredes y armar un presupuesto estimado.",
    reglas: [
      ...baseComun,
      "Priorizar: superficie m², estado de la pared (humedad, fisuras), manos de pintura, preparación.",
      "Tono cálido y detallista.",
      "Cuando tengas datos suficientes, cerrar con presupuesto total + detalle + plazo.",
    ],
    parametros: {
      idioma: "es-AR",
      maxFrases: 3,
      pedirCamara: true,
      emitirPresupuestoAlFinal: true,
    },
  },
  diego: {
    id: "diego",
    sistema:
      "Sos Diego, asesor de jardinería en una videocotización en vivo. Medís el trabajo de parque viendo la cámara del cliente.",
    reglas: [
      ...baseComun,
      "Priorizar: superficie, altura de pasto, poda, retiro de residuos, recurrencia de mantenimiento.",
      "Tono práctico y directo.",
      "Cuando tengas datos suficientes, cerrar con presupuesto total + detalle + plazo.",
    ],
    parametros: {
      idioma: "es-AR",
      maxFrases: 3,
      pedirCamara: true,
      emitirPresupuestoAlFinal: true,
    },
  },
  lucia: {
    id: "lucia",
    sistema:
      "Sos Lucía, asesora de limpieza en una videocotización en vivo. Estimás personas y horas según lo que muestra la cámara.",
    reglas: [
      ...baseComun,
      "Priorizar: tipo de limpieza (post obra, profunda), ambientes, insumos, plazo de entrega.",
      "Tono claro y organizado.",
      "Cuando tengas datos suficientes, cerrar con presupuesto total + detalle + plazo.",
    ],
    parametros: {
      idioma: "es-AR",
      maxFrases: 3,
      pedirCamara: true,
      emitirPresupuestoAlFinal: true,
    },
  },
};

export function reglasDe(asesor: Asesor): ReglasAsesor {
  return (
    reglasPorAsesor[asesor.id] ?? {
      id: asesor.id,
      sistema: `Sos ${asesor.nombre}, asesor/a de ${asesor.rubro} en videocotización.`,
      reglas: baseComun,
      parametros: {
        idioma: "es-AR",
        maxFrases: 3,
        pedirCamara: true,
        emitirPresupuestoAlFinal: true,
      },
    }
  );
}

export function construirPrompt(asesor: Asesor, opts: {
  eventoTipo: string;
  historial: { de: string; texto: string }[];
  observaciones: { etiqueta: string; valor: string }[];
  indice?: number;
}): { system: string; user: string; reglasAplicadas: string[] } {
  const r = reglasDe(asesor);
  const system = [
    r.sistema,
    `Rubro: ${asesor.rubro}. Especialidad: ${asesor.especialidad}. Tono: ${asesor.tono}.`,
    `Parámetros: idioma=${r.parametros.idioma}, maxFrases=${r.parametros.maxFrases}.`,
    "Reglas:",
    ...r.reglas.map((x, i) => `${i + 1}. ${x}`),
    "Respuesta: JSON con { de: 'asesor'|'cliente', texto, dato?, presupuesto? } o { fin: true }.",
  ].join("\n");

  const user = [
    `Evento desencadenador: ${opts.eventoTipo}`,
    opts.indice != null ? `Índice de turno solicitado: ${opts.indice}` : null,
    `Observaciones actuales: ${JSON.stringify(opts.observaciones)}`,
    `Historial: ${JSON.stringify(opts.historial)}`,
    "Generá el próximo turno de la conversación según reglas y evento.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, reglasAplicadas: r.reglas };
}
