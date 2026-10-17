import { Link, createFileRoute } from "@tanstack/react-router";
import { CabeceraPagina } from "@/components/CabeceraPagina";
import { NavPastilla } from "@/components/NavPastilla";
import {
  AAIP_URL,
  AVISO_VIGENTE,
  LEY_DATOS_URL,
  SECCIONES_AVISO,
} from "@/data/aviso-privacidad";

export const Route = createFileRoute("/privacidad/$version")({
  head: ({ params }) => ({
    meta: [
      {
        title: `Aviso de privacidad ${params.version} · VideoCotización`,
      },
      {
        name: "description",
        content:
          "Aviso de privacidad de la videollamada: finalidad, destinatarios, derechos y autoridad de control.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: AvisoPrivacidad,
});

function AvisoPrivacidad() {
  const { version } = Route.useParams();
  const vigente = version === AVISO_VIGENTE;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <CabeceraPagina
        kicker="Ley 25.326"
        titulo="Aviso de privacidad"
        bajada="Información previa al uso de la cámara y el micrófono en la videollamada."
      />

      <article className="mx-auto max-w-xl px-5 py-8">
        {vigente ? <Aviso /> : <VersionAusente version={version} />}
      </article>

      <NavPastilla />
    </div>
  );
}

function Aviso() {
  return (
    <>
      <header className="border-b border-black/10 pb-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          Versión {AVISO_VIGENTE}
        </p>
        <p className="mt-2 text-sm text-ink/70">Vigente desde el 8 de octubre de 2026.</p>
        <p className="mt-4 text-sm leading-relaxed text-ink/80">
          Usamos tu imagen y tu voz solo durante la llamada para cotizar el trabajo. No guardamos
          fotogramas ni audio.
        </p>
        <p className="mt-4 rounded-2xl bg-brand-dark/5 px-4 py-3 text-xs leading-relaxed text-ink/70">
          Este texto está pendiente de revisión por un abogado. Antes de abrir el servicio al
          público se reemplaza por el instrumento validado. La ley aplicable es la{" "}
          <a
            href={LEY_DATOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline underline-offset-2"
          >
            Ley 25.326
          </a>
          , de Protección de los Datos Personales.
        </p>
      </header>

      <nav aria-label="Contenido del aviso" className="mt-6">
        <ol className="grid gap-1.5 text-sm">
          {SECCIONES_AVISO.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ink/70 underline-offset-2 hover:text-brand hover:underline">
                {i + 1}. {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-8">
        {SECCIONES_AVISO.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              <span className="mr-2 text-brand">{String(i + 1).padStart(2, "0")}</span>
              {s.titulo}
            </h2>
            {s.parrafos.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-ink/75">
                {p}
              </p>
            ))}
            {s.id === "derechos" && (
              <p className="mt-3">
                <Link
                  to="/v1/contacto"
                  className="text-sm font-medium text-brand underline underline-offset-2"
                >
                  Ir a Contacto
                </Link>
              </p>
            )}
            {s.id === "autoridad" && (
              <p className="mt-3">
                <a
                  href={AAIP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand underline underline-offset-2"
                >
                  argentina.gob.ar/aaip
                </a>
              </p>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-black/10 pt-5 text-xs leading-relaxed text-ink/55">
        <p>
          Texto oficial de la ley:{" "}
          <a
            href={LEY_DATOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline underline-offset-2"
          >
            Ley 25.326, texto actualizado
          </a>
          .
        </p>
        <p className="mt-2">VideoCotización · aviso {AVISO_VIGENTE}.</p>
      </footer>
    </>
  );
}

function VersionAusente({ version }: { version: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Esta versión no está publicada</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        El enlace pide el aviso {version}. El texto vigente es el {AVISO_VIGENTE}.
      </p>
      <Link
        to="/privacidad/$version"
        params={{ version: AVISO_VIGENTE }}
        className="mt-4 inline-block text-sm font-medium text-brand underline underline-offset-2"
      >
        Leer el aviso {AVISO_VIGENTE}
      </Link>
    </div>
  );
}
