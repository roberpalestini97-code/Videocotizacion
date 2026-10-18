import { useEffect, useRef } from "react";

const BARRAS = 14;

type Props = {
  /** Stream de la llamada. Si trae una pista de audio viva (PC), se mide el nivel real. */
  stream: MediaStream | null;
  /** El micrófono está escuchando (llamada en curso, o una frase en el celular). */
  activo: boolean;
  /** Sin pista de audio (celular): el navegador avisa si detecta voz, sin volumen. */
  vozDetectada: boolean;
  className?: string;
};

/**
 * Barras que muestran que el micrófono está tomando la voz del cliente.
 * PC: espectro real (AnalyserNode). Celular: Chrome en Android no comparte el micrófono
 * con el reconocimiento de voz, así que las barras se animan cuando el navegador detecta voz.
 */
export function MedidorMicrofono({ stream, activo, vozDetectada, className = "" }: Props) {
  const barras = useRef<(HTMLSpanElement | null)[]>([]);
  const pista = stream?.getAudioTracks().find((t) => t.readyState === "live") ?? null;
  const real = activo && !!pista;

  useEffect(() => {
    if (!real || !stream) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const fuente = ctx.createMediaStreamSource(stream);
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 64;
    analizador.smoothingTimeConstant = 0.7;
    fuente.connect(analizador);
    void ctx.resume().catch(() => undefined);
    const datos = new Uint8Array(analizador.frequencyBinCount);
    let raf = 0;
    const pintar = () => {
      analizador.getByteFrequencyData(datos);
      for (let i = 0; i < BARRAS; i++) {
        // Bandas bajas-medias, donde está la voz.
        const v = (datos[1 + i] ?? 0) / 255;
        const el = barras.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.08, v)})`;
      }
      raf = requestAnimationFrame(pintar);
    };
    raf = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(raf);
      fuente.disconnect();
      void ctx.close().catch(() => undefined);
    };
  }, [real, stream]);

  return (
    <div
      className={`flex h-6 items-center gap-[3px] ${className}`}
      role="img"
      aria-label={activo ? "Micrófono escuchando" : "Micrófono en pausa"}
      data-testid="medidor-microfono"
      data-modo={real ? "espectro" : "voz"}
    >
      {Array.from({ length: BARRAS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barras.current[i] = el;
          }}
          className={`h-full w-[3px] origin-center rounded-full transition-colors ${
            activo ? "bg-online" : "bg-white/25"
          } ${!real && activo ? (vozDetectada ? "animate-mic-voz" : "animate-mic-espera") : ""}`}
          style={{
            transform: real ? "scaleY(0.08)" : activo ? undefined : "scaleY(0.12)",
            animationDelay: `${(i % 7) * 0.09}s`,
          }}
        />
      ))}
    </div>
  );
}
