import { useEffect, useRef, useState } from "react";
import type { AvisoPrivacidad } from "@/lib/videocotizacion/tipos";
import type { ConsentimientoUI } from "@/lib/videocotizacion/controlador";
import { rutaLocalDelAviso } from "@/lib/videocotizacion/aviso-url";
import { INCISOS_AVISO, etiquetaCatalogo } from "@/lib/videocotizacion/formato";

const VACIO: ConsentimientoUI = {
  acepta_camara_y_microfono: false,
  acepta_tratamiento: false,
  declara_mayor_de_18: false,
  informado_asistente_automatico: false,
};

const CASILLAS: { clave: keyof ConsentimientoUI; texto: string }[] = [
  {
    clave: "acepta_camara_y_microfono",
    texto: "Acepto que se use mi cámara y mi micrófono durante la llamada.",
  },
  {
    clave: "acepta_tratamiento",
    texto:
      "Acepto el tratamiento de mis datos para armar el presupuesto, según el aviso de privacidad.",
  },
  { clave: "declara_mayor_de_18", texto: "Declaro que soy mayor de 18 años." },
  {
    clave: "informado_asistente_automatico",
    texto:
      "Sé que me atiende un asistente automático (no una persona) con apariencia de trabajador.",
  },
];

/** Modal de consentimiento: se muestra ANTES de abrir cámara y micrófono. */
export function Consentimiento({
  aviso,
  textos,
  onAceptar,
  onRechazar,
  ocupado,
}: {
  aviso: AvisoPrivacidad | undefined;
  textos: Record<string, string> | undefined;
  onAceptar: (c: ConsentimientoUI) => void;
  onRechazar: () => void;
  ocupado: boolean;
}) {
  const [c, setC] = useState<ConsentimientoUI>(VACIO);
  const grupoRef = useRef<HTMLDivElement>(null);
  const todo = Object.values(c).every(Boolean);

  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;
    const timers = new Map<string, number>();
    const listos = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const clave = entry.target.getAttribute("data-consent-clave");
          if (!clave || listos.has(clave)) continue;
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          const pendiente = timers.get(clave);
          if (visible) {
            if (pendiente != null) continue;
            timers.set(
              clave,
              window.setTimeout(() => {
                timers.delete(clave);
                listos.add(clave);
                setC((prev) =>
                  prev[clave as keyof ConsentimientoUI] ? prev : { ...prev, [clave]: true },
                );
              }, 500),
            );
          } else if (pendiente != null) {
            window.clearTimeout(pendiente);
            timers.delete(clave);
          }
        }
      },
      // Viewport del navegador: la casilla tiene que verse de verdad, no solo estar en el scroll.
      { threshold: 0.5 },
    );
    for (const fila of grupo.querySelectorAll<HTMLElement>("[data-consent-clave]")) {
      obs.observe(fila);
    }
    return () => {
      obs.disconnect();
      for (const id of timers.values()) window.clearTimeout(id);
    };
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-rise" data-testid="dialogo-consentimiento">
      <div className="scrollbar-modal min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <h2 className="font-display text-2xl font-bold text-white">Antes de prender la cámara</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          {aviso?.resumen ??
            "Vamos a usar tu cámara y tu micrófono para entender el trabajo y armar un presupuesto orientativo."}
        </p>
        <p className="mt-2 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/70 ring-1 ring-white/10">
          Las imágenes de tu cámara <strong className="text-white">no se guardan</strong>: se usan
          en el momento para leer datos del trabajo (medidas, estado, altura).
        </p>

        {aviso && (
          <ul className="mt-3 space-y-1.5">
            {aviso.incisos.map((i) => (
              <li key={i} className="flex gap-2 text-xs leading-snug text-white/70">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                {etiquetaCatalogo(textos, `aviso.inciso.${i}`, INCISOS_AVISO[i] ?? i)}
              </li>
            ))}
          </ul>
        )}
        {aviso && (
          <a
            href={rutaLocalDelAviso(aviso.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
          >
            Leer el aviso completo (versión {aviso.version})
          </a>
        )}
        <p className="mt-2 block w-fit rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Texto a validar con abogado
        </p>

        <div
          ref={grupoRef}
          className="mt-4 space-y-2 pb-1"
          role="group"
          aria-label="Consentimientos requeridos"
        >
          {CASILLAS.map(({ clave, texto }) => (
            <label
              key={clave}
              data-consent-clave={clave}
              className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
            >
              <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
                <input
                  type="checkbox"
                  checked={c[clave]}
                  onChange={(e) => setC({ ...c, [clave]: e.target.checked })}
                  data-testid={`consent-${clave}`}
                  className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none opacity-0"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-md border border-white/20 bg-white/[0.05] transition-colors duration-200 peer-checked:animate-check-pop peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70"
                />
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="pointer-events-none relative z-[1] size-3.5 text-brand-dark opacity-0 peer-checked:animate-check-in"
                >
                  <path
                    d="M3.2 8.4 6.4 11.4 12.8 4.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-xs leading-snug text-white/85">{texto}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 pt-3">
        <button
          disabled={!todo || ocupado}
          onClick={() => onAceptar(c)}
          data-testid="consent-aceptar"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark disabled:opacity-40"
        >
          Acepto, prender cámara y micrófono
        </button>
        <button
          disabled={ocupado}
          onClick={onRechazar}
          data-testid="consent-rechazar"
          className="mt-2 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white disabled:opacity-40"
        >
          No acepto
        </button>
        <p className="mt-2 text-center text-[11px] text-white/50">
          Sin cámara no podemos cotizar. Si no aceptás, no se abre nada.
        </p>
      </div>
    </div>
  );
}
