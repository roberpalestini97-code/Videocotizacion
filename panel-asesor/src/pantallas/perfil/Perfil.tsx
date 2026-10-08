import { useRef, useState, type FormEvent } from 'react';
import { Alerta, Boton, Cargando, CampoTexto, ErrorDeCarga, GrupoCasillas, TituloPagina } from '../../componentes/basicos';
import { esErrorApi, comoErrorApi } from '../../api/errores';
import type { Oficio, PerfilActualizacion, PerfilAsesor, ZonaAtendida } from '../../api/tipos';
import { useCatalogo, useMensajeDeError } from '../../contexto/catalogo';
import { useCliente } from '../../contexto/sesion';
import { formatearFechaHora } from '../../util/formato';
import { useCarga } from '../../util/useCarga';

const OFICIOS: readonly Oficio[] = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
const ZONAS: readonly ZonaAtendida[] = ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago'];

const PATRON_TELEFONO = /^\+[1-9][0-9]{7,14}$/;
// Espejo de contracts/schemas: sin '<', '>' ni caracteres de control. El backend valida igual (R04).
// eslint-disable-next-line no-control-regex
const PATRON_NOMBRE = /^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F]*$/;

export function normalizarTelefono(valor: string): string {
  return valor.replace(/[\s()-]/g, '');
}

export function Perfil() {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const carga = useCarga('perfil', (signal) => cliente.leerPerfil(signal));

  return (
    <>
      <TituloPagina>Perfil</TituloPagina>
      {carga.estado === 'cargando' ? <Cargando texto="Cargando tu perfil…" /> : null}
      {carga.estado === 'error' ? (
        <ErrorDeCarga mensaje={mensaje(carga.error)} idTraza={carga.error.idTraza} alReintentar={carga.recargar} />
      ) : null}
      {carga.estado === 'ok' ? <FormularioPerfil inicial={carga.datos} /> : null}
    </>
  );
}

type ErroresPerfil = Partial<Record<'nombre_visible' | 'whatsapp' | 'oficios' | 'zonas', string>>;

function FormularioPerfil({ inicial }: { inicial: PerfilAsesor }) {
  const cliente = useCliente();
  const { oficio, zona } = useCatalogo();
  const mensaje = useMensajeDeError();
  const [guardado, setGuardado] = useState<PerfilAsesor>(inicial);
  const [nombre, setNombre] = useState(inicial.nombre_visible);
  const [whatsapp, setWhatsapp] = useState(inicial.whatsapp);
  const [oficios, setOficios] = useState<Oficio[]>(inicial.oficios);
  const [zonas, setZonas] = useState<ZonaAtendida[]>(inicial.zonas);
  const [errores, setErrores] = useState<ErroresPerfil>({});
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string; n: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const refWhatsapp = useRef<HTMLInputElement>(null);
  const refForm = useRef<HTMLFormElement>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const nuevos: ErroresPerfil = {};
    const nombreLimpio = nombre.trim();
    const telefono = normalizarTelefono(whatsapp);
    if (nombreLimpio.length < 1 || nombreLimpio.length > 60 || !PATRON_NOMBRE.test(nombreLimpio)) {
      nuevos.nombre_visible = 'El nombre tiene entre 1 y 60 caracteres y no puede llevar < ni >.';
    }
    if (!PATRON_TELEFONO.test(telefono)) {
      nuevos.whatsapp = 'Ingresá el número con código de país, por ejemplo +5492231234567.';
    }
    if (oficios.length < 1) nuevos.oficios = 'Elegí al menos un oficio.';
    if (zonas.length < 1) nuevos.zonas = 'Elegí al menos una zona.';
    setErrores(nuevos);
    setResultado(null);
    if (nuevos.nombre_visible) return void refNombre.current?.focus();
    if (nuevos.whatsapp) return void refWhatsapp.current?.focus();
    if (nuevos.oficios ?? nuevos.zonas) {
      // Los fieldset recién marcados con aria-invalid se pintan en el próximo render: se enfoca después.
      setTimeout(() => refForm.current?.querySelector<HTMLElement>('fieldset[aria-invalid="true"] input')?.focus(), 0);
      return;
    }

    const cambios: PerfilActualizacion = {};
    if (nombreLimpio !== guardado.nombre_visible) cambios.nombre_visible = nombreLimpio;
    if (telefono !== guardado.whatsapp) cambios.whatsapp = telefono;
    if (!mismoConjunto(oficios, guardado.oficios)) cambios.oficios = oficios;
    if (!mismoConjunto(zonas, guardado.zonas)) cambios.zonas = zonas;
    if (Object.keys(cambios).length === 0) {
      setResultado({ tipo: 'info', texto: 'No hay cambios para guardar.', n: (resultado?.n ?? 0) + 1 });
      return;
    }

    setEnviando(true);
    try {
      const nuevo = await cliente.actualizarPerfil(cambios);
      setGuardado(nuevo);
      setNombre(nuevo.nombre_visible);
      setWhatsapp(nuevo.whatsapp);
      setOficios(nuevo.oficios);
      setZonas(nuevo.zonas);
      setResultado({ tipo: 'exito', texto: 'Guardamos tus datos.', n: (resultado?.n ?? 0) + 1 });
    } catch (err) {
      const error = comoErrorApi(err);
      if (esErrorApi(error, 'validacion_fallida')) {
        const porCampo: ErroresPerfil = {};
        for (const c of error.campos) {
          const clave = c.campo.replace(/^\//, '').split('/')[0] as keyof ErroresPerfil;
          if (clave in { nombre_visible: 1, whatsapp: 1, oficios: 1, zonas: 1 }) porCampo[clave] = c.problema;
        }
        setErrores(porCampo);
      }
      setResultado({ tipo: 'error', texto: mensaje(error), n: (resultado?.n ?? 0) + 1 });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <form ref={refForm} onSubmit={(e) => void enviar(e)} noValidate className="tarjeta" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos">Mis datos</h2>
        {resultado ? (
          <Alerta key={resultado.n} tipo={resultado.tipo} enfocar={resultado.tipo === 'error'}>
            {resultado.texto}
          </Alerta>
        ) : null}
        <CampoTexto
          ref={refNombre}
          etiqueta="Nombre visible"
          ayuda="Es el nombre que ve tu cliente."
          maxLength={60}
          autoComplete="name"
          value={nombre}
          error={errores.nombre_visible}
          onChange={(e) => {
            setNombre(e.target.value);
          }}
        />
        <CampoTexto
          ref={refWhatsapp}
          etiqueta="WhatsApp"
          ayuda="Con código de país y sin espacios. Ejemplo: +5492231234567."
          type="tel"
          autoComplete="tel"
          value={whatsapp}
          error={errores.whatsapp}
          onChange={(e) => {
            setWhatsapp(e.target.value);
          }}
        />
        <GrupoCasillas
          leyenda="Oficios"
          opciones={OFICIOS.map((o) => ({ valor: o, etiqueta: oficio(o) }))}
          seleccion={oficios}
          error={errores.oficios}
          alCambiar={setOficios}
        />
        <GrupoCasillas
          leyenda="Zonas donde trabajás"
          opciones={ZONAS.map((z) => ({ valor: z, etiqueta: zona(z) }))}
          seleccion={zonas}
          error={errores.zonas}
          alCambiar={setZonas}
        />
        <div className="acciones">
          <Boton type="submit" variante="primario" ocupado={enviando}>
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </div>
      </form>

      <section className="tarjeta" aria-labelledby="titulo-cuenta">
        <h2 id="titulo-cuenta">Datos de la cuenta</h2>
        <dl className="datos">
          <div>
            <dt>Correo</dt>
            <dd>{guardado.email}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>{guardado.rol === 'administrador' ? 'Administrador' : 'Asesor'}</dd>
          </div>
          <div>
            <dt>Verificación en dos pasos</dt>
            <dd>{guardado.totp_activo ? 'Activa' : 'Inactiva'}</dd>
          </div>
          <div>
            <dt>Aviso de privacidad aceptado</dt>
            <dd>
              Versión {guardado.consentimiento_asesor.version}, el {formatearFechaHora(guardado.consentimiento_asesor.aceptado_en)}
            </dd>
          </div>
          <div>
            <dt>Cuenta creada</dt>
            <dd>{formatearFechaHora(guardado.creado_en)}</dd>
          </div>
        </dl>
        <p className="texto-chico">Para cambiar tu correo escribinos: no se puede hacer desde acá.</p>
      </section>
    </>
  );
}

function mismoConjunto<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
