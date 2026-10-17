import { createFileRoute } from "@tanstack/react-router";
import { Talonario } from "@/components/Talonario";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideoCotización · El presupuesto se escribe en la llamada" },
      {
        name: "description",
        content:
          "Apuntá la cámara al arreglo, la pared o el jardín. Quien atiende anota el presupuesto de mano de obra antes de cortar.",
      },
      { property: "og:title", content: "VideoCotización · El presupuesto se escribe en la llamada" },
      {
        property: "og:description",
        content:
          "Mostrás el trabajo por cámara y el número queda escrito en la misma llamada.",
      },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  return <Talonario />;
}
