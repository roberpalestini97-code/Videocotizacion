import { NavLink, Outlet } from 'react-router-dom';

export function SeccionesPerfil() {
  return (
    <>
      <nav aria-label="Secciones del perfil" className="subnav">
        <NavLink to="/perfil" end>
          Mis datos
        </NavLink>
        <NavLink to="/perfil/cuenta">Mi cuenta</NavLink>
        <NavLink to="/perfil/widget">Enlace y claves</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
