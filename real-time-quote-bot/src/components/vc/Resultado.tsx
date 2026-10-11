import { useState } from "react";
import { urlWhatsAppPermitida } from "@/lib/videocotizacion/cliente";
import { textoMotivoCierre } from "@/lib/videocotizacion/controlador";
import { formatearCantidad, formatearCentavos } from "@/lib/videocotizacion/formato";
import type { Cotizacion, DerivacionWhatsApp, MotivoCierre } from "@/lib/videocotizacion/tipos";

/** Derivación a WhatsApp con el profesional (sin pasarela de pago). */
export function BotonWhatsApp({ derivacion }: { derivacion: DerivacionWhatsApp }) {
  const [copiado, setCopiado] = useState(false);
  const valida = urlWhatsAppPermitida(derivacion.url_wa_me);
  return (
    <div data-testid="derivacion" className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/15">
      <p className="text-xs leading-snug text-white/75">
        Para avanzar, escribile a tu profesional por WhatsApp. Ya va a estar cargado tu código de
        referencia:
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          data-testid="codigo-referencia"
          className="font-display text-base font-bold tracking-wider text-accent"
        >
          {derivacion.codigo_referencia}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(derivacion.codigo_referencia)
              .then(() => setCopiado(true));
          }}
          className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      {valida ? (
        <a
          href={derivacion.url_wa_me}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="whatsapp"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
        >
          Continuar por WhatsApp
        </a>
      ) : (
        <p className="mt-2 text-xs text-white/60">
          No pudimos armar el enlace de WhatsApp. Guardá tu código y escribile a tu profesional.
        </p>
      )}
    </div>
  );
}

/** Presupuesto: SOLO se muestra al final, cuando llega `cotizacion.emitida`. */
export function Resultado({
  cotizacion,
  derivacion,
  onCerrar,
}: {
  cotizacion: Cotizacion;
  derivacion: DerivacionWhatsApp | undefined;
  onCerrar: () => void;
}) {
  return (
    <div data-testid="resultado" className="animate-rise">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
        Presupuesto orientativo
      </p>
      <p data-testid="total" className="mt-1 font-display text-4xl font-bold text-white">
        {formatearCentavos(cotizacion.total_centavos, cotizacion.moneda)}
      </p>
      <p className="mt-1 text-xs text-white/60">
        Válido por {cotizacion.validez_dias} días
        {cotizacion.tarifas.estado === "referencia_publica_sin_validar" &&
          " · tarifas de referencia, a confirmar con tu profesional"}
      </p>
      {cotizacion.fuera_de_zona && (
        <p className="mt-2 rounded-xl bg-accent/15 p-2.5 text-xs leading-snug text-white/85">
          Tu zona queda fuera de las que atiende este profesional: el presupuesto es igual de
          orientativo y puede sumar traslado. Confirmalo por WhatsApp.
        </p>
      )}
      <ul className="mt-3 divide-y divide-white/10 rounded-2xl bg-white/5 ring-1 ring-white/10">
        {cotizacion.items.map((it, i) => (
          <li
            key={`${it.codigo_tarea}-${i}`}
            className="flex items-start justify-between gap-3 p-3"
          >
            <span className="min-w-0 text-xs leading-snug text-white/85">
              {it.descripcion}
              <span className="block text-[10px] text-white/50">{formatearCantidad(it)}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-white">
              {formatearCentavos(it.importe_centavos, cotizacion.moneda)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-white/55">{cotizacion.leyenda}</p>
      {derivacion && <BotonWhatsApp derivacion={derivacion} />}
      <button
        onClick={onCerrar}
        className="mt-3 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white"
      >
        Cerrar
      </button>
    </div>
  );
}

/** Cierre sin presupuesto (cortó el cliente, silencio, cupo, error, sin consentimiento). */
export function CierreSinPresupuesto({
  motivo,
  derivacion,
  onReiniciar,
  onCerrar,
}: {
  motivo: MotivoCierre | undefined;
  derivacion: DerivacionWhatsApp | undefined;
  onReiniciar: (() => void) | null;
  onCerrar: () => void;
}) {
  return (
    <div data-testid="cierre" className="animate-rise">
      <h2 className="font-display text-2xl font-bold text-white">Llamada terminada</h2>
      <p data-testid="cierre-motivo" className="mt-2 text-sm leading-relaxed text-white/75">
        {textoMotivoCierre(motivo)}
      </p>
      {derivacion && <BotonWhatsApp derivacion={derivacion} />}
      {onReiniciar && (
        <button
          onClick={onReiniciar}
          className="mt-4 h-12 w-full rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
        >
          Empezar de nuevo
        </button>
      )}
      <button
        onClick={onCerrar}
        className="mt-2 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white"
      >
        Cerrar
      </button>
    </div>
  );
}
