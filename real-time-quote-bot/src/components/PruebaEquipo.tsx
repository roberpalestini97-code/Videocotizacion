import { useEffect, useRef, useState } from "react";

type Estado = "pidiendo" | "ok" | "error";

export function PruebaEquipo({
  abierto,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>("pidiendo");
  const [nivel, setNivel] = useState(0);
  const [micDetectado, setMicDetectado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    setEstado("pidiendo");
    setMicDetectado(false);
    setNivel(0);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        ctx = new AudioContext();
        const analizador = ctx.createAnalyser();
        analizador.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(analizador);
        const datos = new Uint8Array(analizador.frequencyBinCount);
        const loop = () => {
          analizador.getByteFrequencyData(datos);
          const prom = datos.reduce((a, b) => a + b, 0) / datos.length;
          const n = Math.min(1, prom / 60);
          setNivel(n);
          if (n > 0.25) setMicDetectado(true);
          raf = requestAnimationFrame(loop);
        };
        loop();
        setEstado("ok");
      })
      .catch(() => setEstado("error"));

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [abierto]);

  if (!abierto) return null;

  const barras = 12;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md animate-fade-in rounded-t-3xl bg-card p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Probá tu equipo</h2>
          <button onClick={onCerrar} className="text-sm text-ink/50" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/55">
          Verificá que te veamos y te escuchemos antes de conectar con el asesor.
        </p>

        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
          <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
          {estado === "pidiendo" && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
              Pidiendo permiso de cámara y micrófono…
            </div>
          )}
          {estado === "error" && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/80">
              No pudimos acceder a la cámara o al micrófono. Revisá los permisos del navegador y volvé a intentar.
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <Fila etiqueta="Cámara" ok={estado === "ok"} texto={estado === "ok" ? "Funciona" : estado === "error" ? "Sin acceso" : "Esperando…"} />
          <div className="rounded-xl bg-cream px-3 py-2.5">
            <Fila
              etiqueta="Micrófono"
              ok={micDetectado}
              texto={estado === "error" ? "Sin acceso" : micDetectado ? "Te escuchamos" : "Decí algo en voz alta"}
              sinFondo
            />
            <div className="mt-2 flex h-5 items-end gap-1">
              {Array.from({ length: barras }).map((_, i) => (
                <span
                  key={i}
                  className={`w-full rounded-full transition-all ${nivel * barras > i ? "bg-brand" : "bg-ink/10"}`}
                  style={{ height: `${30 + (i / barras) * 70}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          disabled={estado !== "ok"}
          onClick={onListo}
          className="mt-5 h-12 w-full rounded-2xl bg-accent font-display font-semibold text-brand-dark disabled:opacity-40"
        >
          Todo bien, iniciar videollamada
        </button>
      </div>
    </div>
  );
}

function Fila({ etiqueta, ok, texto, sinFondo }: { etiqueta: string; ok: boolean; texto: string; sinFondo?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-xs ${sinFondo ? "" : "rounded-xl bg-cream px-3 py-2.5"}`}>
      <span className="font-medium">{etiqueta}</span>
      <span className={`flex items-center gap-1.5 ${ok ? "text-brand font-semibold" : "text-ink/50"}`}>
        <span className={`size-2 rounded-full ${ok ? "bg-online" : "bg-ink/20"}`} />
        {texto}
      </span>
    </div>
  );
}
