import { useEffect, useRef, useState } from "react";
import {
  asesores,
  asesorPorDefecto,
  clipAvatarPath,
  type Asesor,
  type Turno,
} from "@/data/asesores";
import { dispararEventoAsesor, hablarTextoAsesor } from "@/lib/asesor-api";

type Fase = "seleccion" | "permisos" | "conectando" | "llamada" | "cierre";

function nuevaSesionId() {
  return `vc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function VideoCotizacion({
  abierto,
  onCerrar,
  asesorInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  asesorInicial?: string | undefined;
}) {
  const [fase, setFase] = useState<Fase>("seleccion");
  const [asesor, setAsesor] = useState<Asesor>(asesorPorDefecto);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [permisoError, setPermisoError] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  /** Mientras el clip talking-head del asesor está en reproducción, no avanza el guion. */
  const [hablandoAvatar, setHablandoAvatar] = useState(false);
  const [clipSrc, setClipSrc] = useState<string | null>(null);
  const [sesionId, setSesionId] = useState(nuevaSesionId);
  const [consultandoApi, setConsultandoApi] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inicioEmitidoRef = useRef(false);
  const camaraEmitidaRef = useRef(false);
  const avanceLockRef = useRef(false);
  const pendingSpeechRef = useRef<string | null>(null);
  const stopSpeechRef = useRef<(() => void) | null>(null);

  // Estado inicial cada vez que se abre
  useEffect(() => {
    if (!abierto) return;
    const elegido = asesores.find((a) => a.id === asesorInicial) ?? asesorPorDefecto;
    setAsesor(elegido);
    setFase("seleccion");
    setTurnos([]);
    setPermisoError(null);
    setSegundos(0);
    setHablandoAvatar(false);
    setClipSrc(null);
    setSesionId(nuevaSesionId());
    setConsultandoApi(false);
    inicioEmitidoRef.current = false;
    camaraEmitidaRef.current = false;
    avanceLockRef.current = false;
    pendingSpeechRef.current = null;
    stopSpeechRef.current?.();
    stopSpeechRef.current = null;
  }, [abierto, asesorInicial]);

  // Cortar cámara y micrófono al cerrar
  useEffect(() => {
    if (abierto) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopSpeechRef.current?.();
    stopSpeechRef.current = null;
  }, [abierto]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopSpeechRef.current?.();
    };
  }, []);

  // Reloj de llamada
  useEffect(() => {
    if (fase !== "llamada" && fase !== "cierre") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [fase]);

  function liberarAvatar() {
    stopSpeechRef.current?.();
    stopSpeechRef.current = null;
    pendingSpeechRef.current = null;
    setHablandoAvatar(false);
    setClipSrc(null);
  }

  function hablarSinClip(texto: string) {
    setClipSrc(null);
    setHablandoAvatar(true);
    stopSpeechRef.current?.();
    stopSpeechRef.current = hablarTextoAsesor(texto, {
      onEnd: liberarAvatar,
      onError: liberarAvatar,
    });
  }

  function publicarTurno(siguiente: Turno, indice: number) {
    setTurnos((t) => [...t, siguiente]);

    if (siguiente.dato) {
      void dispararEventoAsesor({
        sesionId,
        asesorId: asesor.id,
        evento: {
          tipo: "observacion.dato",
          etiqueta: siguiente.dato.etiqueta,
          valor: siguiente.dato.valor,
        },
        historial: [...turnos, siguiente],
        observaciones: [...turnos.flatMap((t) => (t.dato ? [t.dato] : [])), siguiente.dato],
        parametros: { rubro: asesor.rubro, tono: asesor.tono },
      }).catch(() => undefined);
    }

    if (siguiente.de === "asesor") {
      pendingSpeechRef.current = siguiente.texto;
      setClipSrc(clipAvatarPath(asesor.id, indice));
      setHablandoAvatar(true);
    } else {
      liberarAvatar();
    }
  }

  function onClipError() {
    const texto = pendingSpeechRef.current;
    if (texto) hablarSinClip(texto);
    else liberarAvatar();
  }

  // Tope de seguridad si el mp4/TTS no termina
  useEffect(() => {
    if (!hablandoAvatar) return;
    const id = setTimeout(liberarAvatar, 40_000);
    return () => clearTimeout(id);
  }, [hablandoAvatar, clipSrc]);

  const observaciones = turnos.flatMap((t) => (t.dato ? [t.dato] : []));

  // Evento: inicio de llamada → API del asesor
  useEffect(() => {
    if (fase !== "llamada" || inicioEmitidoRef.current) return;
    inicioEmitidoRef.current = true;
    void dispararEventoAsesor({
      sesionId,
      asesorId: asesor.id,
      evento: { tipo: "llamada.inicio" },
      historial: [],
      observaciones: [],
      parametros: { rubro: asesor.rubro, tono: asesor.tono },
    }).catch(() => undefined);
  }, [fase, sesionId, asesor]);

  // Evento: cámara del usuario disponible
  useEffect(() => {
    if (fase !== "llamada" || camaraEmitidaRef.current) return;
    const stream = streamRef.current;
    if (!stream) return;
    camaraEmitidaRef.current = true;
    const track = stream.getVideoTracks()[0];
    void dispararEventoAsesor({
      sesionId,
      asesorId: asesor.id,
      evento: {
        tipo: "observacion.camara",
        activa: track?.readyState === "live",
        ...(track?.label ? { etiquetaDispositivo: track.label } : {}),
      },
      historial: [],
      observaciones: [],
      parametros: { facingMode: "environment|user" },
    }).catch(() => undefined);
  }, [fase, sesionId, asesor.id]);

  // Ciclo de turnos vía API (fallback guion en server / catch local)
  useEffect(() => {
    if (fase !== "llamada") return;
    if (hablandoAvatar || consultandoApi) return;
    if (avanceLockRef.current) return;

    const ultimo = turnos[turnos.length - 1];
    const porLargo = Math.min(3500, Math.max(0, (ultimo?.texto.length ?? 0) * 20));
    const delay =
      turnos.length === 0
        ? 1600
        : ultimo?.de === "asesor"
          ? 700
          : 2800 + Math.min(porLargo, 1200);

    const id = setTimeout(() => {
      avanceLockRef.current = true;
      setConsultandoApi(true);
      const indice = turnos.length;
      const obs = turnos.flatMap((t) => (t.dato ? [t.dato] : []));
      void dispararEventoAsesor({
        sesionId,
        asesorId: asesor.id,
        evento: { tipo: "turno.solicitar", indice },
        historial: turnos,
        observaciones: obs,
        parametros: {
          rubro: asesor.rubro,
          tono: asesor.tono,
          camaraActiva: Boolean(streamRef.current?.getVideoTracks().some((t) => t.readyState === "live")),
        },
      })
        .then((res) => {
          if (res.fin || !res.turno) {
            setFase("cierre");
            void dispararEventoAsesor({
              sesionId,
              asesorId: asesor.id,
              evento: { tipo: "llamada.cierre" },
              historial: turnos,
              observaciones: obs,
            }).catch(() => undefined);
            return;
          }
          publicarTurno(res.turno, indice);
        })
        .catch(() => {
          const fallback = asesor.guion[indice];
          if (!fallback) {
            setFase("cierre");
            return;
          }
          publicarTurno(fallback, indice);
        })
        .finally(() => {
          setConsultandoApi(false);
          avanceLockRef.current = false;
        });
    }, delay);

    return () => clearTimeout(id);
  }, [fase, turnos, asesor, hablandoAvatar, consultandoApi, sesionId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnos, fase]);

  // Reasignar stream al <video> al entrar en llamada (el nodo no existe en permisos/conectando)
  useEffect(() => {
    if (fase !== "llamada" && fase !== "cierre") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [fase]);

  async function pedirPermisos() {
    setFase("permisos");
    setPermisoError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      }
      streamRef.current = stream;
      setFase("conectando");
      setTimeout(() => setFase("llamada"), 2600);
    } catch {
      setPermisoError(
        "No pudimos acceder a la cámara o al micrófono. Podés habilitarlos desde los permisos del navegador y volver a intentar.",
      );
      setFase("seleccion");
    }
  }

  if (!abierto) return null;

  const datos = observaciones;
  const presupuesto = turnos.find((t) => t.presupuesto)?.presupuesto;
  const reloj = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2 text-white/90">
          <span className="size-1.5 rounded-full bg-online animate-blink" />
          <span className="text-xs font-medium uppercase tracking-[0.18em]">
            {fase === "seleccion" && "Antes de llamar"}
            {fase === "permisos" && "Permisos"}
            {fase === "conectando" && "Conectando"}
            {(fase === "llamada" || fase === "cierre") &&
              `En vivo · ${reloj}${consultandoApi ? " · API" : ""}${hablandoAvatar ? " · Hablando" : ""}`}
          </span>
        </div>
        <button
          onClick={onCerrar}
          aria-label="Cerrar videollamada"
          className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>

      <div
        className={
          fase === "llamada" || fase === "cierre"
            ? "flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-6 pt-4"
            : "flex-1 overflow-y-auto px-5 pb-6 pt-6"
        }
      >
        {fase === "seleccion" && (
          <div className="animate-rise">
            <h2 className="font-display text-2xl font-bold text-white">Elegí tu asesor</h2>
            <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-white/70">
              Cada asesor está entrenado en su oficio. Al iniciar, el navegador te va a pedir cámara y
              micrófono.
            </p>
            <div className="mt-5 space-y-2.5">
              {asesores.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAsesor(a)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors ${
                    a.id === asesor.id
                      ? "bg-white/15 ring-accent"
                      : "bg-white/5 ring-white/15"
                  }`}
                >
                  <img
                    src={a.foto}
                    alt={a.nombre}
                    loading="lazy"
                    width={816}
                    height={816}
                    className="size-14 shrink-0 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-sm font-semibold text-white">
                      {a.nombre} · {a.rubro}
                    </span>
                    <span className="block text-xs text-white/60">{a.especialidad}</span>
                    <span className="block text-[11px] text-white/40">Tono: {a.tono}</span>
                  </span>
                </button>
              ))}
            </div>

            {permisoError && (
              <p className="mt-4 rounded-2xl bg-destructive/15 p-3 text-xs leading-relaxed text-white/85">
                {permisoError}
              </p>
            )}

            <button
              onClick={pedirPermisos}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display text-base font-semibold text-brand-dark"
            >
              <span className="size-2.5 rounded-full bg-brand-dark animate-blink" />
              Conectar con {asesor.nombre}
            </button>
            <p className="mt-2 text-center text-[11px] text-white/50">
              Requiere micrófono y cámara · podés cortar cuando quieras
            </p>
          </div>
        )}

        {(fase === "permisos" || fase === "conectando") && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="relative grid size-32 place-items-center">
              <span className="absolute size-28 rounded-full bg-accent/30 animate-pulse-ring" />
              <span
                className="absolute size-28 rounded-full bg-accent/30 animate-pulse-ring"
                style={{ animationDelay: "0.8s" }}
              />
              <img
                src={asesor.foto}
                alt={asesor.nombre}
                loading="lazy"
                width={816}
                height={816}
                className="relative size-24 rounded-full object-cover ring-2 ring-white/30"
              />
            </div>
            <p className="mt-6 font-display text-lg font-semibold text-white">
              {fase === "permisos" ? "Habilitá cámara y micrófono" : `Conectando con ${asesor.nombre}`}
            </p>
            <p className="mt-1 text-xs text-white/60">{asesor.rubro} · {asesor.tono}</p>
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
        )}

        {(fase === "llamada" || fase === "cierre") && (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-ink ring-1 ring-white/15">
            {/* Layout tipo Zoom: asesor izquierda · cámara usuario derecha */}
            <div className="absolute inset-0 flex gap-1.5 p-1.5 landscape:gap-2 landscape:p-2">
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-[#1a2e28]">
                <img
                  src={asesor.foto}
                  alt={asesor.nombre}
                  loading="lazy"
                  width={816}
                  height={816}
                  className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
                    clipSrc && hablandoAvatar ? "opacity-0" : "opacity-100"
                  }`}
                />
                {clipSrc && (
                  <video
                    key={clipSrc}
                    ref={avatarVideoRef}
                    src={clipSrc}
                    playsInline
                    autoPlay
                    className="absolute inset-0 size-full object-cover"
                    onEnded={liberarAvatar}
                    onError={onClipError}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/20" />
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1 backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-online animate-blink" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                    {asesor.nombre}
                  </span>
                </div>
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-white drop-shadow">
                      {asesor.nombre}
                    </p>
                    <p className="truncate text-[10px] text-white/70">{asesor.rubro}</p>
                  </div>
                  <span
                    className={`flex shrink-0 items-end gap-0.5 rounded-full bg-ink/55 px-2 py-1.5 ${
                      hablandoAvatar ? "opacity-100" : "opacity-50"
                    }`}
                  >
                    {[0, 0.15, 0.3].map((d) => (
                      <span
                        key={d}
                        className="h-3.5 w-0.5 origin-bottom rounded-full bg-accent animate-bar"
                        style={{
                          animationDelay: `${d}s`,
                          animationPlayState: hablandoAvatar ? "running" : "paused",
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
                  className="absolute inset-0 size-full object-cover"
                />
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1 backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-online animate-blink" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                    Tu cámara
                  </span>
                </div>
              </div>
            </div>

            {(datos.length > 0 || presupuesto) && (
              <div className="absolute left-3 top-12 z-[5] max-w-[min(48%,18rem)] rounded-2xl bg-ink/75 p-2.5 ring-1 ring-white/15 backdrop-blur-md landscape:left-4 landscape:top-14 landscape:max-w-[36%]">
                {datos.length > 0 && (
                  <>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                      Datos en vivo
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {datos.map((d) => (
                        <span
                          key={d.etiqueta}
                          className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85"
                        >
                          {d.etiqueta}: <span className="font-semibold">{d.valor}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {presupuesto && (
                  <div className={datos.length > 0 ? "mt-2" : undefined}>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                      Presupuesto estimado
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Total: {presupuesto.total}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85">
                        {presupuesto.detalle}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85">
                        Plazo: {presupuesto.plazo}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Guion flotante: no resta espacio al video; en landscape ≤20% altura */}
            <div className="absolute bottom-3 right-3 z-10 flex w-[min(17.5rem,46%)] max-h-[38%] flex-col overflow-hidden rounded-2xl bg-ink/80 shadow-lg ring-1 ring-white/20 backdrop-blur-md landscape:bottom-4 landscape:right-4 landscape:max-h-[20%]">
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2.5">
                {turnos.map((t, i) => (
                  <div key={i} className="animate-rise">
                    <div
                      className={
                        t.de === "asesor"
                          ? "max-w-[95%] rounded-xl rounded-tl-sm bg-white/12 px-2.5 py-1.5 text-[11px] leading-snug text-white landscape:text-[10px] landscape:leading-tight landscape:py-1"
                          : "ml-auto max-w-[95%] rounded-xl rounded-tr-sm bg-brand px-2.5 py-1.5 text-[11px] leading-snug text-white landscape:text-[10px] landscape:leading-tight landscape:py-1"
                      }
                    >
                      {t.texto}
                    </div>
                  </div>
                ))}
                {fase === "cierre" && presupuesto && (
                  <div className="animate-rise rounded-xl bg-accent p-2.5 text-brand-dark landscape:p-2">
                    <p className="font-display text-xs font-semibold landscape:text-[11px]">
                      ¿Arrancamos con este trabajo?
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-brand-dark/75 landscape:text-[9px]">
                      Si confirmás, te llamamos para coordinar la visita.
                    </p>
                    <div className="mt-2 flex gap-1.5 landscape:mt-1.5">
                      <button className="h-8 flex-1 rounded-lg bg-brand-dark text-[11px] font-semibold text-white landscape:h-7 landscape:text-[10px]">
                        Quiero que me llamen
                      </button>
                      <button
                        onClick={onCerrar}
                        className="h-8 rounded-lg bg-brand-dark/10 px-2.5 text-[11px] font-medium landscape:h-7 landscape:text-[10px]"
                      >
                        Lo pienso
                      </button>
                    </div>
                  </div>
                )}
                <div ref={finRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
