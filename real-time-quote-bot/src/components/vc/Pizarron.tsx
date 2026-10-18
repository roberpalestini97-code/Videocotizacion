import type { Pizarron as EstadoPizarron } from "@/lib/videocotizacion/pizarron";
import { camposVisibles } from "@/lib/videocotizacion/pizarron";

/** Pizarrón en vivo con los datos anotados. Es texto plano (React escapa todo). */
export function PizarronVivo({ pizarron }: { pizarron: EstadoPizarron }) {
  const { anotados, faltantes } = camposVisibles(pizarron);
  if (anotados.length === 0 && faltantes.length === 0) return null;
  return (
    <div
      data-testid="pizarron"
      role="status"
      aria-live="polite"
      aria-label="Datos anotados en vivo"
      className="absolute left-3 top-12 z-[5] max-w-[min(48%,18rem)] portrait:right-3 portrait:top-10 portrait:max-w-none portrait:p-2 rounded-2xl bg-ink/75 p-2.5 ring-1 ring-white/15 backdrop-blur-md landscape:left-4 landscape:top-14 landscape:max-w-[36%]"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
        Datos en vivo
      </p>
      {/* En el celular vertical, una sola fila que se desliza: no tapa la cara del asesor. */}
      <div className="scrollbar-none mt-1.5 flex flex-wrap gap-1 portrait:flex-nowrap portrait:overflow-x-auto">
        {anotados.map((d) => (
          <span
            key={d.clave}
            data-testid={`pizarron-${d.clave}`}
            className="animate-rise shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85"
          >
            {d.etiqueta}: <span className="font-semibold">{d.valor}</span>
            {d.estado === "corregido_por_cliente" && <span title="Corregido por vos"> ✎</span>}
          </span>
        ))}
        {faltantes.map((d) => (
          <span
            key={d.clave}
            className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-white/30 px-2 py-0.5 text-[10px] text-white/55"
          >
            Falta: {d.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
