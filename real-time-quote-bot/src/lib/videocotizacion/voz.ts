/**
 * Voz del asesor (síntesis) y reconocimiento de voz del cliente.
 * Todo corre en el navegador, sin claves: `speechSynthesis` y
 * `SpeechRecognition`/`webkitSpeechRecognition` con es-AR.
 *
 * `Voz` es la interfaz que más adelante puede reemplazar el avatar de la tarea 5
 * (audio del servidor o TTS propio); hoy la implementa `VozNavegador`.
 */
import { limpiarTexto } from "./protocolo";

export interface Voz {
  disponible(): boolean;
  hablar(texto: string, cb?: { onInicio?: () => void; onFin?: () => void }): void;
  cancelar(): void;
}

/** Estimación de duración si el navegador no avisa el fin (sin voces, headless, etc.). */
export function duracionEstimadaMs(texto: string): number {
  return Math.min(30_000, Math.max(1200, texto.length * 65));
}

export class VozNavegador implements Voz {
  private actual: SpeechSynthesisUtterance | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly lang = "es-AR") {}

  disponible(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window
    );
  }

  private elegirVoz(): SpeechSynthesisVoice | undefined {
    const voces = window.speechSynthesis.getVoices();
    return (
      voces.find((v) => v.lang.replace("_", "-").toLowerCase() === this.lang.toLowerCase()) ??
      voces.find((v) => v.lang.toLowerCase().startsWith("es-")) ??
      voces.find((v) => v.lang.toLowerCase().startsWith("es"))
    );
  }

  hablar(texto: string, cb: { onInicio?: () => void; onFin?: () => void } = {}): void {
    this.cancelar();
    const limpio = limpiarTexto(texto);
    if (!limpio) return cb.onFin?.();
    let terminado = false;
    const fin = () => {
      if (terminado) return;
      terminado = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.actual = null;
      cb.onFin?.();
    };
    // Aunque no haya voces o el navegador no dispare `end`, el flujo no se cuelga.
    this.timer = setTimeout(fin, duracionEstimadaMs(limpio) + 4000);
    if (!this.disponible()) {
      cb.onInicio?.();
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(fin, duracionEstimadaMs(limpio));
      return;
    }
    const u = new SpeechSynthesisUtterance(limpio);
    u.lang = this.lang;
    const v = this.elegirVoz();
    if (v) u.voice = v;
    u.rate = 1;
    u.onstart = () => cb.onInicio?.();
    u.onend = fin;
    u.onerror = fin;
    this.actual = u; // referencia viva: Chrome corta el habla si se recolecta el objeto
    window.speechSynthesis.speak(u);
  }

  cancelar(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.actual = null;
    if (this.disponible()) window.speechSynthesis.cancel();
  }
}

// ---------- reconocimiento ----------

export interface Reconocedor {
  disponible(): boolean;
  iniciar(cb: ReconocedorCb): void;
  detener(): void;
  /** Mientras habla el asesor no se escucha (evita que se oiga a sí mismo). */
  pausar(pausado: boolean): void;
}

export type ReconocedorCb = {
  onParcial?: (texto: string) => void;
  onFinal: (texto: string) => void;
  /** "no-speech" y "aborted" no se informan. Ej.: "not-allowed", "network". */
  onError?: (codigo: string) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function constructorReconocimiento(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => SpeechRecognitionLike) | null;
}

export class ReconocedorNavegador implements Reconocedor {
  private rec: SpeechRecognitionLike | null = null;
  private activo = false;
  private pausado = false;
  private cb: ReconocedorCb | null = null;

  constructor(private readonly lang = "es-AR") {}

  disponible(): boolean {
    return constructorReconocimiento() !== null;
  }

  iniciar(cb: ReconocedorCb): void {
    const C = constructorReconocimiento();
    if (!C || this.activo) return;
    this.cb = cb;
    this.activo = true;
    this.arrancar(C);
  }

  private arrancar(C: new () => SpeechRecognitionLike) {
    const r = new C();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (ev) => {
      if (this.pausado) return;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res?.[0];
        if (!res || !alt) continue;
        const t = alt.transcript.trim();
        if (!t) continue;
        if (res.isFinal) this.cb?.onFinal(t);
        else this.cb?.onParcial?.(t);
      }
    };
    r.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") this.activo = false;
      this.cb?.onError?.(ev.error);
    };
    r.onend = () => {
      // El navegador corta el reconocimiento cada tanto: se rearma mientras la llamada siga.
      if (this.activo && this.rec === r) setTimeout(() => this.activo && this.arrancar(C), 250);
    };
    this.rec = r;
    try {
      r.start();
    } catch {
      /* ya iniciado */
    }
  }

  pausar(pausado: boolean): void {
    this.pausado = pausado;
  }

  detener(): void {
    this.activo = false;
    const r = this.rec;
    this.rec = null;
    try {
      r?.abort();
    } catch {
      /* ignorar */
    }
  }
}

/** Texto del cliente listo para `texto.enviar`: sin <>, control, y ≤ 500 caracteres. */
export function textoParaEnviar(t: string, max = 500): string[] {
  const limpio = limpiarTexto(t);
  if (!limpio) return [];
  const partes: string[] = [];
  let resto = limpio;
  while (resto.length > max) {
    let corte = resto.lastIndexOf(" ", max);
    if (corte < max * 0.5) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}
