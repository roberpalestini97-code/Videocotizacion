/**
 * Captura de cámara en el navegador (adaptador fino sobre getUserMedia). La lógica de
 * muestreo está en muestreo.ts (pura). Requiere consentimiento previo (ADR 0006 §2):
 * este módulo NO pide permiso por su cuenta; el front lo llama después del consentimiento.
 */
import type { FuenteVideo, LienzoInyectable } from './muestreo';

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'environment' } },
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function cerrarCamara(stream: MediaStream | null, video?: HTMLVideoElement): void {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

export function fuenteDeVideo(video: HTMLVideoElement): FuenteVideo {
  return { ancho: video.videoWidth, alto: video.videoHeight, imagen: video };
}

/** OffscreenCanvas si existe (no toca el DOM); si no, <canvas> desconectado. */
export function crearLienzoNavegador(ancho: number, alto: number): LienzoInyectable {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(ancho, alto) as unknown as LienzoInyectable;
  }
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c as unknown as LienzoInyectable;
}
