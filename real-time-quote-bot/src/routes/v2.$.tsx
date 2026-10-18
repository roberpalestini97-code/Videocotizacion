import { createFileRoute, redirect } from "@tanstack/react-router";

/** La portada v2 se dio de baja: queda una sola portada, en la raíz. */
export const Route = createFileRoute("/v2/$")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
