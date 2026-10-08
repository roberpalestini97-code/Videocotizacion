import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Alerta, Boton } from '../componentes/basicos';
import { useCatalogo, useMensajeDeError } from '../contexto/catalogo';
import { useAsesor, useSesion } from '../contexto/sesion';
import { formatearHora } from '../util/formato';

export function Layout() {
  const asesor = useAsesor();
  const { salir, avisoVencimiento } = useSesion();
  const { t } = useCatalogo();
  const mensaje = useMensajeDeError();
  const [errorSalida, setErrorSalida] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  const alSalir = async () => {
    if (saliendo) return;
    setSaliendo(true);
    setErrorSalida(null);
    try {
      await salir();
    } catch (e) {
      setSaliendo(false);
      setErrorSalida(mensaje(e));
    }
  };

  return (
    <div className="app">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <p className="marca">
          VideoCotización <span>Panel del asesor</span>
        </p>
        <nav aria-label="Principal" className="menu">
          <NavLink to="/perfil">{t('panel.menu.perfil', 'Perfil')}</NavLink>
          <NavLink to="/cotizaciones">{t('panel.menu.mis_cotizaciones', 'Mis cotizaciones')}</NavLink>
          <NavLink to="/registros">{t('panel.menu.registros', 'Registros')}</NavLink>
        </nav>
        <div className="usuario">
          <span className="usuario__nombre" title="Sesión iniciada como">
            {asesor.nombre_visible}
          </span>
          <Boton variante="secundario" ocupado={saliendo} onClick={() => void alSalir()}>
            Salir
          </Boton>
        </div>
      </header>
      {avisoVencimiento ? (
        <div className="banda">
          <Alerta tipo="aviso">
            Tu sesión se cierra a las {formatearHora(avisoVencimiento)}. Terminá lo que estés haciendo: después vas a
            tener que ingresar de nuevo.
          </Alerta>
        </div>
      ) : null}
      {errorSalida ? (
        <div className="banda">
          <Alerta tipo="error" enfocar>
            {errorSalida}
          </Alerta>
        </div>
      ) : null}
      <main id="contenido" tabIndex={-1} className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
