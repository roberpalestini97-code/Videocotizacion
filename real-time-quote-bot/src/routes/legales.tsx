import { createFileRoute } from "@tanstack/react-router";
import { CabeceraPagina } from "@/components/CabeceraPagina";
import { NavPastilla } from "@/components/NavPastilla";

export const Route = createFileRoute("/legales")({
  head: () => ({
    meta: [
      { title: "Legales y privacidad · VideoCotización" },
      {
        name: "description",
        content:
          "Términos de uso, tratamiento del video y del audio, validez del presupuesto y datos de contacto para ejercer tus derechos.",
      },
      { property: "og:title", content: "Legales y privacidad · VideoCotización" },
      {
        property: "og:description",
        content: "Cómo tratamos tu video, tu audio y tus datos durante la videocotización.",
      },
    ],
  }),
  component: Legales,
});

const bloques = [
  {
    titulo: "1. Qué es este servicio",
    texto:
      "VideoCotización es un canal de atención por videollamada para estimar trabajos de mano de obra: reparaciones, mantenimiento, pintura, jardinería y limpieza. La estimación no constituye un contrato de obra.",
  },
  {
    titulo: "2. Cámara y micrófono",
    texto:
      "El acceso a cámara y micrófono lo autorizás vos desde el navegador y se puede revocar en cualquier momento. Al finalizar la llamada, los dispositivos se liberan automáticamente.",
  },
  {
    titulo: "3. Tratamiento de video y audio",
    texto:
      "La imagen y el audio se procesan durante la llamada con el único fin de evaluar el trabajo y generar el presupuesto. No se graban ni se almacenan sin tu consentimiento expreso, y nunca se usan para publicidad.",
  },
  {
    titulo: "4. Datos de contacto",
    texto:
      "Si pedís que te llamemos, guardamos nombre, teléfono, dirección del trabajo y el detalle del presupuesto para coordinar el servicio. Podés solicitar su corrección o eliminación escribiéndonos.",
  },
  {
    titulo: "5. Validez del presupuesto",
    texto:
      "El presupuesto se emite sobre la información visible en cámara y tiene una validez de 15 días corridos. Si en la visita aparecen tareas no observadas, se informa y se requiere tu aprobación antes de continuar.",
  },
  {
    titulo: "6. Asistencia automatizada",
    texto:
      "La atención puede estar asistida por un sistema automatizado entrenado por nuestro equipo. Siempre podés pedir hablar con una persona del equipo antes de contratar.",
  },
];

function Legales() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <CabeceraPagina
        kicker="Legales"
        titulo="Términos y privacidad"
        bajada="Texto de referencia para el mockup: revisalo con tu asesoría legal antes de publicar."
      />
      <div className="space-y-3 px-5 py-8">
        {bloques.map((b) => (
          <section key={b.titulo} className="rounded-2xl border border-black/5 bg-card p-4">
            <h2 className="font-display text-sm font-semibold">{b.titulo}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink/60">{b.texto}</p>
          </section>
        ))}
        <p className="px-1 text-[11px] leading-relaxed text-ink/40">
          Última actualización: septiembre de 2026.
        </p>
      </div>
      <NavPastilla />
    </div>
  );
}
