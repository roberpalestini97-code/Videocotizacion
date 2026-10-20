/** Arma el controlador con las implementaciones reales del navegador. Solo se llama en el cliente. */
import type { AvatarPuerto } from "./avatar";
import { crearAvatarVivo } from "./avatar-vivo-navegador";
import { ClienteVC } from "./cliente";
import { leerConfig } from "./config";
import { ControladorVC } from "./controlador";
import { MuestreadorFotogramas, crearCodificadorCanvas } from "./fotogramas";
import { SesionMedios } from "./medios";
import { ReconocedorNavegador, VozNavegador } from "./voz";
import { ReconocedorServidor, desbloquearAudio } from "./voz-servidor";

export type Entorno = {
  /** Video local (autoimagen) del que se toman los fotogramas. */
  obtenerVideo: () => HTMLVideoElement | null;
  avatar?: AvatarPuerto;
};

export function crearControlador(entorno: Entorno): ControladorVC {
  const config = leerConfig();
  const movil = esCelular();
  const vozServidor = preferirVozServidor(movil);
  const cliente = new ClienteVC({ apiBase: config.apiBase, clavePublica: config.clavePublica });
  return new ControladorVC({
    config,
    cliente,
    pedirMedios: async () => {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia) throw new DOMException("sin mediaDevices", "NotFoundError");
      let s: MediaStream;
      try {
        s = await md.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: true });
      } catch (e) {
        if (
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "SecurityError")
        )
          throw e;
        s = await md.getUserMedia({ video: true, audio: true });
      }
      // La pista de audio queda para el medidor del micrófono. Si en este celular no se
      // comparte con SpeechRecognition, el controlador la suelta (soltarAudio).
      return s;
    },
    pedirVideo: (camara) => {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia)
        return Promise.reject(new DOMException("sin mediaDevices", "NotFoundError"));
      return md.getUserMedia({ video: { facingMode: { ideal: camara } }, audio: false });
    },
    contarCamaras: async () => {
      const ds = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
      const n = ds.filter((d) => d.kind === "videoinput").length;
      // Android a veces lista una sola cámara aunque tenga frontal y trasera.
      return movil ? Math.max(n, 2) : n;
    },
    crearMedios: (o) => new SesionMedios(o),
    crearMuestreador: (regla, enviar) => {
      let cache: {
        video: HTMLVideoElement;
        cod: ReturnType<typeof crearCodificadorCanvas>;
      } | null = null;
      return new MuestreadorFotogramas(regla, {
        leerFuente: () => {
          const v = entorno.obtenerVideo();
          return {
            ancho: v?.videoWidth ?? 0,
            alto: v?.videoHeight ?? 0,
            listo: !!v && v.readyState >= 2 && v.videoWidth > 0,
          };
        },
        codificar: async (a, h, q) => {
          const v = entorno.obtenerVideo();
          if (!v) return null;
          if (cache?.video !== v) cache = { video: v, cod: crearCodificadorCanvas(v) };
          return cache.cod(a, h, q);
        },
        enviar,
      });
    },
    voz: new VozNavegador("es-AR"),
    reconocedor: new ReconocedorNavegador("es-AR", movil ? "pulsar" : "continuo"),
    // Si el servidor transcribe (sesion.lista.stt), el celular habla de corrido sin tocar.
    ...(vozServidor
      ? { crearReconocedorServidor: (o) => new ReconocedorServidor(o), desbloquearAudio }
      : {}),
    avatar: entorno.avatar ?? crearAvatarVivo(),
  });
}

/**
 * Voz por el servidor: en el celular, salvo `?voz=navegador`. En la PC solo con `?voz=servidor`
 * (el reconocimiento del navegador anda bien y no gasta llamadas al modelo).
 */
export function preferirVozServidor(movil: boolean): boolean {
  if (typeof location === "undefined") return movil;
  const pedido = new URLSearchParams(location.search).get("voz");
  if (pedido === "servidor") return true;
  if (pedido === "navegador") return false;
  return movil;
}

/** Celular o tablet (incluye iPad, que se presenta como Mac con pantalla táctil). */
export function esCelular(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}
