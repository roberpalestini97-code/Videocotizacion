/**
 * Tipos del flujo de VideoCotización. Los de HTTP salen del OpenAPI generado
 * (src/lib/api-contrato/generado/openapi.d.ts); los de eventos del WebSocket
 * se escriben a mano según proyecto/contracts/eventos-sesion.md (borrador
 * `vc-eventos.borrador.1`, NO congelado) y schemas/eventos/*.
 */
import type { components } from "@/lib/api-contrato";

type S = components["schemas"];

export type EnlacePublico = S["EnlacePublico.schema"];
export type AvatarContrato = S["Avatar.schema"];
export type AvisoPrivacidad = S["AvisoPrivacidad.schema"];
export type DesafioEmitido = S["DesafioEmitido.schema"];
export type CrearSesionSolicitud = S["CrearSesionSolicitud.schema"];
export type SesionCreada = S["SesionCreada.schema"];
export type ConsentimientoSolicitud = S["ConsentimientoSolicitud.schema"];
export type ConsentimientoRegistrado = S["ConsentimientoRegistrado.schema"];
export type TokenMedios = S["TokenMedios.schema"];
export type LimitesSesion = S["LimitesSesion.schema"];
export type ReglaFotograma = S["ReglaFotograma.schema"];
export type CierreSolicitud = S["CierreSolicitud.schema"];
export type CierreSesion = S["CierreSesion.schema"];
export type Cotizacion = S["Cotizacion.schema"];
export type ItemCotizacion = S["ItemCotizacion.schema"];
export type DerivacionWhatsApp = S["DerivacionWhatsApp.schema"];
export type CatalogoTextos = S["CatalogoTextos.schema"];
export type ProblemaError = S["Error.schema"];
export type CodigoError = S["CodigoError.schema"];
export type MotivoCierre = S["MotivoCierre.schema"];
export type ModoAvatar = S["ModoAvatar.schema"];

export type Visema =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

export type ItemVisema = { v: Visema; t_ms: number; d_ms: number };

export type CampoPizarron = {
  clave: string;
  etiqueta: string;
  valor: string;
  estado: "anotado" | "corregido_por_cliente" | "faltante";
};

export type AvisoSesion = "sin_voz_proximo" | "duracion_proxima" | "cuota_proxima";

type Sobre<T extends string, D> = { v: 1; tipo: T; seq: number; ts: string; datos: D };

export type EventoServidor =
  | Sobre<
      "sesion.lista",
      { sesion_id: string; limites: LimitesSesion; stt?: "navegador" | "servidor" }
    >
  | Sobre<"transcripcion.parcial", { turno: number; texto: string }>
  | Sobre<"transcripcion.final", { turno: number; texto: string }>
  | Sobre<"avatar.respuesta", { turno: number; texto: string; clip_id?: string }>
  | Sobre<"avatar.visemas", { turno: number; items: ItemVisema[] }>
  | Sobre<"pizarron.actualizado", { version: number; campos: CampoPizarron[] }>
  | Sobre<
      "camara.fotograma",
      {
        seq_fotograma: number;
        resultado: "aceptado" | "descartado";
        motivo?: "frecuencia" | "tamano" | "dimensiones" | "formato" | "tope_sesion";
      }
    >
  | Sobre<"sesion.aviso", { aviso: AvisoSesion; segundos_restantes: number }>
  | Sobre<"cotizacion.emitida", { cotizacion: Cotizacion; derivacion: DerivacionWhatsApp }>
  | Sobre<"sesion.cerrada", { motivo_cierre: MotivoCierre; duracion_s: number }>
  | Sobre<"error", { codigo: string; mensaje: string }>;

export type TipoEventoServidor = EventoServidor["tipo"];
