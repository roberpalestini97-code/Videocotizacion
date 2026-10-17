import { createFileRoute } from "@tanstack/react-router";
import { Encuadre } from "@/components/Encuadre";

const fuentes =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=DM+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap";

export const Route = createFileRoute("/v2/")({
  head: () => ({
    meta: [
      { title: "VideoCotización · Encuadrá el trabajo" },
      {
        name: "description",
        content:
          "Apuntá la cámara a la pared, la pérdida o el jardín. Quien atiende te dice el presupuesto de mano de obra antes de cortar.",
      },
      { property: "og:title", content: "VideoCotización · Encuadrá el trabajo" },
      {
        property: "og:description",
        content: "Mostrás el trabajo por cámara y el número sale en la misma llamada.",
      },
    ],
    links: [{ rel: "stylesheet", href: fuentes }],
  }),
  component: PortadaV2,
});

function PortadaV2() {
  return <Encuadre />;
}
