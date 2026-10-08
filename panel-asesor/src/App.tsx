import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Alerta, Boton, Cargando } from './componentes/basicos';
import { Layout } from './componentes/Layout';
import { ProveedorCatalogo, useMensajeDeError } from './contexto/catalogo';
import { ProveedorReautenticacion } from './contexto/reautenticacion';
import { ProveedorSesion, useSesion, type PropiedadesProveedorSesion } from './contexto/sesion';
import { Ingresar } from './pantallas/Ingresar';
import { Perfil } from './pantallas/perfil/Perfil';
import { SeccionesPerfil } from './pantallas/perfil/SeccionesPerfil';
import { MiCuenta } from './pantallas/perfil/MiCuenta';
import { EnlaceYClaves } from './pantallas/perfil/EnlaceYClaves';
import { MisCotizaciones } from './pantallas/cotizaciones/MisCotizaciones';
import { DetalleCotizacion } from './pantallas/cotizaciones/DetalleCotizacion';
import { Registros } from './pantallas/Registros';
import { NoEncontrada } from './pantallas/NoEncontrada';


function RutaProtegida() {
  const { estado, reintentarInicio } = useSesion();
  const ubicacion = useLocation();
  const mensaje = useMensajeDeError();

  if (estado.tipo === 'cargando') {
    return (
      <main className="ingreso" id="contenido">
        <Cargando texto="Cargando el panel…" />
      </main>
    );
  }
  if (estado.tipo === 'error_inicial') {
    return (
      <main className="ingreso" id="contenido">
        <div className="ingreso__tarjeta">
          <Alerta tipo="error">{mensaje(estado.error)}</Alerta>
          <Boton variante="primario" onClick={reintentarInicio}>
            Reintentar
          </Boton>
        </div>
      </main>
    );
  }
  if (estado.tipo !== 'autenticada') {
    return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  }
  return (
    <ProveedorReautenticacion>
      <Layout />
    </ProveedorReautenticacion>
  );
}

export function Rutas() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route element={<RutaProtegida />}>
        <Route index element={<Navigate to="/cotizaciones" replace />} />
        <Route path="perfil" element={<SeccionesPerfil />}>
          <Route index element={<Perfil />} />
          <Route path="cuenta" element={<MiCuenta />} />
          <Route path="widget" element={<EnlaceYClaves />} />
        </Route>
        <Route path="cotizaciones" element={<MisCotizaciones />} />
        <Route path="cotizaciones/:sesionId" element={<DetalleCotizacion />} />
        <Route path="registros" element={<Registros />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}

interface PropiedadesApp extends Omit<PropiedadesProveedorSesion, 'children'> {
  /** Solo pruebas: arranca con un router en memoria en esta ruta. */
  rutaInicial?: string;
}

export function App({ rutaInicial, ...sesion }: PropiedadesApp) {
  const contenido = (
    <ProveedorSesion {...sesion}>
      <ProveedorCatalogo>
        <Rutas />
      </ProveedorCatalogo>
    </ProveedorSesion>
  );
  return rutaInicial !== undefined ? (
    <MemoryRouter initialEntries={[rutaInicial]}>{contenido}</MemoryRouter>
  ) : (
    <BrowserRouter>{contenido}</BrowserRouter>
  );
}
