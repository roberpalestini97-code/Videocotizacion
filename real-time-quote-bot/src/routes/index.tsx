import { createFileRoute } from "@tanstack/react-router";
import { Portada } from "@/components/Portada";

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
  return <Portada />;
}
