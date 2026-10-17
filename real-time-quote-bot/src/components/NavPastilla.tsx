import { Link, useRouterState } from "@tanstack/react-router";
import { CircleHelp, Home, ListOrdered, Phone, Scale, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const links: {
  to: "/v1" | "/v1/como-funciona" | "/v1/faq" | "/v1/contacto" | "/v1/legales";
  label: string;
  icon: LucideIcon;
}[] = [
  { to: "/v1", label: "Inicio", icon: Home },
  { to: "/v1/como-funciona", label: "Cómo funciona", icon: ListOrdered },
  { to: "/v1/faq", label: "FAQ", icon: CircleHelp },
  { to: "/v1/contacto", label: "Contacto", icon: Phone },
  { to: "/v1/legales", label: "Legales", icon: Scale },
];

function estaActivo(pathname: string, to: (typeof links)[number]["to"]) {
  if (to === "/v1") return pathname === "/v1" || pathname === "/v1/";
  if (to === "/v1/legales") return pathname === "/v1/legales" || pathname.startsWith("/privacidad");
  return pathname === to;
}

/** Barra fija abajo, con ícono y nombre, en teléfono, tablet y escritorio. */
export function NavPastilla({ oscuro = false }: { oscuro?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className={oscuro ? "bg-ink" : undefined}>
      <p className={cn("px-5 pt-4 text-center text-[11px]", oscuro ? "text-white/40" : "text-ink/40")}>
        © 2026 VideoCotización · Mano de obra cotizada por video
      </p>
      <div className="h-20" aria-hidden />
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-ink pb-[env(safe-area-inset-bottom)]"
      >
        {links.map((l) => {
          const activo = estaActivo(pathname, l.to);
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: true }}
              aria-current={activo ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 px-1 py-2 md:py-2.5"
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-lg",
                  activo ? "bg-accent text-brand-dark" : "text-white/70",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span
                className={cn(
                  "max-w-[4.6rem] text-center text-[10px] leading-tight md:max-w-none md:text-[11px]",
                  activo ? "font-semibold text-accent" : "text-white/75 md:text-white/80",
                )}
              >
                {l.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
