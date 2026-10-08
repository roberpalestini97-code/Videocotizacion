import { useEffect, useRef, useState } from 'react';
import { Alerta, Boton } from '../../componentes/basicos';
import { comoErrorApi, esAbortado, esErrorApi, type ErrorApi } from '../../api/errores';
import type { ContactoCliente } from '../../api/tipos';
import { useMensajeDeError } from '../../contexto/catalogo';
import { useCliente } from '../../contexto/sesion';
import { PREFERENCIA_CONTACTO } from '../../textos/panel';
import { enlaceWhatsApp, formatearFechaHora } from '../../util/formato';

const PATRON_TELEFONO = /^\+[1-9][0-9]{7,14}$/;
const PATRON_EMAIL_ENLACE = /^[^\s<>"'@]+@[^\s<>"'@]+$/;

type Estado =
  | { fase: 'oculto' }
  | { fase: 'cargando' }
  | { fase: 'error'; error: ErrorApi }
  | { fase: 'visible'; contacto: ContactoCliente };

/**
 * El contacto del cliente se lee SOLO cuando la persona lo pide: cada lectura queda registrada y tiene tope diario
 * (R68, R69). Vive en memoria mientras la pantalla está abierta; "Ocultar" y salir de la pantalla lo descartan.
 */
export function ContactoDelCliente({ sesionId, contactoDisponible }: { sesionId: string; contactoDisponible: boolean | undefined }) {
  const cliente = useCliente();
  const mensaje = useMensajeDeError();
  const [estado, setEstado] = useState<Estado>({ fase: 'oculto' });
  const control = useRef<AbortController | null>(null);
  const bloque = useRef<HTMLDivElement>(null);
  const botonMostrar = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      control.current?.abort();
    },
    [],
  );
  const visible = estado.fase === 'visible';
  useEffect(() => {
    if (visible) bloque.current?.focus();
  }, [visible]);

  const leer = () => {
    if (estado.fase === 'cargando') return;
    control.current?.abort();
    const ac = new AbortController();
    control.current = ac;
    setEstado({ fase: 'cargando' });
    cliente.leerContactoCliente(sesionId, ac.signal).then(
      (contacto) => {
        if (!ac.signal.aborted) setEstado({ fase: 'visible', contacto });
      },
      (e: unknown) => {
        if (!ac.signal.aborted && !esAbortado(e)) setEstado({ fase: 'error', error: comoErrorApi(e) });
      },
    );
  };

  if (contactoDisponible === false) {
    return <p>El cliente no dejó datos de contacto en esta consulta.</p>;
  }

  return (
    <>
      <p>
        Los datos de contacto son personales: cada vez que los abrís queda un registro a tu nombre y hay un tope diario de
        lecturas.
      </p>
      {estado.fase === 'error' ? (
        <Alerta tipo="error" enfocar>
          <p>{mensaje(estado.error)}</p>
          {esErrorApi(estado.error, 'no_encontrado') ? <p>Puede ser que el cliente no haya dejado sus datos de contacto.</p> : null}
        </Alerta>
      ) : null}
      {estado.fase === 'visible' ? (
        <div ref={bloque} tabIndex={-1} className="contacto" aria-label="Datos de contacto del cliente">
          <dl className="datos">
            <div>
              <dt>Nombre</dt>
              <dd>{estado.contacto.nombre}</dd>
            </div>
            {estado.contacto.telefono ? (
              <div>
                <dt>Teléfono</dt>
                <dd>
                  {estado.contacto.telefono}
                  {PATRON_TELEFONO.test(estado.contacto.telefono) ? (
                    <>
                      {' · '}
                      <a href={`tel:${estado.contacto.telefono}`}>Llamar</a>
                      {' · '}
                      <a href={enlaceWhatsApp(estado.contacto.telefono)} target="_blank" rel="noopener noreferrer">
                        Escribir por WhatsApp<span className="solo-lectores"> (se abre en otra pestaña)</span>
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {estado.contacto.email ? (
              <div>
                <dt>Correo</dt>
                <dd>
                  {PATRON_EMAIL_ENLACE.test(estado.contacto.email) ? (
                    <a href={`mailto:${encodeURI(estado.contacto.email)}`}>{estado.contacto.email}</a>
                  ) : (
                    estado.contacto.email
                  )}
                </dd>
              </div>
            ) : null}
            {estado.contacto.preferencia ? (
              <div>
                <dt>Prefiere que lo contacten por</dt>
                <dd>{PREFERENCIA_CONTACTO[estado.contacto.preferencia]}</dd>
              </div>
            ) : null}
            <div>
              <dt>Aceptó el aviso de privacidad</dt>
              <dd>
                Versión {estado.contacto.aviso_version}, el {formatearFechaHora(estado.contacto.consentido_en)}
              </dd>
            </div>
          </dl>
          <p className="texto-chico">
            Esta lectura quedó registrada. Hoy te quedan {estado.contacto.lectura.lecturas_restantes_hoy} lecturas de contactos.
          </p>
          <Boton
            onClick={() => {
              setEstado({ fase: 'oculto' });
              setTimeout(() => botonMostrar.current?.focus(), 0);
            }}
          >
            Ocultar los datos
          </Boton>
        </div>
      ) : (
        <Boton ref={botonMostrar} ocupado={estado.fase === 'cargando'} onClick={leer}>
          {estado.fase === 'cargando' ? 'Abriendo…' : 'Ver datos de contacto'}
        </Boton>
      )}
    </>
  );
}
