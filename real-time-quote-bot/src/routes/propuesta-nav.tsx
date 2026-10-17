import { createFileRoute } from "@tanstack/react-router";
import { EstudioNav } from "@/components/PropuestaNav";

export const Route = createFileRoute("/propuesta-nav")({
  head: () => ({
    meta: [
      { title: "Tres navbars · VideoCotización" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EstudioNav,
});
