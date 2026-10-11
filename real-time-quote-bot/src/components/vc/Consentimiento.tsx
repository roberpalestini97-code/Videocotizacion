import { useState } from "react";
import type { AvisoPrivacidad } from "@/lib/videocotizacion/tipos";
import type { ConsentimientoUI } from "@/lib/videocotizacion/controlador";
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

/** Pantalla de consentimiento: se muestra ANTES de abrir cámara y micrófono. */
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
  const todo = Object.values(c).every(Boolean);
  return (
    <div className="animate-rise">
      <h2 className="font-display text-2xl font-bold text-white">Antes de prender la cámara</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        {aviso?.resumen ??
          "Vamos a usar tu cámara y tu micrófono para entender el trabajo y armar un presupuesto orientativo."}
      </p>
      <p className="mt-2 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/70 ring-1 ring-white/10">
        Las imágenes de tu cámara <strong className="text-white">no se guardan</strong>: se usan en
        el momento para leer datos del trabajo (medidas, estado, altura).
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
          href={aviso.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
        >
          Leer el aviso completo (versión {aviso.version})
        </a>
      )}
      <p className="mt-2 inline-block rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        Texto a validar con abogado
      </p>

      <div className="mt-4 space-y-2.5" role="group" aria-label="Consentimientos requeridos">
        {CASILLAS.map(({ clave, texto }) => (
          <label
            key={clave}
            className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
          >
            <input
              type="checkbox"
              checked={c[clave]}
              onChange={(e) => setC({ ...c, [clave]: e.target.checked })}
              data-testid={`consent-${clave}`}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span className="text-xs leading-snug text-white/85">{texto}</span>
          </label>
        ))}
      </div>

      <button
        disabled={!todo || ocupado}
        onClick={() => onAceptar(c)}
        data-testid="consent-aceptar"
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark disabled:opacity-40"
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
  );
}
