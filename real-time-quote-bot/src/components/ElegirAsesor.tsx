import { useEffect, useState } from "react";
import { llamadasArmadas, type LlamadaArmada } from "@/data/llamadas";

/** Lista previa a la llamada, en el mismo formato que la portada publicada. */
export function ElegirAsesor({
  abierto,
  onCerrar,
  onConectar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onConectar: (enlace: string) => void;
}) {
  const [elegido, setElegido] = useState<LlamadaArmada>(llamadasArmadas[0]!);

  useEffect(() => {
    if (abierto) setElegido(llamadasArmadas[0]!);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function onTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="elegir-asesor-titulo"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[min(92dvh,52rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-ink shadow-2xl ring-1 ring-white/15 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2 text-white/90">
            <span className="size-1.5 rounded-full bg-online animate-blink" />
            <span className="text-xs font-medium uppercase tracking-[0.18em]">Antes de llamar</span>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar videollamada"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="scrollbar-modal min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-6">
          <div className="animate-rise">
            <h2 id="elegir-asesor-titulo" className="font-display text-2xl font-bold text-white">
              Elegí tu asesor
            </h2>
            <p className="mt-2 max-w-[340px] text-sm leading-relaxed text-white/70">
              Cada asesor atiende su oficio. Al conectar, primero te pedimos el consentimiento y
              después el navegador te pide cámara y micrófono.
            </p>

            <div className="mt-5 space-y-2.5">
              {llamadasArmadas.map((a) => {
                const activo = a.id === elegido.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setElegido(a)}
                    aria-pressed={activo}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors ${
                      activo ? "bg-white/15 ring-accent" : "bg-white/5 ring-white/15"
                    }`}
                  >
                    <img
                      src={a.foto}
                      alt={`${a.nombre}, asesor de ${a.rubro.toLowerCase()}`}
                      width={512}
                      height={512}
                      loading="lazy"
                      className={`size-14 shrink-0 rounded-full object-cover object-top ring-2 ${
                        activo ? "ring-accent" : "ring-white/15"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-sm font-semibold text-white">
                        {a.nombre} · {a.rubro}
                      </span>
                      <span className="block text-xs text-white/70">{a.especialidad}</span>
                      <span className="block text-[11px] text-white/50">Zona: {a.zona}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onConectar(elegido.enlace)}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark"
            >
              <span className="size-2.5 rounded-full bg-brand-dark animate-blink" />
              Conectar con {elegido.nombre}
            </button>
            <p className="mt-2 text-center text-[11px] text-white/50">
              Requiere micrófono y cámara · podés cortar cuando quieras
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
