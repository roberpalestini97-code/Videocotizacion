import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CabeceraPagina } from "@/components/CabeceraPagina";
import { NavPastilla } from "@/components/NavPastilla";

export const Route = createFileRoute("/v1/contacto")({
  head: () => ({
    meta: [
      { title: "Contacto · VideoCotización" },
      {
        name: "description",
        content:
          "Dejanos tu consulta o pedí que te llamemos para coordinar el trabajo después de la videocotización.",
      },
      { property: "og:title", content: "Contacto · VideoCotización" },
      {
        property: "og:description",
        content: "Escribinos o pedí que te llamemos para coordinar el trabajo.",
      },
    ],
  }),
  component: Contacto,
});

function Contacto() {
  const [enviado, setEnviado] = useState(false);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <CabeceraPagina
        kicker="Contacto"
        titulo="Hablemos del trabajo"
        bajada="Dejanos tus datos y te llamamos para coordinar la visita, o escribinos si tenés una duda."
      />

      <div className="px-5 py-8">
        {enviado ? (
          <div className="animate-rise rounded-3xl border border-black/5 bg-card p-5 text-center">
            <p className="font-display text-base font-semibold">¡Gracias! Te llamamos en breve.</p>
            <p className="mt-2 text-xs leading-relaxed text-ink/60">
              En el mockup no se envía nada todavía. Cuando conectemos el backend, esta consulta va
              a quedar registrada junto al presupuesto de la videollamada.
            </p>
            <button
              onClick={() => setEnviado(false)}
              className="mt-4 h-11 w-full rounded-full bg-brand text-sm font-semibold text-white"
            >
              Enviar otra consulta
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEnviado(true);
            }}
            className="space-y-3 rounded-3xl border border-black/5 bg-card p-5"
          >
            <Campo label="Nombre y apellido" placeholder="Rober Palestini" />
            <Campo label="Teléfono" placeholder="+54 9 11 0000 0000" type="tel" />
            <Campo label="Zona del trabajo" placeholder="Barrio, ciudad" />
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Qué necesitás
              </span>
              <textarea
                required
                rows={4}
                placeholder="Contanos brevemente el trabajo"
                className="mt-1.5 w-full rounded-2xl bg-cream px-4 py-3 text-sm outline-none ring-1 ring-black/5 placeholder:text-ink/35 focus:ring-brand"
              />
            </label>
            <button
              type="submit"
              className="h-14 w-full rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark"
            >
              Pedir que me llamen
            </button>
          </form>
        )}

        <div className="mt-5 space-y-2.5">
          <Dato etiqueta="WhatsApp" valor="+54 9 11 0000 0000" />
          <Dato etiqueta="Email" valor="hola@videocotizacion.com" />
          <Dato etiqueta="Horario de asesores" valor="Lunes a sábado, 8 a 20 h" />
        </div>
        <p className="mt-4 px-1 text-[11px] leading-relaxed text-ink/40">
          Los datos de contacto son de ejemplo: pasame los reales y los dejo cargados.
        </p>
      </div>

      <NavPastilla />
    </div>
  );
}

function Campo({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
        {label}
      </span>
      <input
        required
        type={type}
        placeholder={placeholder}
        className="mt-1.5 h-12 w-full rounded-2xl bg-cream px-4 text-sm outline-none ring-1 ring-black/5 placeholder:text-ink/35 focus:ring-brand"
      />
    </label>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-card px-4 py-3">
      <span className="text-xs text-ink/50">{etiqueta}</span>
      <span className="text-xs font-semibold">{valor}</span>
    </div>
  );
}
