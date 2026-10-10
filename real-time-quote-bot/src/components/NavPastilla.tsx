import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Inicio" },
  { to: "/faq", label: "FAQ" },
  { to: "/como-funciona", label: "Cómo funciona" },
  { to: "/contacto", label: "Contacto" },
  { to: "/legales", label: "Legales" },
] as const;

export function NavPastilla({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <div className={oscuro ? "bg-ink px-5 pb-8 pt-2" : "px-5 pb-8"}>
      <nav
        className={`flex items-center justify-between rounded-2xl px-4 py-3 ${oscuro ? "border border-white/10 bg-white/5" : "border border-black/5 bg-card"}`}
      >
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={oscuro ? "text-xs text-white/60" : "text-xs text-ink/50"}
            activeProps={{
              className: "text-xs font-semibold " + (oscuro ? "text-accent" : "text-brand"),
            }}
            activeOptions={{ exact: l.to === "/" }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className={`mt-4 text-center text-[11px] ${oscuro ? "text-white/40" : "text-ink/40"}`}>
        © 2026 VideoCotización · Mano de obra cotizada por video
      </p>
    </div>
  );
}
