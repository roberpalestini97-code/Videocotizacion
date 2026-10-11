import { Link } from "@tanstack/react-router";

export function CabeceraPagina({
  kicker,
  titulo,
  bajada,
}: {
  kicker: string;
  titulo: string;
  bajada: string;
}) {
  return (
    <header className="bg-brand-dark px-5 pb-8 pt-5">
      <Link to="/" className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-accent font-display text-base font-bold text-brand-dark">
          V©
        </span>
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          VideoCotización
        </span>
      </Link>
      <span className="mt-6 inline-block rounded-full bg-accent/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark">
        {kicker}
      </span>
      <h1 className="mt-3 font-display text-[30px] font-bold leading-[1.08] text-white">
        {titulo}
      </h1>
      <p className="mt-3 max-w-[320px] text-sm leading-relaxed text-white/75">{bajada}</p>
    </header>
  );
}
