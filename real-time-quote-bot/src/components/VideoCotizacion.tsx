import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, SwitchCamera } from "lucide-react";
import martaImg from "@/assets/avatar-marta.jpg";
import diegoImg from "@/assets/avatar-diego.jpg";
import luciaImg from "@/assets/avatar-lucia.jpg";
import { Consentimiento } from "@/components/vc/Consentimiento";
import { MedidorMicrofono } from "@/components/vc/MedidorMicrofono";
import { PizarronVivo } from "@/components/vc/Pizarron";
import { CierreSinPresupuesto, Resultado } from "@/components/vc/Resultado";
import { leerConfig } from "@/lib/videocotizacion/config";
import type { ControladorVC } from "@/lib/videocotizacion/controlador";
import { crearControlador } from "@/lib/videocotizacion/crear";
import { etiquetaCatalogo, reloj } from "@/lib/videocotizacion/formato";
import type { AvatarPuerto } from "@/lib/videocotizacion/avatar";

const FOTOS = [diegoImg, martaImg, luciaImg];
/** Hasta que el avatar de la tarea 5 traiga sus imágenes: foto estable por avatar_id. */
function fotoDeAvatar(id: string, indice: number): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FOTOS[(indice >= 0 ? indice : h) % FOTOS.length] ?? diegoImg;
}

const ETIQUETA_OFICIO: Record<string, string> = {
  pintura: "Pintura",
  jardineria: "Jardinería",
  reparaciones: "Reparaciones",
  mantenimiento: "Mantenimiento",
  limpieza: "Limpieza",
};
const ETIQUETA_ZONA: Record<string, string> = {
  mar_chiquita: "Mar Chiquita",
  cobo: "Cobo",
  santa_clara: "Santa Clara del Mar",
  parque_lago: "Parque Lago",
  otra: "fuera de zona",
};

export function VideoCotizacion({
  abierto,
  onCerrar,
  idPublico,
  avatar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Enlace opaco del profesional (/c/<id_publico>). */
  idPublico?: string | undefined;
  /** Para enchufar un avatar de prueba; por defecto, 3D → clips → 2D. */
  avatar?: AvatarPuerto;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const ctlRef = useRef<ControladorVC | null>(null);
  const [ctl] = useState<ControladorVC>(() => {
    const c = crearControlador({
      obtenerVideo: () => videoRef.current,
      ...(avatar ? { avatar } : {}),
    });
    ctlRef.current = c;
    return c;
  });
  const s = useSyncExternalStore(ctl.suscribir, ctl.getState, ctl.getState);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fase = s.flujo.fase;

  // abrir / cerrar
  useEffect(() => {
    if (abierto) void ctl.abrir(idPublico || leerConfig().enlaceDemo);
    else void ctl.cerrarVentana();
  }, [abierto, idPublico, ctl]);
  useEffect(() => () => ctl.destruir(), [ctl]);

  // avatar (puerto) montado mientras dura la llamada
  const avatarElegido = s.enlace?.avatares.find((a) => a.avatar_id === s.avatarId);
  const enPantallaLlamada = fase === "llamada" || fase === "reconectando";
  useEffect(() => {
    const cont = avatarRef.current;
    if (!enPantallaLlamada || !cont || !avatarElegido) return;
    const puerto = ctl.avatarPuerto;
    const indice = s.enlace?.avatares.indexOf(avatarElegido) ?? 0;
    const modoPreferido = avatarElegido.modos.includes("3d")
      ? "3d"
      : avatarElegido.modos.includes("clips")
        ? "clips"
        : "placeholder-2d";
    puerto.montar(cont, {
      avatarId: avatarElegido.avatar_id,
      nombre: avatarElegido.nombre,
      foto: fotoDeAvatar(avatarElegido.avatar_id, indice),
      descripcion: avatarElegido.descripcion_accesible,
      modoPreferido,
    });
    return () => puerto.desmontar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPantallaLlamada, avatarElegido?.avatar_id]);

  // la cámara propia en el <video>
  useEffect(() => {
    if (!enPantallaLlamada) return;
    const v = videoRef.current;
    const stream = ctl.streamActual;
    if (!v || !stream) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => undefined);
  }, [enPantallaLlamada, fase, ctl, s.camara]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [s.mensajes.length, fase]);

  if (!abierto) return null;

  async function cerrar() {
    await ctl.cerrarVentana();
    onCerrar();
  }

  const cfg = leerConfig();
  const enLlamadaUI = fase === "llamada" || fase === "reconectando" || fase === "conectando";
  const enPantallaCompleta =
    fase === "llamada" || fase === "reconectando" || fase === "finalizando";
  const nombreAsesor = avatarElegido?.nombre ?? "tu asesor";

  return (
    <div
      className={
        enPantallaCompleta
          ? "fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
          : "fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      }
      role="dialog"
      aria-modal="true"
      aria-label="VideoCotización"
      data-fase={fase}
    >
      <div
        className={
          enPantallaCompleta
            ? "flex min-h-0 flex-1 flex-col"
            : fase === "consentimiento"
              ? "flex h-[min(92dvh,52rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-ink shadow-2xl ring-1 ring-white/15 sm:rounded-3xl"
              : "flex max-h-[min(92dvh,52rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-ink shadow-2xl ring-1 ring-white/15 sm:rounded-3xl"
        }
        data-testid={enPantallaCompleta ? "marco-llamada" : "marco-modal"}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2 text-white/90">
            <span className="size-1.5 rounded-full bg-online animate-blink" />
            <span
              data-testid="estado-cabecera"
              className="text-xs font-medium uppercase tracking-[0.18em]"
            >
              {fase === "cargando_enlace" && "Buscando a tu profesional"}
              {fase === "enlace" && "Antes de llamar"}
              {fase === "creando_sesion" && "Preparando"}
              {fase === "consentimiento" && "Tu privacidad"}
              {fase === "camara" && "Permisos"}
              {fase === "conectando" && "Conectando"}
              {fase === "llamada" &&
                `En vivo · ${reloj(s.segundos)}${s.asesorHablando ? " · Hablando" : ""}`}
              {fase === "reconectando" && "Reconectando"}
              {fase === "finalizando" && "Cerrando"}
              {fase === "resultado" && "Tu presupuesto"}
              {(fase === "cerrada" || fase === "error" || fase === "camara_denegada") &&
                "VideoCotización"}
            </span>
            {cfg.mock && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                Modo simulado
              </span>
            )}
          </div>
          <button
            onClick={() => void cerrar()}
            aria-label="Cerrar videollamada"
            data-testid="cerrar"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

      <div
        className={
          enPantallaCompleta
            ? "flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-6 pt-4"
            : fase === "consentimiento"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4"
              : "scrollbar-modal min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-6"
        }
      >
        {(fase === "cargando_enlace" ||
          fase === "creando_sesion" ||
          fase === "camara" ||
          fase === "conectando") && (
          <Espera
            titulo={
              fase === "cargando_enlace"
                ? "Buscando a tu profesional…"
                : fase === "creando_sesion"
                  ? "Verificando tu navegador…"
                  : fase === "camara"
                    ? "Habilitá cámara y micrófono"
                    : `Conectando con ${nombreAsesor}`
            }
            detalle={
              fase === "camara"
                ? "Tu navegador te va a pedir permiso. Necesitamos las dos cosas."
                : fase === "conectando" && s.reconexion && s.reconexion.intento > 0
                  ? `Reintentando la conexión (intento ${s.reconexion.intento})…`
                  : undefined
            }
            foto={
              avatarElegido
                ? fotoDeAvatar(
                    avatarElegido.avatar_id,
                    s.enlace?.avatares.indexOf(avatarElegido) ?? 0,
                  )
                : undefined
            }
          />
        )}

        {fase === "enlace" && s.enlace && (
          <div className="animate-rise" data-testid="pantalla-enlace">
            <h2 className="font-display text-2xl font-bold text-white">
              Cotizá con {s.enlace.profesional.nombre_visible}
            </h2>
            <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-white/70">
              {s.enlace.profesional.oficios
                .map((o) => etiquetaCatalogo(s.textos, `oficio.${o}`, ETIQUETA_OFICIO[o] ?? o))
                .join(", ")}
              {" · "}
              {s.enlace.profesional.zonas
                .map((z) => etiquetaCatalogo(s.textos, `zona.${z}`, ETIQUETA_ZONA[z] ?? z))
                .join(", ")}
            </p>
            <p className="mt-1 max-w-[320px] text-xs leading-relaxed text-white/55">
              Te atiende un asistente automático. Al iniciar, primero te pedimos el consentimiento y
              recién después el navegador te pide cámara y micrófono.
            </p>
            <div className="mt-5 space-y-2.5">
              {s.enlace.avatares.map((a, i) => (
                <button
                  key={a.avatar_id}
                  onClick={() => ctl.elegirAvatar(a.avatar_id)}
                  aria-pressed={a.avatar_id === s.avatarId}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors ${
                    a.avatar_id === s.avatarId
                      ? "bg-white/15 ring-accent"
                      : "bg-white/5 ring-white/15"
                  }`}
                >
                  <img
                    src={fotoDeAvatar(a.avatar_id, i)}
                    alt={a.descripcion_accesible}
                    loading="lazy"
                    width={816}
                    height={816}
                    className="size-14 shrink-0 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-sm font-semibold text-white">
                      {a.nombre}
                    </span>
                    <span className="block text-xs text-white/60">{a.descripcion_accesible}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => void ctl.continuar()}
              data-testid="conectar"
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark"
            >
              <span className="size-2.5 rounded-full bg-brand-dark animate-blink" />
              Iniciar VideoCotización
            </button>
            <p className="mt-2 text-center text-[11px] text-white/50">
              Requiere micrófono y cámara · podés cortar cuando quieras
            </p>
          </div>
        )}

        {fase === "consentimiento" && (
          <Consentimiento
            aviso={s.aviso}
            textos={s.textos}
            ocupado={ocupado}
            onAceptar={(c) => {
              setOcupado(true);
              void ctl.aceptarConsentimiento(c).finally(() => setOcupado(false));
            }}
            onRechazar={() => void ctl.rechazarConsentimiento()}
          />
        )}

        {fase === "camara_denegada" && (
          <div className="animate-rise" data-testid="camara-denegada">
            <h2 className="font-display text-2xl font-bold text-white">
              {s.error?.titulo ?? "Necesitamos tu cámara"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{s.error?.mensaje}</p>
            <p className="mt-3 rounded-2xl bg-white/5 p-3 text-xs leading-relaxed text-white/70 ring-1 ring-white/10">
              Para habilitarlas: tocá el candado o el ícono de cámara al lado de la dirección de la
              página, permití cámara y micrófono, y empezá de nuevo.
            </p>
            <button
              onClick={() => ctl.reiniciar()}
              className="mt-5 h-12 w-full rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
            >
              Empezar de nuevo
            </button>
            <button
              onClick={() => void cerrar()}
              className="mt-2 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white"
            >
              Cerrar
            </button>
          </div>
        )}

        {fase === "error" && s.error && (
          <div className="animate-rise" data-testid="pantalla-error" role="alert">
            <h2 className="font-display text-2xl font-bold text-white">{s.error.titulo}</h2>
            <p data-testid="error-mensaje" className="mt-2 text-sm leading-relaxed text-white/75">
              {s.error.mensaje}
            </p>
            {s.error.idTraza && (
              <p className="mt-2 text-[10px] text-white/40">Código de soporte: {s.error.idTraza}</p>
            )}
            {s.error.reintentable && (
              <button
                onClick={() => ctl.reintentar()}
                data-testid="reintentar"
                className="mt-5 h-12 w-full rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
              >
                Reintentar
              </button>
            )}
            {s.error.accion === "reiniciar" && (
              <button
                onClick={() => ctl.reiniciar()}
                data-testid="reiniciar"
                className="mt-5 h-12 w-full rounded-2xl bg-accent font-display text-sm font-semibold text-brand-dark"
              >
                Empezar de nuevo
              </button>
            )}
            <button
              onClick={() => void cerrar()}
              className="mt-2 h-11 w-full rounded-2xl border border-white/25 text-sm font-medium text-white"
            >
              Cerrar
            </button>
          </div>
        )}

        {fase === "finalizando" && <Espera titulo="Cerrando la llamada…" />}

        {fase === "resultado" && s.cotizacion && (
          <Resultado
            cotizacion={s.cotizacion}
            derivacion={s.derivacion}
            onCerrar={() => void cerrar()}
          />
        )}

        {fase === "cerrada" && (
          <CierreSinPresupuesto
            motivo={s.flujo.motivoCierre}
            derivacion={s.derivacion}
            onReiniciar={s.flujo.motivoCierre === "cuota_agotada" ? null : () => ctl.reiniciar()}
            onCerrar={() => void cerrar()}
          />
        )}

        {enLlamadaUI && fase !== "conectando" && (
          <>
            <div
              className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-ink ring-1 ring-white/15"
              data-testid="llamada"
            >
              {/* Layout tipo Zoom: asesor izquierda · cámara usuario derecha */}
              <div className="absolute inset-0 flex gap-1.5 p-1.5 landscape:gap-2 landscape:p-2">
                <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-[#121212]">
                  <div ref={avatarRef} className="absolute inset-0" data-testid="avatar" />
                  {/* Vignette suave; el degradé principal lo pinta Three.js */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1 backdrop-blur-sm">
                    <span className="size-1.5 rounded-full bg-online animate-blink" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                      {nombreAsesor}
                    </span>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-white drop-shadow">
                        {nombreAsesor}
                      </p>
                      <p className="truncate text-[10px] text-white/70">
                        Asistente automático · {s.enlace?.profesional.nombre_visible}
                      </p>
                    </div>
                    <span
                      className={`flex shrink-0 items-end gap-0.5 rounded-full bg-ink/55 px-2 py-1.5 ${
                        s.asesorHablando ? "opacity-100" : "opacity-50"
                      }`}
                    >
                      {[0, 0.15, 0.3].map((d) => (
                        <span
                          key={d}
                          className="h-3.5 w-0.5 origin-bottom rounded-full bg-accent animate-bar"
                          style={{
                            animationDelay: `${d}s`,
                            animationPlayState: s.asesorHablando ? "running" : "paused",
                          }}
                        />
                      ))}
                    </span>
                  </div>
                </div>

                <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-black">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    data-testid="mi-camara"
                    className={`absolute inset-0 size-full object-cover ${s.camara === "user" ? "-scale-x-100" : ""}`}
                  />
                  {s.puedeGirarCamara && (
                    <button
                      type="button"
                      onClick={() => void ctl.girarCamara()}
                      aria-label={s.camara === "user" ? "Usar cámara trasera" : "Usar cámara frontal"}
                      data-testid="girar-camara"
                      className="absolute bottom-2.5 right-2.5 flex size-10 items-center justify-center rounded-full bg-ink/65 text-white backdrop-blur-sm transition active:scale-95"
                    >
                      <SwitchCamera className="size-5" aria-hidden />
                    </button>
                  )}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1 backdrop-blur-sm">
                    <span className="size-1.5 rounded-full bg-online animate-blink" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                      Tu cámara
                    </span>
                  </div>
                </div>
              </div>

              <PizarronVivo pizarron={s.pizarron} />

              {fase === "reconectando" && (
                <div
                  role="status"
                  data-testid="reconectando"
                  className="absolute inset-x-3 top-3 z-20 rounded-2xl bg-destructive/85 p-2.5 text-center text-xs font-medium text-white backdrop-blur-md"
                >
                  Se cortó la conexión. Reintentando
                  {s.reconexion?.intento ? ` (intento ${s.reconexion.intento})` : ""}…
                </div>
              )}
              {s.avisoSesion && (
                <div
                  role="status"
                  className="absolute inset-x-3 top-3 z-20 rounded-2xl bg-accent p-2 text-center text-[11px] font-semibold text-brand-dark"
                >
                  {s.avisoSesion.aviso === "sin_voz_proximo" &&
                    `No te escuchamos. Si seguís en silencio, cortamos en ${s.avisoSesion.segundosRestantes} s.`}
                  {s.avisoSesion.aviso === "duracion_proxima" &&
                    `La llamada llega al máximo en ${s.avisoSesion.segundosRestantes} s.`}
                  {s.avisoSesion.aviso === "cuota_proxima" &&
                    `Se está acabando el cupo: quedan ${s.avisoSesion.segundosRestantes} s.`}
                </div>
              )}
              {s.avisoError && !s.avisoSesion && (
                <div
                  role="status"
                  data-testid="aviso-error"
                  className="absolute inset-x-3 top-3 z-20 rounded-2xl bg-ink/90 p-2 text-center text-[11px] text-white ring-1 ring-white/20"
                >
                  {s.avisoError}
                </div>
              )}

              {/* Conversación flotante: no resta espacio al video */}
              <div className="absolute bottom-3 right-3 z-10 flex w-[min(17.5rem,46%)] max-h-[46%] flex-col overflow-hidden rounded-2xl bg-ink/80 shadow-lg ring-1 ring-white/20 backdrop-blur-md landscape:bottom-4 landscape:right-4 landscape:max-h-[34%]">
                <div
                  data-testid="conversacion"
                  className="scrollbar-modal min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2.5"
                >
                  {s.mensajes.map((m) => (
                    <div key={m.id} className="animate-rise">
                      <div
                        className={
                          m.de === "asesor"
                            ? "max-w-[95%] rounded-xl rounded-tl-sm bg-white/12 px-2.5 py-1.5 text-[11px] leading-snug text-white landscape:text-[10px] landscape:leading-tight landscape:py-1"
                            : "ml-auto max-w-[95%] rounded-xl rounded-tr-sm bg-brand px-2.5 py-1.5 text-[11px] leading-snug text-white landscape:text-[10px] landscape:leading-tight landscape:py-1"
                        }
                      >
                        {m.texto}
                      </div>
                    </div>
                  ))}
                  {s.parcial && (
                    <div className="ml-auto max-w-[95%] rounded-xl rounded-tr-sm bg-brand/50 px-2.5 py-1.5 text-[11px] italic text-white/80">
                      {s.parcial}
                    </div>
                  )}
                  <div ref={finRef} />
                </div>
                {s.reconocimientoDisponible && s.escuchando && (
                  <div
                    className="flex items-center gap-2 border-t border-white/10 px-2 py-1"
                    data-testid="estado-microfono"
                  >
                    <MedidorMicrofono
                      key={`${s.audioPropio}-${s.camara}`}
                      stream={ctl.streamActual}
                      activo={
                        s.modoEscucha === "pulsar" ? s.oyendo : fase === "llamada" && !s.asesorHablando
                      }
                      vozDetectada={s.vozDetectada}
                    />
                    <span className="min-w-0 truncate text-[10px] font-medium text-white/75">
                      {s.modoEscucha === "pulsar"
                        ? s.oyendo
                          ? "Grabando… hablá ahora"
                          : "Tocá el micrófono para hablar"
                        : s.asesorHablando
                          ? "Habla el asesor…"
                          : "Te estamos escuchando"}
                    </span>
                  </div>
                )}
                <form
                  className="flex gap-1.5 border-t border-white/10 p-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ctl.enviarTexto(texto)) setTexto("");
                  }}
                >
                  {s.modoEscucha === "pulsar" && s.reconocimientoDisponible && (
                    <button
                      type="button"
                      onClick={() => ctl.pulsarParaHablar()}
                      disabled={fase !== "llamada" || s.oyendo}
                      aria-label={s.oyendo ? "Escuchando" : "Tocá para hablar"}
                      data-testid="pulsar-para-hablar"
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 ${
                        s.oyendo ? "bg-online animate-pulse" : "bg-brand"
                      } disabled:opacity-60`}
                    >
                      <Mic className="size-4" aria-hidden />
                    </button>
                  )}
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    maxLength={500}
                    disabled={fase !== "llamada"}
                    placeholder={s.escuchando ? "Hablá o escribí…" : "Escribí acá…"}
                    aria-label="Escribile al asesor"
                    data-testid="texto-cliente"
                    className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={fase !== "llamada" || !texto.trim()}
                    data-testid="enviar-texto"
                    className="rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-brand-dark disabled:opacity-40"
                  >
                    Enviar
                  </button>
                </form>
              </div>
            </div>
            <button
              onClick={() => void ctl.cortar()}
              data-testid="cortar"
              className="mt-3 flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-destructive font-display text-sm font-semibold text-white shadow-lg"
            >
              <span className="size-2.5 rounded-sm bg-white" />
              Cortar la llamada
            </button>
          </>
        )}
      </div>
      </div>
    </div>
  );
}

function Espera({
  titulo,
  detalle,
  foto,
}: {
  titulo: string;
  detalle?: string | undefined;
  foto?: string | undefined;
}) {
  return (
    <div
      className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center"
      role="status"
    >
      <div className="relative grid size-32 place-items-center">
        <span className="absolute size-28 rounded-full bg-accent/30 animate-pulse-ring" />
        <span
          className="absolute size-28 rounded-full bg-accent/30 animate-pulse-ring"
          style={{ animationDelay: "0.8s" }}
        />
        {foto ? (
          <img
            src={foto}
            alt=""
            width={816}
            height={816}
            className="relative size-24 rounded-full object-cover ring-2 ring-white/30"
          />
        ) : (
          <span className="relative grid size-24 place-items-center rounded-full bg-white/10 font-display text-2xl font-bold text-accent ring-2 ring-white/30">
            V©
          </span>
        )}
      </div>
      <p className="mt-6 font-display text-lg font-semibold text-white">{titulo}</p>
      {detalle && <p className="mt-1 max-w-[280px] text-xs text-white/60">{detalle}</p>}
      <div className="mt-6 flex items-end gap-1">
        {[0, 0.15, 0.3, 0.45, 0.6].map((d) => (
          <span
            key={d}
            className="h-5 w-1 origin-bottom rounded-full bg-accent animate-bar"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
    </div>
  );
}
