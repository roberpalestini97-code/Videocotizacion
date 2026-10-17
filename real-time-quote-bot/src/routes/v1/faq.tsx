import { createFileRoute } from "@tanstack/react-router";
import { CabeceraPagina } from "@/components/CabeceraPagina";
import { NavPastilla } from "@/components/NavPastilla";

export const Route = createFileRoute("/v1/faq")({
  head: () => ({
    meta: [
      { title: "Preguntas frecuentes · VideoCotización" },
      {
        name: "description",
        content:
          "Cuánto dura la llamada, qué pasa con tu video, si el presupuesto es definitivo y cómo se coordina el trabajo.",
      },
      { property: "og:title", content: "Preguntas frecuentes · VideoCotización" },
      {
        property: "og:description",
        content: "Todo sobre la videollamada, los permisos, el presupuesto y la privacidad.",
      },
    ],
  }),
  component: Faq,
});

const preguntas = [
  {
    q: "¿Cuánto dura la videollamada?",
    a: "Entre 5 y 10 minutos. El asesor te pide ver lo justo para medir el trabajo y cerrar un número.",
  },
  {
    q: "¿Necesito instalar algo?",
    a: "No. Se usa la cámara y el micrófono del navegador. Tenés que dar permiso cuando el navegador lo pide.",
  },
  {
    q: "¿El presupuesto es definitivo?",
    a: "Es una estimación firme sobre lo que se vio en cámara. Si al llegar aparece algo no visible, se ajusta con tu confirmación antes de empezar.",
  },
  {
    q: "¿Qué pasa con mi video?",
    a: "Se procesa durante la llamada para evaluar el trabajo. No se publica ni se comparte, y no se guarda si no lo autorizás.",
  },
  {
    q: "¿Puedo cortar en cualquier momento?",
    a: "Sí. Al cerrar la llamada se apagan cámara y micrófono automáticamente.",
  },
  {
    q: "¿Qué pasa si me interesa avanzar?",
    a: "Dejás tu confirmación y te llamamos para coordinar día, horario y forma de pago.",
  },
  {
    q: "¿Tiene costo cotizar?",
    a: "No. La videocotización es gratuita y sin compromiso.",
  },
];

function Faq() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <CabeceraPagina
        kicker="FAQ"
        titulo="Preguntas frecuentes"
        bajada="Lo que más nos consultan antes de la primera videollamada."
      />
      <div className="space-y-3 px-5 py-8">
        {preguntas.map((p) => (
          <details key={p.q} className="rounded-2xl border border-black/5 bg-card p-4">
            <summary className="cursor-pointer list-none font-display text-sm font-semibold">
              {p.q}
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-ink/60">{p.a}</p>
          </details>
        ))}
      </div>
      <NavPastilla />
    </div>
  );
}
