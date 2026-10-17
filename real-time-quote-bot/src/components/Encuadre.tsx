import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ElegirAsesor } from "@/components/ElegirAsesor";
import { PruebaEquipo } from "@/components/PruebaEquipo";
import { VideoCotizacion } from "@/components/VideoCotizacion";
import { llamadasArmadas } from "@/data/llamadas";

const marcas = [
  { n: "1", texto: "Cuánto muro se ve" },
  { n: "2", texto: "En qué estado está" },
  { n: "3", texto: "Cuántas manos lleva" },
];

const pasos = [
  {
    n: "1",
    titulo: "Llamás",
    texto: "Elegís quién atiende. El navegador pide cámara y micrófono.",
  },
  {
    n: "2",
    titulo: "Encuadrás",
    texto: "Mostrás la pared, la pérdida o el jardín. Te dicen qué tiene que entrar.",
  },
  {
    n: "3",
    titulo: "Escuchás el número",
    texto: "Total, detalle y plazo, antes de cortar. Si seguís, coordinan la visita.",
  },
];

const dudas = [
  {
    q: "¿Cuánto dura?",
    a: "Entre 5 y 10 minutos. Se mira lo justo para medir el trabajo.",
  },
  {
    q: "¿Hay que instalar algo?",
    a: "No. Cámara y micrófono del navegador, con el permiso que das vos.",
  },
  {
    q: "¿El número es definitivo?",
    a: "Es firme sobre lo que se vio. Si en la visita aparece algo que no estaba en cámara, se ajusta con tu confirmación.",
  },
];

const nav = [
  { to: "/v1/como-funciona" as const, label: "Cómo funciona" },
  { to: "/v1/faq" as const, label: "Preguntas" },
  { to: "/v1/contacto" as const, label: "Contacto" },
  { to: "/v1/legales" as const, label: "Legales" },
];

/** Portada /v2: la cinta marca el encuadre. El número sale en la llamada. */
export function Encuadre() {
  const [enLlamada, setEnLlamada] = useState(false);
  const [enPrueba, setEnPrueba] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [enlace, setEnlace] = useState<string | undefined>();

  function iniciar() {
    setEligiendo(true);
  }

  return (
    <div className="encuadre">
      <div className="barra-fondo">
        <div className="ancho barra">
          <Link to="/v2" className="marca">
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
        <section className="marco" aria-label="Encuadre de la llamada">
          <span className="cinta cinta-no" aria-hidden="true" />
          <span className="cinta cinta-ne" aria-hidden="true" />
          <span className="cinta cinta-so" aria-hidden="true" />
          <span className="cinta cinta-se" aria-hidden="true" />

          <p className="leyenda">Lo que tiene que entrar en cámara</p>
          <h1>Encuadrá el trabajo. El número sale antes de cortar.</h1>
          <p className="bajada">
            Apuntá a la pared, la pérdida o el jardín. Quien atiende marca lo que ve y te dice el
            presupuesto en la misma llamada.
          </p>

          <ol className="marcas">
            {marcas.map((marca) => (
              <li key={marca.n}>
                <span className="indice">{marca.n}</span>
                {marca.texto}
              </li>
            ))}
          </ol>

          <div className="acciones">
            <button type="button" className="llamar" onClick={iniciar}>
              Iniciar llamada
            </button>
            <button type="button" className="probar" onClick={() => setEnPrueba(true)}>
              Probar cámara y micrófono
            </button>
          </div>
          <p className="nota">Cámara y micrófono del navegador. No hay que instalar nada.</p>
        </section>

        <section className="bloque" aria-labelledby="pasos-titulo">
          <div className="ancho">
            <h2 id="pasos-titulo">Qué pasa en la llamada</h2>
            <ol className="pasos">
              {pasos.map((paso) => (
                <li key={paso.n}>
                  <span className="indice">{paso.n}</span>
                  <h3>{paso.titulo}</h3>
                  <p>{paso.texto}</p>
                </li>
              ))}
            </ol>
            <p className="oficios">
              Se cotiza mano de obra de reparaciones, mantenimiento, pintura, jardinería y limpieza.
            </p>
          </div>
        </section>

        <section className="bloque" aria-labelledby="atiende-titulo">
          <div className="ancho">
            <h2 id="atiende-titulo">Quién mira</h2>
            <ul className="asesores">
              {llamadasArmadas.map((asesor) => (
                <li key={asesor.id}>
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
              <p className="enlace">
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
            <Link to="/">Portada</Link>
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
