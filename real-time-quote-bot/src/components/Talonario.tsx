import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ElegirAsesor } from "@/components/ElegirAsesor";
import { PruebaEquipo } from "@/components/PruebaEquipo";
import { VideoCotizacion } from "@/components/VideoCotizacion";
import { llamadasArmadas } from "@/data/llamadas";

const pasos = [
  {
    n: "1",
    titulo: "Llamás",
    texto: "Elegís quién atiende. El navegador pide cámara y micrófono.",
  },
  {
    n: "2",
    titulo: "Mostrás",
    texto: "Recorrés el ambiente. Te dicen qué tienen que ver.",
  },
  {
    n: "3",
    titulo: "Recibís el número",
    texto: "Total, detalle y plazo, en la misma llamada. Si seguís, coordinan la visita.",
  },
];

const oficios = [
  { titulo: "Reparaciones", texto: "Plomería, electricidad y albañilería." },
  { titulo: "Mantenimiento", texto: "Preventivo y correctivo, por visita o por abono." },
  { titulo: "Pintura", texto: "Interior, exterior y acabados." },
  { titulo: "Jardinería", texto: "Corte, poda y parque." },
  { titulo: "Limpieza", texto: "Profunda, post obra y regular." },
];

const dudas = [
  {
    q: "¿Cuánto dura?",
    a: "Entre 5 y 10 minutos. Se mira lo justo para medir el trabajo.",
  },
  {
    q: "¿Hay que instalar algo?",
    a: "No. Se usa la cámara y el micrófono del navegador, con el permiso que das vos.",
  },
  {
    q: "¿El número es definitivo?",
    a: "Es firme sobre lo que se vio. Si en la visita aparece algo que no estaba en cámara, se ajusta con tu confirmación antes de empezar.",
  },
];

const nav = [
  { to: "/v1/como-funciona" as const, label: "Cómo funciona" },
  { to: "/v1/faq" as const, label: "Preguntas" },
  { to: "/v1/contacto" as const, label: "Contacto" },
  { to: "/v1/legales" as const, label: "Legales" },
];

/** Portada nueva: el presupuesto como talonario, no como ficha de producto. */
export function Talonario() {
  const [enLlamada, setEnLlamada] = useState(false);
  const [enPrueba, setEnPrueba] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [enlace, setEnlace] = useState<string | undefined>();

  function iniciar() {
    setEligiendo(true);
  }

  return (
    <div className="talonario">
      <div className="barra-fondo">
        <div className="ancho barra">
          <Link to="/" className="marca">
            VideoCotización
          </Link>
          <nav aria-label="Secciones">
            {nav.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main>
        <section className="hero">
          <div className="ancho hero-grid">
            <div className="hero-texto">
              <h1>Mostrá el trabajo. El presupuesto se escribe en la llamada.</h1>
              <p>
                Apuntá la cámara a la pared, la pérdida o el jardín. Quien atiende mira lo que se ve
                y anota el número antes de cortar.
              </p>
              <div className="acciones">
                <button type="button" className="llamar" onClick={iniciar}>
                  Iniciar llamada
                </button>
                <button type="button" className="probar" onClick={() => setEnPrueba(true)}>
                  Probar cámara y micrófono
                </button>
              </div>
              <p className="nota">Cámara y micrófono del navegador. No hay que instalar nada.</p>
            </div>

            <aside className="talon" aria-label="Ejemplo de presupuesto">
              <p className="talon-kicker">Talonario · ejemplo</p>
              <h2>Pintura interior</h2>
              <p className="talon-aclaracion">
                Así queda el papel. Este número es de muestra, no es el tuyo.
              </p>
              <div className="renglones">
                <div className="renglon">
                  <span>Qué se midió</span>
                  <span className="puntos" aria-hidden="true" />
                  <span className="cifra">18 m² de muro</span>
                </div>
                <div className="renglon">
                  <span>Mano de obra</span>
                  <span className="puntos" aria-hidden="true" />
                  <span className="cifra">dos manos</span>
                </div>
                <div className="renglon renglon-total">
                  <span>Total</span>
                  <span className="puntos" aria-hidden="true" />
                  <span className="cifra total">$ 186.000</span>
                </div>
              </div>
              <p className="talon-pie">Válido 15 días · el tuyo sale de lo que se ve en cámara.</p>
            </aside>
          </div>
        </section>

        <div className="trazo" aria-hidden="true" />

        <section className="bloque" aria-labelledby="pasos-titulo">
          <div className="ancho">
            <h2 id="pasos-titulo">Qué pasa en la llamada</h2>
            <ol className="pasos">
              {pasos.map((paso) => (
                <li key={paso.n}>
                  <span className="indice">{paso.n}</span>
                  <div>
                    <h3>{paso.titulo}</h3>
                    <p>{paso.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bloque" aria-labelledby="oficios-titulo">
          <div className="ancho">
            <h2 id="oficios-titulo">Qué se puede cotizar</h2>
            <div className="oficios">
              {oficios.map((oficio) => (
                <div key={oficio.titulo} className="oficio">
                  <h3>{oficio.titulo}</h3>
                  <p>{oficio.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bloque" aria-labelledby="atiende-titulo">
          <div className="ancho">
            <h2 id="atiende-titulo">Quién te atiende</h2>
            <ul className="asesores">
              {llamadasArmadas.map((asesor) => (
                <li key={asesor.id}>
                  <img
                    className="asesor-foto"
                    src={asesor.foto}
                    alt={`${asesor.nombre}, asesor de ${asesor.rubro.toLowerCase()}`}
                    width={512}
                    height={512}
                    loading="lazy"
                  />
                  <h3>{asesor.nombre}</h3>
                  <p className="rubro">
                    {asesor.rubro} · {asesor.zona}
                  </p>
                  <p>{asesor.especialidad}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bloque" aria-labelledby="dudas-titulo">
          <div className="ancho dudas">
            <div>
              <h2 id="dudas-titulo">Antes de llamar</h2>
              <p className="bajada">
                <Link to="/v1/faq">Todas las preguntas</Link>
              </p>
            </div>
            <div className="dudas-lista">
              {dudas.map((duda) => (
                <div key={duda.q}>
                  <h3>{duda.q}</h3>
                  <p>{duda.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="pie">
        <div className="ancho pie-grid">
          <p>© 2026 VideoCotización</p>
          <nav aria-label="Pie">
            {nav.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
            <Link to="/v1">Portada anterior</Link>
          </nav>
        </div>
      </footer>

      <PruebaEquipo
        abierto={enPrueba}
        onCerrar={() => setEnPrueba(false)}
        onListo={() => {
          setEnPrueba(false);
          iniciar();
        }}
      />
      <ElegirAsesor
        abierto={eligiendo}
        onCerrar={() => setEligiendo(false)}
        onConectar={(id) => {
          setEnlace(id);
          setEligiendo(false);
          setEnLlamada(true);
        }}
      />
      <VideoCotizacion
        abierto={enLlamada}
        onCerrar={() => setEnLlamada(false)}
        idPublico={enlace}
      />
    </div>
  );
}
