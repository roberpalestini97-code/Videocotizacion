/**
 * Voz del cliente transcripta en el servidor (`sesion.lista.stt === "servidor"`).
 * En el celular el reconocimiento del navegador no comparte el micrófono y no
 * arranca sin un toque; acá se toma la pista de audio de la llamada, se pasa a
 * PCM16 16 kHz mono, se detecta cuándo empieza y termina cada frase y se manda
 * entera en tramas 0x01 (la última con el bit de fin de turno). El texto vuelve
 * como `transcripcion.final`. El audio no se guarda en ningún lado.
 */
import { MAX_CARGA, TIPO_TRAMA, armarTrama } from "./protocolo";
import type { Reconocedor, ReconocedorCb } from "./voz";

export const HZ_SERVIDOR = 16000;

/** Pasa muestras float [-1, 1] a PCM16 16 kHz con interpolación lineal; guarda la fase entre bloques. */
export class Remuestreador {
  private pos = 0;
  private ultima = 0;

  constructor(private readonly hzEntrada: number) {}

  procesar(x: Float32Array): Int16Array {
    const paso = this.hzEntrada / HZ_SERVIDOR;
    const out: number[] = [];
    // pos es relativa al bloque; entre -1 y 0 interpola con la última muestra del anterior.
    while (this.pos <= x.length - 1) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = i < 0 ? this.ultima : (x[i] ?? 0);
      const b = x[i + 1] ?? a;
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      out.push(v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff));
      this.pos += paso;
    }
    this.pos -= x.length;
    this.ultima = x[x.length - 1] ?? this.ultima;
    return Int16Array.from(out);
  }
}

export type OpcionesDetector = {
  /** Nivel RMS mínimo (0..1) para contar como voz, aunque el ambiente sea muy silencioso. */
  umbralMin: number;
  /** Veces el ruido de fondo que tiene que superar la voz. */
  factorRuido: number;
  /** Silencio seguido que cierra la frase. */
  silencioFinMs: number;
  /** Menos voz que esto es un golpe o un ruido: se descarta. */
  vozMinMs: number;
  /** Tope de una frase (el servidor admite 30 s). */
  maxMs: number;
  /** Audio previo al arranque que se conserva para no cortar la primera sílaba. */
  previoMs: number;
  /** Al empezar solo se mide el ruido de fondo (un zumbido parejo no es voz). */
  calibracionMs: number;
};

export const DETECTOR_POR_DEFECTO: OpcionesDetector = {
  umbralMin: 0.012,
  factorRuido: 3,
  silencioFinMs: 1200,
  vozMinMs: 250,
  maxMs: 15_000,
  previoMs: 300,
  calibracionMs: 500,
};

export type ResultadoDetector =
  { t: "nada" } | { t: "inicio" } | { t: "fin"; pcm: Int16Array } | { t: "descarte" };

export function nivelRMS(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let s = 0;
  for (const v of pcm) s += (v / 0x8000) ** 2;
  return Math.sqrt(s / pcm.length);
}

/** Detector de voz por energía con piso de ruido adaptable. Recibe PCM16 16 kHz. */
export class DetectorVoz {
  private piso = 0.005;
  private hablando = false;
  private previo: Int16Array[] = [];
  private frase: Int16Array[] = [];
  private msFrase = 0;
  private msVoz = 0;
  private msSilencio = 0;
  private msCalibrado = 0;

  constructor(private readonly o: OpcionesDetector = DETECTOR_POR_DEFECTO) {}

  get enFrase(): boolean {
    return this.hablando;
  }

  reiniciar(): void {
    this.hablando = false;
    this.previo = [];
    this.frase = [];
    this.msFrase = this.msVoz = this.msSilencio = 0;
  }

  alimentar(pcm: Int16Array): ResultadoDetector {
    if (pcm.length === 0) return { t: "nada" };
    const ms = (pcm.length * 1000) / HZ_SERVIDOR;
    const nivel = nivelRMS(pcm);
    if (this.msCalibrado < this.o.calibracionMs) {
      this.piso = this.msCalibrado === 0 ? nivel : this.piso + (nivel - this.piso) * 0.5;
      this.msCalibrado += ms;
      return { t: "nada" };
    }
    const umbral = Math.max(this.o.umbralMin, this.piso * this.o.factorRuido);
    const voz = nivel >= umbral;
    if (!this.hablando) {
      if (!voz) {
        // El piso sigue al ruido de fondo, lento para subir y rápido para bajar.
        this.piso += (nivel - this.piso) * (nivel > this.piso ? 0.05 : 0.3);
        this.previo.push(pcm);
        let msPrevio = (this.previo.reduce((n, b) => n + b.length, 0) * 1000) / HZ_SERVIDOR;
        while (this.previo.length > 1 && msPrevio > this.o.previoMs) {
          msPrevio -= ((this.previo.shift()?.length ?? 0) * 1000) / HZ_SERVIDOR;
        }
        return { t: "nada" };
      }
      this.hablando = true;
      this.frase = [...this.previo, pcm];
      this.previo = [];
      this.msFrase = ms;
      this.msVoz = ms;
      this.msSilencio = 0;
      return { t: "inicio" };
    }
    this.frase.push(pcm);
    this.msFrase += ms;
    if (voz) {
      this.msVoz += ms;
      this.msSilencio = 0;
    } else {
      this.msSilencio += ms;
    }
    if (this.msSilencio < this.o.silencioFinMs && this.msFrase < this.o.maxMs) return { t: "nada" };
    const suficiente = this.msVoz >= this.o.vozMinMs;
    const pcmFrase = unir(this.frase);
    this.reiniciar();
    return suficiente ? { t: "fin", pcm: pcmFrase } : { t: "descarte" };
  }
}

function unir(bloques: Int16Array[]): Int16Array {
  const out = new Int16Array(bloques.reduce((n, b) => n + b.length, 0));
  let i = 0;
  for (const b of bloques) {
    out.set(b, i);
    i += b.length;
  }
  return out;
}

/** Corta una frase en tramas 0x01 de ≤ 128 KiB; solo la última lleva el fin de turno. */
export function tramasDeFrase(pcm: Int16Array, seqInicial: number, tsMs: number): Uint8Array[] {
  const bytes = new Uint8Array(pcm.length * 2);
  const dv = new DataView(bytes.buffer);
  pcm.forEach((v, i) => dv.setInt16(i * 2, v, true)); // little-endian, como espera el WAV
  const out: Uint8Array[] = [];
  for (let off = 0, seq = seqInicial; off < bytes.length; off += MAX_CARGA, seq++) {
    const carga = bytes.subarray(off, Math.min(off + MAX_CARGA, bytes.length));
    const ultima = off + MAX_CARGA >= bytes.length;
    out.push(armarTrama(TIPO_TRAMA.audio_pcm16_16k, carga, seq, tsMs, ultima ? 1 : 0));
  }
  return out;
}

// ---------- audio del navegador ----------

type ConstructorAudio = typeof AudioContext;

function constructorAudio(): ConstructorAudio | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: ConstructorAudio }).webkitAudioContext ??
    null
  );
}

let compartido: AudioContext | null = null;

/** Contexto de audio de la llamada. Crearlo o reanudarlo dentro de un toque evita que quede suspendido. */
export function contextoAudio(): AudioContext | null {
  const AC = constructorAudio();
  if (!AC) return null;
  if (!compartido || compartido.state === "closed") compartido = new AC();
  return compartido;
}

/** Llamar dentro de un gesto del usuario (aceptar el aviso): el celular habilita el audio. */
export function desbloquearAudio(): void {
  void contextoAudio()
    ?.resume()
    .catch(() => undefined);
}

export type OpcionesReconocedorServidor = {
  stream: MediaStream;
  enviar: (trama: Uint8Array) => boolean;
  detector?: OpcionesDetector;
};

export class ReconocedorServidor implements Reconocedor {
  readonly modo = "continuo" as const;
  private cb: ReconocedorCb | null = null;
  private pausado = false;
  private seq = 0;
  private t0 = Date.now();
  private detector: DetectorVoz;
  private nodos: { fuente: MediaStreamAudioSourceNode; proc: ScriptProcessorNode } | null = null;
  private quitarToque: (() => void) | null = null;

  constructor(private readonly o: OpcionesReconocedorServidor) {
    this.detector = new DetectorVoz(o.detector);
  }

  disponible(): boolean {
    return (
      constructorAudio() !== null &&
      this.o.stream.getAudioTracks().some((t) => t.readyState === "live")
    );
  }

  iniciar(cb: ReconocedorCb): void {
    if (this.nodos || !this.disponible()) return;
    const ctx = contextoAudio();
    if (!ctx) return;
    this.cb = cb;
    const fuente = ctx.createMediaStreamSource(this.o.stream);
    // ScriptProcessor anda en todos los navegadores sin servir un archivo de worklet aparte.
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const rem = new Remuestreador(ctx.sampleRate);
    proc.onaudioprocess = (ev) => {
      const pcm = rem.procesar(ev.inputBuffer.getChannelData(0));
      if (!this.pausado) this.alimentar(pcm);
    };
    fuente.connect(proc);
    proc.connect(ctx.destination); // sin salida (ceros), pero sin conectar no procesa
    this.nodos = { fuente, proc };
    this.t0 = Date.now();
    if (ctx.state !== "running") {
      // Sin un gesto previo el celular deja el audio suspendido: el próximo toque lo habilita.
      void ctx.resume().catch(() => undefined);
      const reanudar = () => void ctx.resume().catch(() => undefined);
      document.addEventListener("pointerdown", reanudar, { once: true });
      this.quitarToque = () => document.removeEventListener("pointerdown", reanudar);
    }
  }

  private alimentar(pcm: Int16Array) {
    const r = this.detector.alimentar(pcm);
    if (r.t === "inicio") this.cb?.onVoz?.(true);
    else if (r.t === "descarte") this.cb?.onVoz?.(false);
    else if (r.t === "fin") {
      this.cb?.onVoz?.(false);
      const tramas = tramasDeFrase(r.pcm, this.seq, Date.now() - this.t0);
      this.seq += tramas.length;
      for (const t of tramas) {
        if (!this.o.enviar(t)) {
          this.cb?.onError?.("envio");
          return;
        }
      }
    }
  }

  /** Mientras habla el asesor no se escucha (evita mandar su propia voz). */
  pausar(pausado: boolean): void {
    this.pausado = pausado;
    if (pausado && this.detector.enFrase) this.cb?.onVoz?.(false);
    if (pausado) this.detector.reiniciar();
  }

  detener(): void {
    this.quitarToque?.();
    this.quitarToque = null;
    if (this.nodos) {
      this.nodos.proc.onaudioprocess = null;
      this.nodos.fuente.disconnect();
      this.nodos.proc.disconnect();
      this.nodos = null;
    }
    this.detector.reiniciar();
    this.cb = null;
  }
}
