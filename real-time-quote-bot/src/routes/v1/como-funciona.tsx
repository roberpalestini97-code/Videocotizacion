import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CabeceraPagina } from "@/components/CabeceraPagina";
import { NavPastilla } from "@/components/NavPastilla";
import { ElegirAsesor } from "@/components/ElegirAsesor";
import { VideoCotizacion } from "@/components/VideoCotizacion";
import { llamadasArmadas } from "@/data/llamadas";

export const Route = createFileRoute("/v1/como-funciona")({
  head: () => ({
    meta: [
      { title: "Cómo funciona la VideoCotización · paso a paso" },
      {
        name: "description",
        content:
          "Llamás, mostrás el trabajo con la cámara, el asesor evalúa el esfuerzo y recibís el presupuesto en la misma llamada.",
      },
      { property: "og:title", content: "Cómo funciona la VideoCotización" },
      {
        property: "og:description",
        content: "Cuatro pasos para tener tu presupuesto de mano de obra sin visitas previas.",
      },
    ],
  }),
  component: ComoFunciona,
});

const pasos = [
  {
    n: "01",
    titulo: "Llamás",
    texto: "Toca el botón, elegís asesor y el navegador te pide cámara y micrófono.",
  },
  {
    n: "02",
    titulo: "Mostrás el trabajo",
    texto: "Recorrés el ambiente con la cámara. El asesor te guía sobre qué necesita ver.",
  },
  {
    n: "03",
    titulo: "El asesor evalúa",
    texto:
      "Mide superficie, estado, materiales y esfuerzo. Cada dato queda visible en pantalla mientras hablan.",
  },
  {
    n: "04",
    titulo: "Recibís el presupuesto",
    texto:
      "Total, detalle y plazo en la misma llamada. Si te interesa, te llamamos para coordinar la visita.",
  },
];

const rubros = [
  { titulo: "Reparaciones", texto: "Plomería, electricidad, albañilería." },
  { titulo: "Mantenimiento", texto: "Preventivo y correctivo por abono." },
  { titulo: "Pintura", texto: "Interior, exterior y acabados." },
  { titulo: "Jardinería", texto: "Corte, poda y parque." },
  { titulo: "Limpieza", texto: "Profunda, post obra y regular." },
];

function ComoFunciona() {
  const [enLlamada, setEnLlamada] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [enlace, setEnlace] = useState<string | undefined>();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <CabeceraPagina
        kicker="Cómo funciona"
        titulo="Cuatro pasos y tenés el presupuesto"
        bajada="Sin visitas previas, sin esperar días por un número. Todo ocurre dentro de la videollamada."
      />

      <div className="space-y-3 px-5 py-8">
        {pasos.map((p) => (
          <div key={p.n} className="flex gap-3 rounded-2xl border border-black/5 bg-card p-4">
            <span className="font-display text-2xl font-bold leading-none text-brand">{p.n}</span>
            <div>
              <p className="font-display text-sm font-semibold">{p.titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60">{p.texto}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-8">
        <h2 className="font-display text-base font-semibold">Qué podés cotizar</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {rubros.map((r) => (
            <div key={r.titulo} className="rounded-2xl border border-black/5 bg-card p-4">
              <p className="text-sm font-semibold">{r.titulo}</p>
              <p className="mt-1 text-xs text-ink/55">{r.texto}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8">
        <h2 className="font-display text-base font-semibold">Los asesores</h2>
        <div className="mt-3 space-y-2.5">
          {llamadasArmadas.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-black/5 bg-card p-3"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-semibold text-white">
                {a.inicial}
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">
                  {a.nombre} · {a.rubro}
                </p>
                <p className="text-xs text-ink/55">{a.especialidad}</p>
                <p className="text-[11px] text-ink/40">Zona: {a.zona}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setEligiendo(true)}
          className="mt-5 h-14 w-full rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark"
        >
          Iniciar VideoCotización
        </button>
      </div>

      <NavPastilla />
      <ElegirAsesor
        abierto={eligiendo}
        onCerrar={() => setEligiendo(false)}
        onConectar={(id) => {
          setEnlace(id);
          setEligiendo(false);
          setEnLlamada(true);
        }}
      />
      <VideoCotizacion abierto={enLlamada} onCerrar={() => setEnLlamada(false)} idPublico={enlace} />
    </div>
  );
}
