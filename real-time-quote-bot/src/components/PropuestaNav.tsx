import { useState } from "react";
import { CircleHelp, Home, ListOrdered, Menu, Phone, Scale, X } from "lucide-react";
import heroImg from "@/assets/hero-oficio.jpg";

type Diseno = "barra" | "pastilla" | "indice";
type Pagina = "inicio" | "pasos" | "contacto" | "faq" | "legales";
type Ancho = "movil" | "tablet" | "escritorio";

const ANCHOS: { id: Ancho; px: number; alto: number; nombre: string }[] = [
  { id: "movil", px: 390, alto: 700, nombre: "Teléfono · 390" },
  { id: "tablet", px: 768, alto: 700, nombre: "Tablet · 768" },
  { id: "escritorio", px: 1280, alto: 700, nombre: "Escritorio · 1280" },
];

const PAGINAS: { id: Pagina; label: string }[] = [
  { id: "inicio", label: "Inicio" },
  { id: "pasos", label: "Cómo funciona" },
  { id: "contacto", label: "Contacto" },
];

const ITEMS: { id: Pagina; label: string; Icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", Icon: Home },
  { id: "pasos", label: "Cómo funciona", Icon: ListOrdered },
  { id: "faq", label: "FAQ", Icon: CircleHelp },
  { id: "contacto", label: "Contacto", Icon: Phone },
  { id: "legales", label: "Legales", Icon: Scale },
];

const DISENOS: { id: Diseno; nombre: string; texto: string }[] = [
  {
    id: "barra",
    nombre: "Barra",
    texto: "Arriba, siempre. En el teléfono se abre un panel. Desde la tablet los links quedan a la vista y en escritorio aparece el botón de videollamada.",
  },
  {
    id: "pastilla",
    nombre: "Pastilla",
    texto: "Al alcance del pulgar. En el teléfono y la tablet es una barra fija abajo. En escritorio se suelta del borde y queda flotando al centro.",
  },
  {
    id: "indice",
    nombre: "Índice",
    texto: "En el teléfono se lee la sección y el menú se despliega. En la tablet son pastillas. En escritorio, links quietos con un punto dorado.",
  },
];

function Marca({ clara = false }: { clara?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-accent font-display text-sm font-bold text-brand-dark">
        V©
      </span>
      <span className={`font-display text-sm font-semibold tracking-tight ${clara ? "text-white" : "text-ink"}`}>
        VideoCotización
      </span>
    </span>
  );
}

function NavBarra({
  ancho,
  pagina,
  abierto,
  onToggle,
  onIr,
}: {
  ancho: Ancho;
  pagina: Pagina;
  abierto: boolean;
  onToggle: () => void;
  onIr: (id: Pagina) => void;
}) {
  return (
    <div className="relative z-20 bg-brand-dark text-white">
      <div className={`flex items-center gap-4 ${ancho === "escritorio" ? "h-16 px-8" : "h-14 px-4"}`}>
        <Marca clara />
        {ancho === "movil" ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={abierto}
            className="ml-auto grid size-9 place-items-center rounded-full bg-white/10"
          >
            {abierto ? <X className="size-4" /> : <Menu className="size-4" />}
            <span className="sr-only">{abierto ? "Cerrar menú" : "Abrir menú"}</span>
          </button>
        ) : (
          <div className={`flex items-center ${ancho === "escritorio" ? "ml-8 gap-7" : "ml-4 gap-4"}`}>
            {ITEMS.map((item) => {
              const activo = item.id === pagina;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onIr(item.id)}
                  className={`border-b-2 pb-0.5 font-display text-sm ${
                    activo
                      ? "border-accent font-semibold text-white"
                      : "border-transparent text-white/65"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
        {ancho === "escritorio" && (
          <button
            type="button"
            className="ml-auto h-10 rounded-full bg-accent px-4 font-display text-sm font-semibold text-brand-dark"
          >
            Iniciar videollamada
          </button>
        )}
      </div>
      {ancho === "movil" && abierto && (
        <div className="border-t border-white/10 px-2 py-2">
          {ITEMS.map((item) => {
            const activo = item.id === pagina;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onIr(item.id)}
                className={`flex w-full items-center rounded-xl px-3 py-3 text-left font-display text-base ${
                  activo ? "bg-white/10 font-semibold text-accent" : "text-white/85"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavPastilla({
  ancho,
  pagina,
  onIr,
}: {
  ancho: Ancho;
  pagina: Pagina;
  onIr: (id: Pagina) => void;
}) {
  const escritorio = ancho === "escritorio";
  return (
    <nav
      className={
        escritorio
          ? "absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-2 py-2 ring-1 ring-white/15"
          : "absolute inset-x-0 bottom-0 z-20 flex items-stretch border-t border-white/10 bg-ink"
      }
    >
      {ITEMS.map((item) => {
        const activo = item.id === pagina;
        const Icon = item.Icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onIr(item.id)}
            className={
              escritorio
                ? `rounded-full px-3 py-1.5 font-display text-sm ${
                    activo ? "bg-white/10 font-semibold text-accent" : "text-white/70"
                  }`
                : `flex flex-1 flex-col items-center gap-1 px-1 py-2 ${ancho === "tablet" ? "py-2.5" : ""}`
            }
          >
            {!escritorio && (
              <span
                className={`grid size-7 place-items-center rounded-lg ${
                  activo ? "bg-accent text-brand-dark" : "text-white/70"
                }`}
              >
                <Icon className="size-3.5" />
              </span>
            )}
            <span
              className={`text-center leading-tight ${
                escritorio
                  ? ""
                  : ancho === "tablet"
                    ? "text-[11px] text-white/80"
                    : "max-w-[4.6rem] text-[10px] text-white/75"
              } ${activo && !escritorio ? "font-semibold text-accent" : ""}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function NavIndice({
  ancho,
  pagina,
  abierto,
  onToggle,
  onIr,
}: {
  ancho: Ancho;
  pagina: Pagina;
  abierto: boolean;
  onToggle: () => void;
  onIr: (id: Pagina) => void;
}) {
  const actual = ITEMS.find((i) => i.id === pagina)?.label ?? "Inicio";
  if (ancho === "movil") {
    return (
      <div className="relative z-20 bg-ink text-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent font-display text-sm font-bold text-brand-dark">
            V©
          </span>
          <span className="min-w-0 truncate font-display text-base font-semibold">{actual}</span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={abierto}
            className="ml-auto text-xs font-semibold uppercase tracking-[0.14em] text-accent"
          >
            {abierto ? "Cerrar" : "Menú"}
          </button>
        </div>
        {abierto && (
          <div className="space-y-1.5 border-t border-white/10 px-3 py-3">
            {ITEMS.map((item) => {
              const activo = item.id === pagina;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onIr(item.id)}
                  className={`flex w-full rounded-2xl px-3 py-3 text-left font-display text-sm ${
                    activo ? "bg-white/15 font-semibold ring-1 ring-accent" : "bg-white/5 ring-1 ring-white/10"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (ancho === "tablet") {
    return (
      <div className="relative z-20 bg-ink">
        <div className="flex items-center gap-3 px-4 pt-3">
          <Marca clara />
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {ITEMS.map((item) => {
            const activo = item.id === pagina;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onIr(item.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 font-display text-sm ${
                  activo ? "bg-accent font-semibold text-brand-dark" : "bg-white/10 text-white/80"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="relative z-20 flex h-16 items-center gap-8 bg-ink px-8 text-white">
      <Marca clara />
      <div className="flex items-center gap-6">
        {ITEMS.map((item) => {
          const activo = item.id === pagina;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onIr(item.id)}
              className={`flex items-center gap-2 font-display text-sm ${
                activo ? "font-semibold text-white" : "text-white/60"
              }`}
            >
              <span className={`size-1.5 rounded-full ${activo ? "bg-accent" : "bg-transparent"}`} />
              {item.label}
            </button>
          );
        })}
      </div>
      <span className="ml-auto flex items-center gap-1.5 text-xs text-white/70">
        <span className="size-1.5 rounded-full bg-online" />
        En línea
      </span>
    </div>
  );
}

function Cuerpo({ pagina }: { pagina: Pagina }) {
  if (pagina === "inicio") {
    return (
      <div className="relative min-h-full bg-ink text-white">
        <img
          src={heroImg}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/25 to-ink" />
        <div className="relative px-5 pb-8 pt-8">
          <span className="inline-block rounded-full bg-accent/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark">
            Cotización por video
          </span>
          <h1 className="mt-4 max-w-md font-display text-[32px] font-bold leading-[1.05]">
            Cotizá tu trabajo en una videollamada
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/80">
            Conectá con un asesor, mostrale el trabajo y recibí el presupuesto al instante.
          </p>
          <button
            type="button"
            className="mt-6 flex h-12 w-full max-w-sm items-center justify-center rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
          >
            Iniciar videollamada
          </button>
        </div>
      </div>
    );
  }
  const titulo =
    pagina === "pasos"
      ? "Cuatro pasos y tenés el presupuesto"
      : pagina === "contacto"
        ? "Hablemos del trabajo"
        : pagina === "faq"
          ? "Preguntas frecuentes"
          : "Información legal";
  const kicker =
    pagina === "pasos" ? "Cómo funciona" : pagina === "contacto" ? "Contacto" : pagina === "faq" ? "FAQ" : "Legales";
  return (
    <div className="min-h-full bg-cream text-ink">
      <header className="bg-brand-dark px-5 pb-8 pt-6 text-white">
        <span className="inline-block rounded-full bg-accent/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark">
          {kicker}
        </span>
        <h1 className="mt-3 max-w-md font-display text-[28px] font-bold leading-[1.08]">{titulo}</h1>
      </header>
      <div className="space-y-3 px-5 py-5">
        {pagina === "contacto" ? (
          <div className="rounded-3xl border border-black/5 bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">Nombre</p>
            <div className="mt-2 h-11 rounded-2xl bg-cream ring-1 ring-black/5" />
            <div className="mt-4 h-12 rounded-2xl bg-accent" />
          </div>
        ) : (
          [1, 2].map((n) => (
            <div key={n} className="rounded-2xl border border-black/5 bg-card p-4">
              <p className="font-display text-sm font-semibold">
                {pagina === "pasos" ? `Paso ${n}` : "Apartado"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/55">
                El asesor te guía y el presupuesto queda en la misma llamada.
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Marco({
  ancho,
  diseno,
  pagina,
  onIr,
}: {
  ancho: Ancho;
  diseno: Diseno;
  pagina: Pagina;
  onIr: (id: Pagina) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const medida = ANCHOS.find((a) => a.id === ancho)!;
  const arriba = diseno !== "pastilla";
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[28px] bg-ink ring-1 ring-black/15"
      style={{ width: medida.px, height: medida.alto }}
    >
      <div className={`flex h-full flex-col ${diseno === "pastilla" ? "pb-[4.5rem]" : ""}`}>
        {diseno === "barra" && (
          <NavBarra
            ancho={ancho}
            pagina={pagina}
            abierto={abierto}
            onToggle={() => setAbierto((v) => !v)}
            onIr={onIr}
          />
        )}
        {diseno === "indice" && (
          <NavIndice
            ancho={ancho}
            pagina={pagina}
            abierto={abierto}
            onToggle={() => setAbierto((v) => !v)}
            onIr={onIr}
          />
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto ${arriba ? "" : ""}`}>
          <Cuerpo pagina={pagina} />
        </div>
      </div>
      {diseno === "pastilla" && <NavPastilla ancho={ancho} pagina={pagina} onIr={onIr} />}
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`h-10 rounded-full px-4 font-display text-sm ${
        activo ? "bg-ink font-semibold text-white" : "bg-white text-ink ring-1 ring-black/10"
      }`}
    >
      {children}
    </button>
  );
}

/** Tablero para comparar tres navbars. No reemplaza el menú publicado. */
export function EstudioNav() {
  const [diseno, setDiseno] = useState<Diseno>("barra");
  const [pagina, setPagina] = useState<Pagina>("inicio");
  const elegido = DISENOS.find((d) => d.id === diseno)!;

  return (
    <div className="min-h-screen bg-[#e6e1d6] text-ink">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f4f0e6] px-5 py-4">
        <p className="font-display text-lg font-semibold">Tres navbars</p>
        <p className="mt-1 max-w-2xl text-sm text-ink/70">{elegido.texto}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DISENOS.map((d) => (
            <Chip key={d.id} activo={d.id === diseno} onClick={() => setDiseno(d.id)}>
              {d.nombre}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAGINAS.map((p) => (
            <Chip key={p.id} activo={p.id === pagina} onClick={() => setPagina(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </header>
      <div className="flex items-start gap-6 overflow-x-auto px-5 py-6">
        {ANCHOS.map((a) => (
          <figure key={a.id} className="shrink-0">
            <figcaption className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
              {a.nombre}
            </figcaption>
            <Marco ancho={a.id} diseno={diseno} pagina={pagina} onIr={setPagina} />
          </figure>
        ))}
      </div>
    </div>
  );
}
