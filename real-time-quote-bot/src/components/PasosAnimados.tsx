/** Tres micro-animaciones tipo GIF que resumen el flujo, entre el texto del hero y el botón. */
export function PasosAnimados() {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <PasoCard n="1" titulo="Llamás">
        <div className="relative grid size-full place-items-center">
          <span className="absolute size-9 rounded-full bg-accent/40 animate-pulse-ring" />
          <span
            className="absolute size-9 rounded-full bg-accent/40 animate-pulse-ring"
            style={{ animationDelay: "0.7s" }}
          />
          <span className="relative grid size-8 place-items-center rounded-full bg-accent text-brand-dark text-sm">
            ✆
          </span>
        </div>
      </PasoCard>

      <PasoCard n="2" titulo="Mostrás">
        <div className="relative grid size-full place-items-center">
          <span className="absolute inset-x-4 inset-y-3 rounded-lg border border-white/25" />
          <span className="relative block h-7 w-11 rounded-md bg-white/15 ring-1 ring-white/30 animate-sweep">
            <span className="absolute left-1.5 top-1.5 size-4 rounded-full bg-accent/80" />
          </span>
        </div>
      </PasoCard>

      <PasoCard n="3" titulo="Cotizás">
        <div className="grid size-full place-items-center px-3">
          <div className="w-full space-y-1.5">
            <span className="block h-1.5 rounded-full bg-white/50 animate-fill" />
            <span
              className="block h-1.5 rounded-full bg-white/35 animate-fill"
              style={{ animationDelay: "0.4s" }}
            />
            <span className="block text-[10px] font-semibold text-accent">$ 185.400</span>
          </div>
        </div>
      </PasoCard>
    </div>
  );
}

function PasoCard({
  n,
  titulo,
  children,
}: {
  n: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
      <div className="h-16">{children}</div>
      <div className="flex items-center gap-1.5 px-2.5 pb-2">
        <span className="text-[10px] font-semibold text-accent">{n}</span>
        <span className="text-[11px] font-medium text-white/90">{titulo}</span>
      </div>
    </div>
  );
}
