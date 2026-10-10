import { Link } from 'react-router-dom';
import { TituloPagina } from '../componentes/basicos';

export function NoEncontrada() {
  return (
    <>
      <TituloPagina>No encontramos esa página</TituloPagina>
      <p>
        La dirección que abriste no existe en el panel. <Link to="/cotizaciones">Volver a Mis cotizaciones</Link>.
      </p>
    </>
  );
}
