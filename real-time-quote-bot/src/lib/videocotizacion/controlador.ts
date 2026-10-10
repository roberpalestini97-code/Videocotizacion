/**
 * Controlador del flujo de VideoCotización. Orquesta cliente HTTP, cámara,
 * WebSocket de medios, voz, avatar, pizarrón y fotogramas. No toca React ni el
 * DOM (salvo lo que le entregan las dependencias), así que se prueba con falsos.
 */
import type { ClienteVC } from "./cliente";
import type { ConfigVC } from "./config";
import { validarConfig } from "./config";
import { ErrorVC, mensajeError, type ErrorParaUsuario } from "./errores";
import { ESTADO_INICIAL, transicion, type EstadoFlujo, type EventoFlujo } from "./maquina";
import type { SesionMedios, OpcionesMedios } from "./medios";
import { PIZARRON_VACIO, aplicarPizarron, type Pizarron } from "./pizarron";
import { limpiarTexto } from "./protocolo";
import type { AvatarPuerto } from "./avatar";
import type { Reconocedor, Voz } from "./voz";
import { textoParaEnviar } from "./voz";
import { REGLA_POR_DEFECTO } from "./fotogramas";
import type {
  AvisoPrivacidad,
  AvisoSesion,
  CatalogoTextos,
  Cotizacion,
  DerivacionWhatsApp,
  EnlacePublico,
  EventoServidor,
  LimitesSesion,
  ModoAvatar,
  MotivoCierre,
  ReglaFotograma,
  SesionCreada,
} from "./tipos";

export type Mensaje = { id: number; de: "asesor" | "cliente"; texto: string };

export type ConsentimientoUI = {
  acepta_camara_y_microfono: boolean;
  acepta_tratamiento: boolean;
  declara_mayor_de_18: boolean;
  informado_asistente_automatico: boolean;
};

export type EstadoVC = {
  flujo: EstadoFlujo;
  enlace?: EnlacePublico;
  aviso?: AvisoPrivacidad;
  avatarId?: string;
  sesion?: SesionCreada;
  limites?: LimitesSesion;
  textos?: Record<string, string>;
  pizarron: Pizarron;
  mensajes: Mensaje[];
  /** Lo que el cliente va diciendo (parcial), todavía sin enviar. */
  parcial: string;
  asesorHablando: boolean;
  cotizacion?: Cotizacion;
  derivacion?: DerivacionWhatsApp;
  error?: ErrorParaUsuario | undefined;
  /** Aviso no bloqueante durante la llamada (error recuperable del servidor). */
  avisoError?: string | undefined;
  avisoSesion?: { aviso: AvisoSesion; segundosRestantes: number } | undefined;
  reconexion?: { intento: number; proximoEnMs?: number };
  segundos: number;
  reconocimientoDisponible: boolean;
  escuchando: boolean;
  fotogramas: { enviados: number; aceptados: number; descartados: number };
};

export interface MuestreadorLike {
  iniciar(): void;
  detener(): void;
  readonly enviados: number;
}

export type Dependencias = {
  config: ConfigVC;
  cliente: Pick<
    ClienteVC,
    | "leerEnlace"
    | "leerAviso"
    | "leerTextos"
    | "crearSesion"
    | "registrarConsentimiento"
    | "emitirTokenMedios"
    | "cerrarSesion"
    | "leerCotizacion"
    | "leerDerivacion"
  >;
  /** Pide cámara + micrófono. Rechaza con DOMException (NotAllowedError, NotFoundError…). */
  pedirMedios: () => Promise<MediaStream>;
  crearMedios: (o: OpcionesMedios) => Pick<
    SesionMedios,
    "conectar" | "cerrar" | "enviarTexto" | "enviarTrama" | "corregirPizarron"
  >;
  crearMuestreador: (regla: ReglaFotograma, enviar: (t: Uint8Array) => boolean) => MuestreadorLike;
  voz: Voz;
  reconocedor: Reconocedor;
  avatar: AvatarPuerto;
  /** Inyectable para pruebas; por defecto setInterval/clearInterval. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
};

const ESTADO_NUEVO = (reconocimientoDisponible: boolean): EstadoVC => ({
  flujo: ESTADO_INICIAL,
  pizarron: PIZARRON_VACIO,
  mensajes: [],
  parcial: "",
  asesorHablando: false,
  segundos: 0,
  reconocimientoDisponible,
  escuchando: false,
  fotogramas: { enviados: 0, aceptados: 0, descartados: 0 },
});

/** Mensaje claro para cada motivo de cierre (el catálogo trae etiquetas cortas de panel). */
export function textoMotivoCierre(m: MotivoCierre | undefined): string {
  switch (m) {
    case "completada":
      return "La videocotización terminó.";
    case "cliente_cerro":
      return "Cortaste la llamada.";
    case "sin_voz":
      return "Cortamos la llamada porque hace un rato que no te escuchamos. Podés volver a empezar cuando quieras.";
    case "sin_camara":
      return "Cortamos la llamada porque dejamos de ver tu cámara. La cámara es obligatoria para cotizar.";
    case "sin_consentimiento":
      return "No aceptaste el aviso de privacidad, así que no iniciamos la llamada. No se abrió ni la cámara ni el micrófono.";
    case "duracion_maxima":
      return "Se alcanzó la duración máxima de la llamada.";
    case "cuota_agotada":
      return "Por ahora no hay cupo para videocotizaciones. Escribile directamente a tu profesional por WhatsApp.";
    case "desafio_invalido":
      return "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.";
    case "error_proveedor":
      return "Un servicio que usamos dejó de responder y tuvimos que cortar la llamada. Intentá de nuevo en unos minutos.";
    case "error_interno":
      return "Tuvimos un problema y se cortó la llamada. Intentá de nuevo más tarde.";
    default:
      return "La videocotización terminó.";
  }
}

export class ControladorVC {
  private estado: EstadoVC;
  private oyentes = new Set<() => void>();
  private idPublico: string | undefined;
  private stream: MediaStream | null = null;
  private medios: ReturnType<Dependencias["crearMedios"]> | null = null;
  private muestreador: MuestreadorLike | null = null;
  private reloj: unknown = null;
  private generacion = 0;
  private idMensaje = 0;
  private yaFueLista = false;
  private cierreSolicitado = false;
  private ultimoTextoCliente = "";

  constructor(private readonly d: Dependencias) {
    this.estado = ESTADO_NUEVO(d.reconocedor.disponible());
  }

  // ---------- store ----------

  getState = (): EstadoVC => this.estado;

  suscribir = (fn: () => void): (() => void) => {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  };

  private set(p: Partial<EstadoVC>) {
    this.estado = { ...this.estado, ...p };
    for (const fn of this.oyentes) fn();
  }

  private ir(e: EventoFlujo) {
    const flujo = transicion(this.estado.flujo, e);
    if (flujo !== this.estado.flujo) this.set({ flujo });
  }

  private fallar(err: unknown) {
    const error = mensajeError(err, this.estado.textos);
    this.set({ error });
    this.ir({ t: "FALLO" });
  }

  private vigente(g: number) {
    return g === this.generacion;
  }

  // ---------- paso 1: enlace ----------

  async abrir(idPublico: string | undefined): Promise<void> {
    this.destruirMedios();
    const g = ++this.generacion;
    this.idPublico = idPublico;
    this.estado = ESTADO_NUEVO(this.d.reconocedor.disponible());
    this.cierreSolicitado = false;
    this.yaFueLista = false;
    this.set({});
    this.ir({ t: "ABRIR" });

    const cfgMal = validarConfig(this.d.config);
    if (cfgMal) return this.fallar(new ErrorVC("config_incompleta", { mensaje: cfgMal }));
    if (!idPublico) return this.fallar(new ErrorVC("enlace_ausente"));
    await this.cargarEnlace(g, idPublico);
  }

  private async cargarEnlace(g: number, idPublico: string) {
    try {
      const [enlace, textos] = await Promise.all([
        this.d.cliente.leerEnlace(idPublico),
        this.d.cliente.leerTextos().catch((): CatalogoTextos | null => null),
      ]);
      if (!this.vigente(g)) return;
      const primero = enlace.avatares[0];
      this.set({
        enlace,
        ...(textos ? { textos: textos.textos } : {}),
        ...(primero ? { avatarId: primero.avatar_id } : {}),
      });
      this.ir({ t: "ENLACE_OK" });
    } catch (e) {
      if (this.vigente(g)) this.fallar(e);
    }
  }

  elegirAvatar(avatarId: string) {
    if (this.estado.enlace?.avatares.some((a) => a.avatar_id === avatarId)) this.set({ avatarId });
  }

  // ---------- paso 2: desafío + sesión ----------

  async continuar(): Promise<void> {
    const { enlace, avatarId } = this.estado;
    if (this.estado.flujo.fase !== "enlace" || !enlace || !avatarId) return;
    const g = this.generacion;
    this.ir({ t: "CONTINUAR" });
    await this.crearSesion(g);
  }

  private async crearSesion(g: number) {
    const { enlace, avatarId } = this.estado;
    if (!enlace || !avatarId) return;
    const av = enlace.avatares.find((a) => a.avatar_id === avatarId);
    const modo: ModoAvatar = av?.modos.includes("3d") ? "3d" : "clips";
    try {
      const sesion = await this.d.cliente.crearSesion({
        enlace: enlace.id_publico,
        modo_avatar: modo,
        avatar_id: avatarId,
        idioma: "es-AR",
      });
      if (!this.vigente(g)) return;
      const aviso = await this.d.cliente.leerAviso();
      if (!this.vigente(g)) return;
      this.set({ sesion, aviso, limites: sesion.limites });
      this.ir({ t: "SESION_OK" });
    } catch (e) {
      if (this.vigente(g)) this.fallar(e);
    }
  }

  // ---------- paso 3: consentimiento (ANTES de cámara y micrófono) ----------

  async aceptarConsentimiento(c: ConsentimientoUI): Promise<void> {
    const { sesion, flujo } = this.estado;
    if (flujo.fase !== "consentimiento" || !sesion) return;
    if (!(c.acepta_camara_y_microfono && c.acepta_tratamiento && c.declara_mayor_de_18 && c.informado_asistente_automatico)) {
      return; // el contrato exige los cuatro en true
    }
    const g = this.generacion;
    try {
      await this.d.cliente.registrarConsentimiento(sesion.sesion_id, sesion.token_sesion.valor, {
        aviso_version: sesion.consentimiento.aviso_version,
        acepta_camara_y_microfono: true,
        acepta_tratamiento: true,
        declara_mayor_de_18: true,
        informado_asistente_automatico: true,
      });
    } catch (e) {
      if (this.vigente(g)) this.fallar(e);
      return;
    }
    if (!this.vigente(g)) return;
    this.ir({ t: "ACEPTA" });
    await this.pedirCamara(g);
  }

  /** Rechazó el aviso: se cierra con sin_consentimiento y no se toca cámara ni micrófono. */
  async rechazarConsentimiento(): Promise<void> {
    if (this.estado.flujo.fase !== "consentimiento") return;
    this.ir({ t: "RECHAZA" });
    await this.cerrarEnServidor("sin_consentimiento");
  }

  // ---------- paso 4: cámara ----------

  private async pedirCamara(g: number, yaConectando = false) {
    try {
      const stream = await this.d.pedirMedios();
      if (!this.vigente(g)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream.getVideoTracks().length === 0) throw new DOMException("sin video", "NotFoundError");
      this.stream = stream;
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          // Si la cámara se corta en plena llamada, no se sigue sin cámara.
          if (this.stream === stream && !this.cierreSolicitado && this.estado.flujo.fase !== "resultado") {
            void this.cortarPorCamara();
          }
        };
      });
      if (!yaConectando) this.ir({ t: "CAMARA_OK" });
      this.yaFueLista = false;
      this.conectarMedios(g);
    } catch (e) {
      if (!this.vigente(g)) return;
      const nombre = e instanceof DOMException || e instanceof Error ? e.name : "";
      if (nombre === "NotFoundError" || nombre === "OverconstrainedError" || nombre === "NotReadableError") {
        this.fallar(new ErrorVC("camara_no_disponible"));
        await this.cerrarEnServidor("sin_camara");
      } else {
        // NotAllowedError / SecurityError / cualquier otro rechazo: se explica y no se sigue.
        this.ir({ t: "CAMARA_DENEGADA" });
        this.set({ error: mensajeError(new ErrorVC("camara_denegada")) });
        await this.cerrarEnServidor("sin_camara");
      }
    }
  }

  private async cortarPorCamara() {
    this.set({ avisoError: "Se cortó la cámara. Sin cámara no podemos seguir." });
    this.medios?.cerrar();
    await this.finalizar("sin_camara");
  }

  get streamActual(): MediaStream | null {
    return this.stream;
  }

  // ---------- paso 5: WebSocket de medios ----------

  private conectarMedios(g: number) {
    const { sesion, limites } = this.estado;
    if (!sesion) return;
    const regla = limites?.fotograma ?? REGLA_POR_DEFECTO;
    const medios = this.d.crearMedios({
      obtenerToken: () => this.d.cliente.emitirTokenMedios(sesion.sesion_id, sesion.token_sesion.valor),
      onEvento: (e) => {
        if (this.vigente(g)) this.alEvento(e);
      },
      onEstado: (est, det) => {
        if (!this.vigente(g)) return;
        if (est === "lista") {
          const recuperada = this.yaFueLista;
          this.yaFueLista = true;
          this.set({ reconexion: { intento: 0 } });
          this.ir({ t: recuperada ? "MEDIOS_RECUPERADOS" : "MEDIOS_LISTOS" });
          this.arrancarEscucha();
          this.muestreador?.detener();
          this.muestreador = this.d.crearMuestreador(regla, (t) => medios.enviarTrama(t));
          this.muestreador.iniciar();
          this.arrancarReloj();
        } else if (est === "reconectando") {
          this.pararMuestreo();
          this.set({
            reconexion: { intento: det.intento, ...(det.proximoEnMs !== undefined ? { proximoEnMs: det.proximoEnMs } : {}) },
          });
          this.ir({ t: "MEDIOS_PERDIDOS" });
        } else if (est === "fallida") {
          void this.alFallarMedios(det.error);
        }
      },
    });
    this.medios = medios;
    medios.conectar();
  }

  private async alFallarMedios(err: ErrorVC | undefined) {
    this.destruirEscucha();
    this.pararMuestreo();
    this.pararReloj();
    this.liberarStream(); // no queda la cámara prendida detrás de un cartel de error
    this.fallar(err ?? new ErrorVC("ws_fallido"));
    // Si no se puede reintentar con la misma sesión, se libera el cupo en el servidor.
    if (!this.estado.error?.reintentable) await this.cerrarEnServidor("cliente_cerro");
  }

  private alEvento(e: EventoServidor) {
    switch (e.tipo) {
      case "sesion.lista":
        this.set({ limites: e.datos.limites });
        break;
      case "transcripcion.parcial":
        this.set({ parcial: e.datos.texto });
        break;
      case "transcripcion.final":
        // Si ya mostramos ese texto (lo mandamos nosotros), no se duplica.
        if (limpiarTexto(e.datos.texto) !== this.ultimoTextoCliente) this.agregarMensaje("cliente", e.datos.texto);
        this.set({ parcial: "" });
        break;
      case "avatar.respuesta":
        this.agregarMensaje("asesor", e.datos.texto);
        this.hablar(e.datos.turno, e.datos.texto, e.datos.clip_id);
        break;
      case "avatar.visemas":
        this.d.avatar.aplicarVisemas(e.datos.turno, e.datos.items);
        break;
      case "pizarron.actualizado":
        this.set({ pizarron: aplicarPizarron(this.estado.pizarron, e.datos.version, e.datos.campos) });
        break;
      case "camara.fotograma": {
        const f = this.estado.fotogramas;
        this.set({
          fotogramas: {
            enviados: this.muestreador?.enviados ?? f.enviados,
            aceptados: f.aceptados + (e.datos.resultado === "aceptado" ? 1 : 0),
            descartados: f.descartados + (e.datos.resultado === "descartado" ? 1 : 0),
          },
        });
        break;
      }
      case "sesion.aviso":
        this.set({ avisoSesion: { aviso: e.datos.aviso, segundosRestantes: e.datos.segundos_restantes } });
        break;
      case "cotizacion.emitida":
        // El precio aparece solo acá, al final.
        this.set({ cotizacion: e.datos.cotizacion, derivacion: e.datos.derivacion });
        this.ir({ t: "COTIZACION" });
        break;
      case "sesion.cerrada":
        void this.finalizar(e.datos.motivo_cierre);
        break;
      case "error":
        this.set({ avisoError: mensajeError(new ErrorVC(e.datos.codigo as never), this.estado.textos).mensaje });
        break;
    }
  }

  // ---------- voz ----------

  private agregarMensaje(de: Mensaje["de"], texto: string) {
    const t = limpiarTexto(texto);
    if (!t) return;
    this.set({ mensajes: [...this.estado.mensajes, { id: ++this.idMensaje, de, texto: t }].slice(-60) });
  }

  private hablar(turno: number, texto: string, clipId?: string) {
    this.d.reconocedor.pausar(true);
    this.d.avatar.hablar({ turno, texto, ...(clipId ? { clipId } : {}) });
    this.set({ asesorHablando: true });
    const terminar = () => {
      this.d.avatar.callar();
      this.d.reconocedor.pausar(false);
      this.set({ asesorHablando: false });
    };
    this.d.voz.hablar(texto, { onFin: terminar });
  }

  private arrancarEscucha() {
    if (!this.d.reconocedor.disponible() || this.estado.escuchando) return;
    this.d.reconocedor.iniciar({
      onParcial: (t) => this.set({ parcial: t }),
      onFinal: (t) => this.enviarTexto(t),
      onError: (codigo) => {
        if (codigo === "not-allowed" || codigo === "service-not-allowed" || codigo === "network") {
          this.set({
            escuchando: false,
            reconocimientoDisponible: false,
            avisoError:
              "No pudimos usar el reconocimiento de voz del navegador. Podés escribirle al asesor en el cuadro de texto.",
          });
        }
      },
    });
    this.set({ escuchando: true });
  }

  private destruirEscucha() {
    this.d.reconocedor.detener();
    this.set({ escuchando: false, parcial: "" });
  }

  /** Texto del cliente (voz reconocida o escrito): hasta 500 caracteres por mensaje. */
  enviarTexto(texto: string): boolean {
    const partes = textoParaEnviar(texto);
    if (partes.length === 0 || !this.medios) return false;
    let ok = false;
    for (const p of partes) {
      if (this.medios.enviarTexto(p)) {
        ok = true;
        this.ultimoTextoCliente = p;
        this.agregarMensaje("cliente", p);
      }
    }
    if (ok) {
      this.set({ parcial: "" });
      // Si el asesor está hablando y el cliente interrumpe, se calla.
      if (this.estado.asesorHablando) {
        this.d.voz.cancelar();
        this.d.avatar.callar();
        this.set({ asesorHablando: false });
      }
    }
    return ok;
  }

  corregirPizarron(clave: string, valor: string): boolean {
    const v = limpiarTexto(valor).slice(0, 200);
    if (!v || !this.medios) return false;
    return this.medios.corregirPizarron(this.estado.pizarron.version, clave, v);
  }

  // ---------- reloj / muestreo ----------

  private arrancarReloj() {
    if (this.reloj !== null) return;
    const si = this.d.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.reloj = si(() => {
      this.set({ segundos: this.estado.segundos + 1 });
    }, 1000);
  }

  private pararReloj() {
    if (this.reloj === null) return;
    (this.d.clearInterval ?? ((i) => clearInterval(i as ReturnType<typeof setInterval>)))(this.reloj);
    this.reloj = null;
  }

  private pararMuestreo() {
    this.muestreador?.detener();
    this.muestreador = null;
  }

  // ---------- cierre ----------

  /** El cliente corta ("Cortar"). */
  async cortar(): Promise<void> {
    if (this.cierreSolicitado) return;
    this.cierreSolicitado = true;
    const fase = this.estado.flujo.fase;
    if (fase === "llamada" || fase === "reconectando" || fase === "conectando") {
      this.ir({ t: "CLIENTE_CORTA" });
      this.medios?.cerrar();
      await this.finalizar("cliente_cerro");
    }
  }

  /** Cierra la ventana: libera todo; si había sesión abierta, la cierra en el servidor. */
  async cerrarVentana(): Promise<void> {
    const fase = this.estado.flujo.fase;
    const abierta =
      ["consentimiento", "camara", "conectando", "llamada", "reconectando"].includes(fase) && !this.cierreSolicitado;
    this.cierreSolicitado = true;
    this.medios?.cerrar();
    if (abierta) await this.cerrarEnServidor("cliente_cerro");
    this.generacion++;
    this.destruirMedios();
    this.ir({ t: "CERRAR" });
  }

  reintentar() {
    this.set({ error: undefined, avisoError: undefined });
    const g = this.generacion;
    this.ir({ t: "REINTENTAR" });
    switch (this.estado.flujo.fase) {
      case "cargando_enlace":
        if (this.idPublico) void this.cargarEnlace(g, this.idPublico);
        else this.fallar(new ErrorVC("enlace_ausente"));
        break;
      case "creando_sesion":
        void this.crearSesion(g);
        break;
      case "conectando":
        void this.reconectar(g);
        break;
      default:
        break;
    }
  }

  private async reconectar(g: number) {
    if (!this.estado.sesion) return this.fallar(new ErrorVC("ws_fallido"));
    await this.pedirCamara(g, true);
  }

  /** Vuelve a empezar desde el enlace (nueva sesión). */
  reiniciar() {
    this.destruirMedios();
    this.generacion++;
    const g = this.generacion;
    const id = this.idPublico;
    this.estado = { ...ESTADO_NUEVO(this.d.reconocedor.disponible()), textos: this.estado.textos ?? {} };
    this.cierreSolicitado = false;
    this.yaFueLista = false;
    this.set({ flujo: { fase: "cargando_enlace" } });
    if (id) void this.cargarEnlace(g, id);
    else this.fallar(new ErrorVC("enlace_ausente"));
  }

  /** Avisa el cierre al servidor (libera cupo). Un error acá no cambia nada para el cliente
   *  (409 sesion_cerrada / 401 sesion_vencida = ya estaba cerrada). */
  private async cerrarEnServidor(motivo: "cliente_cerro" | "sin_consentimiento" | "sin_camara") {
    const { sesion } = this.estado;
    if (!sesion) return;
    try {
      await this.d.cliente.cerrarSesion(sesion.sesion_id, sesion.token_sesion.valor, { motivo });
    } catch {
      /* ignorado a propósito */
    }
  }

  /** Fin de la llamada: libera cámara/mic/voz y recupera cotización y derivación si faltan. */
  private async finalizar(motivo: MotivoCierre) {
    const g = this.generacion;
    this.ir({ t: "SESION_CERRADA", motivo });
    this.pararReloj();
    this.pararMuestreo();
    this.destruirEscucha();
    this.d.voz.cancelar();
    this.d.avatar.callar();
    this.liberarStream();
    this.set({ asesorHablando: false });
    const { sesion } = this.estado;
    if (!sesion) return this.ir({ t: "FIN_CIERRE" });
    const tok = sesion.token_sesion.valor;
    if (motivo === "cliente_cerro" || motivo === "sin_camara") {
      await this.cerrarEnServidor(motivo === "sin_camara" ? "sin_camara" : "cliente_cerro");
    }
    if (!this.vigente(g)) return;
    if (!this.estado.cotizacion && motivo === "completada") {
      try {
        const cot = await this.d.cliente.leerCotizacion(sesion.sesion_id, tok);
        if (this.vigente(g)) {
          this.set({ cotizacion: cot });
          this.ir({ t: "COTIZACION" });
        }
      } catch {
        /* sin cotización: se muestra el cierre */
      }
    }
    if (!this.estado.derivacion) {
      try {
        const der = await this.d.cliente.leerDerivacion(sesion.sesion_id, tok);
        if (this.vigente(g)) this.set({ derivacion: der });
      } catch {
        /* la derivación puede no estar disponible según el motivo */
      }
    }
    if (this.vigente(g)) this.ir({ t: "FIN_CIERRE" });
  }

  // ---------- limpieza ----------

  private liberarStream() {
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
  }

  private destruirMedios() {
    this.pararReloj();
    this.pararMuestreo();
    this.d.reconocedor.detener();
    this.d.voz.cancelar();
    this.d.avatar.callar();
    this.medios?.cerrar();
    this.medios = null;
    this.liberarStream();
  }

  destruir() {
    this.generacion++;
    this.destruirMedios();
    this.oyentes.clear();
  }
}
