/** Arma el controlador con las implementaciones reales del navegador. Solo se llama en el cliente. */
import type { AvatarPuerto } from "./avatar";
import { crearAvatarVivo } from "./avatar-vivo-navegador";
import { ClienteVC } from "./cliente";
import { leerConfig } from "./config";
import { ControladorVC } from "./controlador";
import { MuestreadorFotogramas, crearCodificadorCanvas } from "./fotogramas";
import { SesionMedios } from "./medios";
import { ReconocedorNavegador, VozNavegador } from "./voz";

export type Entorno = {
  /** Video local (autoimagen) del que se toman los fotogramas. */
  obtenerVideo: () => HTMLVideoElement | null;
  avatar?: AvatarPuerto;
};

export function crearControlador(entorno: Entorno): ControladorVC {
  const config = leerConfig();
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
      return soltarMicrofono(s);
    },
    pedirVideo: (camara) => {
      const md = navigator.mediaDevices;
      if (!md?.getUserMedia)
        return Promise.reject(new DOMException("sin mediaDevices", "NotFoundError"));
      return md.getUserMedia({ video: { facingMode: { ideal: camara } }, audio: false });
    },
    contarCamaras: async () => {
      const ds = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
      return ds.filter((d) => d.kind === "videoinput").length;
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
    reconocedor: new ReconocedorNavegador("es-AR"),
    avatar: entorno.avatar ?? crearAvatarVivo(),
  });
}

/**
 * El micrófono se pide solo para tener el permiso: la voz la toma SpeechRecognition.
 * En Android, Chrome no comparte el micrófono entre getUserMedia y el reconocimiento
 * (se corta al instante y se rearma en bucle, con el bip de entrada/salida): por eso
 * la pista de audio se suelta enseguida.
 */
function soltarMicrofono(s: MediaStream): MediaStream {
  s.getAudioTracks().forEach((t) => {
    t.stop();
    s.removeTrack(t);
  });
  return s;
}
