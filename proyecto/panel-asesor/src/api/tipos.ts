// Tipos del panel, tomados del OpenAPI generado (src/api/generado/openapi.d.ts). No se copian a mano:
// si el contrato cambia, `npm run contrato` regenera y `tsc` marca lo que dejó de coincidir.
import type { components } from './generado/openapi';

type E = components['schemas'];

export type CodigoError = E['CodigoError.schema'];
export type ProblemaApi = E['Error.schema'];
export type ErrorCampoApi = E['ErrorCampo.schema'];

export type Oficio = E['Oficio.schema'];
export type ZonaAtendida = E['ZonaAtendida.schema'];
export type Zona = E['Zona.schema'];
export type EstadoSesionApi = E['EstadoSesion.schema'];
export type MotivoCierre = E['MotivoCierre.schema'];
export type Moneda = E['Moneda.schema'];
export type UnidadMedida = E['UnidadMedida.schema'];

export type LoginSolicitud = E['LoginSolicitud.schema'];
export type LoginPaso = E['LoginPaso.schema'];
// El generador no entiende el `oneOf` de TotpSolicitud (queda `codigo: unknown`): se declara la unión a mano
// siguiendo contracts/schemas/TotpSolicitud.schema.json (exactamente uno de los dos).
export type TotpSolicitud = { codigo: string } | { codigo_recuperacion: string };
export type SesionPanel = E['SesionPanel.schema'];
export type ReautenticacionSolicitud = E['ReautenticacionSolicitud.schema'];
export type ReautenticacionOtorgada = E['ReautenticacionOtorgada.schema'];

export type PerfilAsesor = E['PerfilAsesor.schema'];
export type PerfilActualizacion = E['PerfilActualizacion.schema'];
export type CambioContrasenaSolicitud = E['CambioContrasenaSolicitud.schema'];

export type ResumenCotizacion = E['ResumenCotizacion.schema'];
export type ListadoCotizaciones = E['ListadoCotizaciones.schema'];
export type SesionDetalle = E['SesionDetalle.schema'];
export type DatosExtraidos = E['DatosExtraidos.schema'];
export type Cotizacion = E['Cotizacion.schema'];
export type ItemCotizacion = E['ItemCotizacion.schema'];
export type RespuestaModelo = E['RespuestaModelo.schema'];
export type ContactoCliente = E['ContactoCliente.schema'];

export type RegistroLectura = E['RegistroLectura.schema'];
export type ListadoRegistros = E['ListadoRegistros.schema'];
export type AccionRegistro = RegistroLectura['accion'];

export type Consumo = E['Consumo.schema'];
export type ConsumoDiario = E['ConsumoDiario.schema'];
export type EnlaceCompartir = E['EnlaceCompartir.schema'];
export type ClaveWidget = E['ClaveWidget.schema'];
export type ClaveWidgetSolicitud = E['ClaveWidgetSolicitud.schema'];
export type ClaveWidgetCreada = E['ClaveWidgetCreada.schema'];
export type ListadoClavesWidget = E['ListadoClavesWidget.schema'];
export type ExportacionMiCuenta = E['ExportacionMiCuenta.schema'];
export type CatalogoTextos = E['CatalogoTextos.schema'];

export type FiltrosCotizaciones = { oficio?: Oficio; desde?: string; hasta?: string };
