/**
 * Harness demo.html: reproduce un audio de prueba SINTÉTICO con visemas de ejemplo, muestra el
 * pizarrón, permite cambiar a modo clips (placeholder), probar la cámara con muestreo y
 * medir fps. Expone `window.__vc` para el smoke de Playwright y para medir en equipos reales.
 */
import { Avatar3D, ErrorSinWebGL, type Calidad } from '../Avatar3D';
import { AvatarClips } from '../clips/AvatarClips';
import { catalogoPlaceholder, type EventoCola } from '../clips/ColaClips';
import { Pizarron } from '../pizarron/Pizarron';
import { MuestreadorFotogramas, MARGEN_INTERVALO_MS, type ResultadoMuestreo, type LienzoInyectable } from '../camara/muestreo';
import { abrirCamara, cerrarCamara, crearLienzoNavegador, fuenteDeVideo } from '../camara/captura';
import { separarTrama } from '../contrato/encabezado';
import { RelojAudioContext, type RelojAudio } from '../visemas/reloj';
import { visemaEsperado } from '../visemas/interpolacion';
import { sintetizarAudio } from './audioSintetico';
import { crearModeloProcedural } from '../modelo/procedural';
import { PIZARRON_DEMO, TURNOS_DEMO, eventoPizarron, eventoVisemas } from './guion';

const $ = <T extends HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`falta ${sel}`);
  return e;
};

const parametros = new URLSearchParams(location.search);
const calidad = (parametros.get('calidad') as Calidad) || 'media';
const fpsMax = Number(parametros.get('fpsMax') ?? 0) || 0;

let ctx: AudioContext | null = null;
const relojDemo: RelojAudio = {
  ahoraMs: () => (ctx ? relojReal!.ahoraMs() : performance.now()),
};
let relojReal: RelojAudioContext | null = null;

let avatar: Avatar3D | null = null;
let clips: AvatarClips | null = null;
let modo: '3d' | 'clips' = '3d';
let errorWebGL: string | null = null;
let seqServidor = 0;
let turnoBase = 0;
let versionPizarron = 0;

// --- Medición ---
const pares: [number, number][] = [];
let framesHablando = 0;
let aciertos = 0;
const eventosClips: EventoCola['tipo'][] = [];

function crearAvatar(): void {
  try {
    avatar = new Avatar3D($('#escena-3d'), {
      reloj: relojDemo,
      calidad,
      fpsMax,
      alFrame: (info) => {
        if (ctx && ctx.state === 'running') pares.push([info.tFrameMs, info.tAudioMs]);
        if (info.turno !== null && info.tTurnoMs !== null && avatar) {
          const items = avatar.sincronizador.itemsDe(info.turno);
          const fin = items.length ? items[items.length - 1]!.fin : 0;
          if (info.tTurnoMs >= 0 && info.tTurnoMs < fin) {
            framesHablando++;
            // Coherencia lógica (no es sincronía física): ¿el visema dominante tras suavizado
            // coincide con el que el contrato dice que suena en ese instante del reloj de audio?
            if (visemaEsperado(items, info.tTurnoMs) === info.dominante) aciertos++;
          }
        }
        actualizarHud();
      },
    });
  } catch (e) {
    errorWebGL = e instanceof Error ? e.message : String(e);
    if (e instanceof ErrorSinWebGL) cambiarModo('clips');
  }
}

function asegurarClips(): AvatarClips {
  if (!clips) {
    clips = new AvatarClips($('#escena-clips'), {
      catalogo: catalogoPlaceholder(),
      alEvento: (e) => eventosClips.push(e.tipo),
    });
  }
  return clips;
}

function cambiarModo(m: '3d' | 'clips'): void {
  modo = m;
  $('#escena-3d').hidden = m !== '3d';
  $('#escena-clips').hidden = m !== 'clips';
  if (m === 'clips') asegurarClips();
  $('#btn-modo').textContent = m === '3d' ? 'Pasar a modo clips' : 'Pasar a modo 3D';
}

const pizarron = new Pizarron($('#pizarron'), {
  siguienteSeq: () => ++seqServidor,
  alCorregir: (ev) => console.info('[demo] pizarron.corregir →', ev),
});

function regresionLineal(xy: [number, number][]): { pendiente: number; residuoDesvioMs: number; residuoP95Ms: number } {
  const n = xy.length;
  if (n < 3) return { pendiente: 1, residuoDesvioMs: 0, residuoP95Ms: 0 };
  let sx = 0, sy = 0;
  for (const [x, y] of xy) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of xy) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  const b = sxx ? sxy / sxx : 1;
  const res = xy.map(([x, y]) => y - (my + b * (x - mx)));
  const desvio = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n);
  const abs = res.map(Math.abs).sort((p, q) => p - q);
  return { pendiente: b, residuoDesvioMs: desvio, residuoP95Ms: abs[Math.floor(0.95 * (n - 1))] ?? 0 };
}

function medicion() {
  const reg = regresionLineal(pares);
  return {
    modo,
    calidad,
    fpsMax,
    errorWebGL,
    frames: avatar?.medidor.resumen() ?? null,
    renderer: avatar?.infoRenderer() ?? null,
    modelo: avatar?.estadisticasModelo() ?? null,
    audio: ctx
      ? {
          estado: ctx.state,
          sampleRate: ctx.sampleRate,
          baseLatencyMs: Math.round((ctx.baseLatency ?? 0) * 1000 * 100) / 100,
          outputLatencyMs: Math.round(((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000 * 100) / 100,
          tiempoContextoS: Math.round(ctx.currentTime * 1000) / 1000,
        }
      : null,
    relojAudioVsFrames: {
      muestras: pares.length,
      derivaPpm: Math.round((reg.pendiente - 1) * 1e6),
      residuoDesvioMs: Math.round(reg.residuoDesvioMs * 100) / 100,
      residuoP95Ms: Math.round(reg.residuoP95Ms * 100) / 100,
    },
    coherenciaVisemas: {
      framesHablando,
      pctDominanteIgualEsperado: framesHablando ? Math.round((1000 * aciertos) / framesHablando) / 10 : 0,
    },
    pizarron: { version: pizarron.estadoActual.version, campos: pizarron.estadoActual.campos.length, ignorados: pizarron.estadoActual.ignorados },
    clips: { eventos: [...eventosClips], reproduciendo: clips?.cola.reproduciendo?.clip_id ?? null },
    navegador: navigator.userAgent,
    dpr: window.devicePixelRatio,
    viewport: `${innerWidth}x${innerHeight}`,
  };
}

let ultimoHud = 0;
function actualizarHud(): void {
  const t = performance.now();
  if (t - ultimoHud < 500) return;
  ultimoHud = t;
  const r = avatar?.medidor.resumen();
  $('#hud').textContent = r
    ? `fps ${r.fpsMedio} · p95 ${r.intervaloP95Ms} ms · >33ms ${r.pctSobre33Ms}% · frames ${r.frames}`
    : 'sin 3D';
}

async function reproducirGuion(repeticiones = 1): Promise<void> {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    relojReal = new RelojAudioContext(ctx);
  }
  await ctx.resume();
  avatar?.medidor.reiniciar();
  pares.length = 0;
  framesHablando = 0;
  aciertos = 0;
  const c = ctx;
  let cuando = c.currentTime + 0.2;
  const esperas: Promise<void>[] = [];
  for (let r = 0; r < repeticiones; r++) {
    TURNOS_DEMO.forEach((texto, i) => {
      const turno = ++turnoBase;
      const ev = eventoVisemas(turno, texto, ++seqServidor);
      const audio = sintetizarAudio(ev.datos.items, { sampleRate: c.sampleRate });
      const buf = c.createBuffer(1, audio.length, c.sampleRate);
      buf.copyToChannel(audio, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(cuando);
      const inicioMs = cuando * 1000;
      const durMs = buf.duration * 1000;
      const msHastaInicio = Math.max(0, inicioMs - c.currentTime * 1000);
      if (modo === '3d') avatar?.recibirVisemas(ev);
      setTimeout(() => {
        if (modo === '3d') avatar?.iniciarTurno(turno, inicioMs);
        else
          asegurarClips().recibirRespuesta({
            v: 1, tipo: 'avatar.respuesta', seq: ++seqServidor, ts: ev.ts,
            datos: { turno, texto, clip_id: ['clip_saludo', 'clip_preguntar', 'clip_pedir_ver'][i]! },
          });
      }, Math.max(0, msHastaInicio - 30));
      setTimeout(() => {
        pizarron.recibir(eventoPizarron(++versionPizarron, PIZARRON_DEMO[i]!, ++seqServidor));
      }, msHastaInicio + durMs / 2);
      esperas.push(new Promise((res) => (src.onended = () => res())));
      cuando += buf.duration + 0.5;
    });
  }
  await Promise.all(esperas);
}

// --- Cámara real (getUserMedia) con muestreo cada 3 s ---
let stream: MediaStream | null = null;
let cancelarMuestreo: (() => void) | null = null;
const resultadosCamara: (ResultadoMuestreo & { msCodificar?: number })[] = [];

async function probarCamara(segundos = 7): Promise<typeof resultadosCamara> {
  const video = $<HTMLVideoElement>('#camara');
  stream = await abrirCamara(video);
  const m = new MuestreadorFotogramas({
    crearLienzo: crearLienzoNavegador,
    ahoraMs: () => performance.now(),
    enviar: (trama) => {
      // En producción va al WebSocket. Acá solo se verifica y se descarta (no se guarda).
      separarTrama(trama);
    },
  });
  const t = (): void => {
    const t0 = performance.now();
    void m.muestrear(fuenteDeVideo(video)).then((r) => {
      resultadosCamara.push({ ...r, msCodificar: Math.round(performance.now() - t0) });
      $('#estado-camara').textContent = r.resultado === 'enviado' ? `fotograma ${r.ancho}×${r.alto}, ${(r.bytes / 1024).toFixed(1)} KiB, q=${r.calidad}` : `omitido: ${r.motivo}`;
    });
  };
  t();
  const id = setInterval(t, m.regla.intervalo_min_ms + MARGEN_INTERVALO_MS);
  cancelarMuestreo = () => clearInterval(id);
  await new Promise((r) => setTimeout(r, segundos * 1000));
  cancelarMuestreo?.();
  m.detener();
  cerrarCamara(stream, video);
  return resultadosCamara;
}

/** Peor caso para el JPEG: ruido 1920×1080 (no comprime). Reloj falso para no esperar 3 s. */
async function probarMuestreoSintetico(tipo: 'ruido' | 'degradado' = 'ruido', ancho = 1920, alto = 1080) {
  const fuente = document.createElement('canvas');
  fuente.width = ancho;
  fuente.height = alto;
  const g = fuente.getContext('2d')!;
  if (tipo === 'ruido') {
    const img = g.createImageData(ancho, alto);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
    g.putImageData(img, 0, 0);
  } else {
    const gr = g.createLinearGradient(0, 0, ancho, alto);
    gr.addColorStop(0, '#d9cbb3');
    gr.addColorStop(1, '#6b5a45');
    g.fillStyle = gr;
    g.fillRect(0, 0, ancho, alto);
    g.fillStyle = '#3a3a3a';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * ancho, Math.random() * alto, 40, 6);
  }
  let reloj = 0;
  const m = new MuestreadorFotogramas({
    crearLienzo: (w, h) => crearLienzoNavegador(w, h) as LienzoInyectable,
    ahoraMs: () => (reloj += 3000),
    enviar: (trama) => void separarTrama(trama),
  });
  const salida: (ResultadoMuestreo & { msCodificar: number })[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = await m.muestrear({ ancho, alto, imagen: fuente });
    salida.push({ ...r, msCodificar: Math.round(performance.now() - t0) });
  }
  return salida;
}

/** Ida y vuelta GLB: exporta el modelo procedural a GLB, lo vuelve a cargar y lo usa (camino de T30). */
async function probarGLB() {
  if (!avatar) return { ok: false, motivo: 'sin avatar 3D' };
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const { cargarModeloGLBDesdeBytes } = await import('../modelo/glb');
  const fuente = crearModeloProcedural();
  const bytes = (await new GLTFExporter().parseAsync(fuente.raiz, { binary: true })) as ArrayBuffer;
  fuente.liberar();
  const modelo = await cargarModeloGLBDesdeBytes(bytes);
  const nombres = modelo.mallasVisemas.map((m) => Object.keys(m.morphTargetDictionary ?? {}).length);
  avatar.usarModelo(modelo);
  return { ok: modelo.mallasVisemas.length > 0, bytesGLB: bytes.byteLength, mallasConVisemas: modelo.mallasVisemas.length, morphsPorMalla: nombres, estadisticas: modelo.estadisticas() };
}

// --- UI ---
$('#btn-reproducir').addEventListener('click', () => void reproducirGuion(Number(parametros.get('repeticiones') ?? 1) || 1));
$('#btn-modo').addEventListener('click', () => cambiarModo(modo === '3d' ? 'clips' : '3d'));
$('#btn-cortar').addEventListener('click', () => {
  avatar?.cortar();
  clips?.interrumpir();
});
$('#btn-camara').addEventListener('click', () => void probarCamara().catch((e) => ($('#estado-camara').textContent = `cámara: ${e}`)));
$('#form-corregir').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $<HTMLInputElement>('#corregir-valor').value;
  pizarron.corregir('superficie_m2', v);
});

crearAvatar();
cambiarModo(avatar ? '3d' : 'clips');

declare global {
  interface Window {
    __vc: Record<string, unknown>;
  }
}
window.__vc = {
  reproducirGuion,
  medicion,
  probarCamara,
  probarMuestreoSintetico,
  probarGLB,
  cambiarModo,
  reiniciarMedicion: () => {
    avatar?.medidor.reiniciar();
    pares.length = 0;
  },
  listo: true,
};
