import { createFileRoute, redirect } from "@tanstack/react-router";

const PAGINAS = ["como-funciona", "faq", "contacto", "legales"] as const;
type Pagina = (typeof PAGINAS)[number];

/** La portada v1 quedó como la única, en la raíz: los enlaces viejos a /v1/... siguen andando. */
export const Route = createFileRoute("/v1/$")({
  beforeLoad: ({ params }) => {
    const pagina = params._splat?.replace(/\/+$/, "") ?? "";
    const destino = (PAGINAS as readonly string[]).includes(pagina)
      ? (`/${pagina as Pagina}` as const)
      : "/";
    throw redirect({ to: destino, replace: true });
  },
});
