import { createFileRoute } from "@tanstack/react-router";
import { Portada } from "@/components/Portada";

/** Entrada por el enlace opaco del profesional: https://cotizar.<dominio>/c/<id_publico> */
export const Route = createFileRoute("/c/$idPublico")({
  head: () => ({
    meta: [
      { title: "Cotizá tu trabajo por video · VideoCotización" },
      {
        name: "description",
        content:
          "Mostrale el trabajo a un asistente por cámara y recibí un presupuesto orientativo en la misma llamada.",
      },
      // El enlace es privado de cada profesional: no se indexa.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnlaceProfesional,
});

function EnlaceProfesional() {
  const { idPublico } = Route.useParams();
  return <Portada idPublico={idPublico} />;
}
