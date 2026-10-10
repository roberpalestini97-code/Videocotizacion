/** TTS de respaldo cuando no hay clip talking-head (respuesta LLM / mp4 ausente). */
export function hablarTextoAsesor(
  texto: string,
  opts?: { onEnd?: () => void; onError?: () => void },
): () => void {
  const done = () => {
    opts?.onEnd?.();
  };
  const fail = () => {
    opts?.onError?.();
  };

  if (typeof window === "undefined" || !window.speechSynthesis) {
    fail();
    return () => undefined;
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = "es-AR";
  utter.rate = 1.02;
  utter.onend = done;
  utter.onerror = fail;

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const es =
      voices.find((v) => /es-AR|es_AR/i.test(v.lang)) ??
      voices.find((v) => /^es/i.test(v.lang));
    if (es) utter.voice = es;
    window.speechSynthesis.speak(utter);
  };

  if (window.speechSynthesis.getVoices().length > 0) pickVoice();
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      pickVoice();
    };
    // algunos browsers nunca disparan onvoiceschanged
    setTimeout(pickVoice, 250);
  }

  return () => {
    window.speechSynthesis.cancel();
  };
}
