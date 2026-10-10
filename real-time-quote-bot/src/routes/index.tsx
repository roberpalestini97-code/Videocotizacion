import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import heroImg from "@/assets/hero-oficio.jpg";
import { PasosAnimados } from "@/components/PasosAnimados";
import { VideoCotizacion } from "@/components/VideoCotizacion";
import { PruebaEquipo } from "@/components/PruebaEquipo";
import { NavPastilla } from "@/components/NavPastilla";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideoCotización · Cotizá mano de obra por videollamada" },
      {
        name: "description",
        content:
          "Conectá por video con un asesor, mostrale el trabajo y recibí el presupuesto de reparaciones, pintura, jardinería o limpieza en el momento.",
      },
      { property: "og:title", content: "VideoCotización · Cotizá mano de obra por videollamada" },
      {
        property: "og:description",
        content:
          "Mostrás el trabajo por cámara, el asesor evalúa el esfuerzo y te devuelve el presupuesto al instante.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [enLlamada, setEnLlamada] = useState(false);
  const [enPrueba, setEnPrueba] = useState(false);
  const [asesorElegido, setAsesorElegido] = useState<string | undefined>(undefined);

  function iniciar(id?: string) {
    setAsesorElegido(id);
    setEnLlamada(true);
  }

  return (
    <div className="min-h-screen bg-ink text-ink">
      {/* HERO */}
      <div className="relative min-h-[624px] w-full overflow-hidden">
        <img
          src={heroImg}
          alt="Profesional de oficio en su taller"
          width={1088}
          height={1600}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/35 to-ink" />

        <div className="relative z-10 flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-accent font-display text-base font-bold text-brand-dark">V©</span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              VideoCotización
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-online animate-blink" />
            En línea
          </div>
        </div>

        <div className="relative z-10 px-5 pt-14 pb-8">
          <span className="inline-block rounded-full bg-accent/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark">
            Cotización por video
          </span>
          <h1 className="mt-4 font-display text-[34px] font-bold leading-[1.05] text-white">
            Cotizá tu trabajo en una videollamada
          </h1>
          <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-white/80">
            Conectá con nuestro asesor, mostrale el trabajo y recibí el presupuesto al instante.
          </p>

          <div className="mt-6">
            <PasosAnimados />
          </div>

          <button
            onClick={() => iniciar()}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark shadow-lg shadow-black/20"
          >
            <span className="size-2.5 rounded-full bg-brand-dark animate-blink" />
            Iniciar videollamada
          </button>
          <button
            onClick={() => setEnPrueba(true)}
            className="mt-3 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white"
          >
            Probar cámara y micrófono
          </button>
          <p className="mt-2 text-center text-[11px] text-white/60">Requiere micrófono y cámara</p>
        </div>
      </div>


      <NavPastilla oscuro />

      <PruebaEquipo
        abierto={enPrueba}
        onCerrar={() => setEnPrueba(false)}
        onListo={() => {
          setEnPrueba(false);
          iniciar();
        }}
      />

      <VideoCotizacion
        abierto={enLlamada}
        onCerrar={() => setEnLlamada(false)}
        asesorInicial={asesorElegido}
      />
    </div>
  );
}
