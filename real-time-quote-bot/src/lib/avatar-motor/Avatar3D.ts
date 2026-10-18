// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Avatar3D: componente three.js que mueve los blendshapes de un modelo 3D con visemas
 * sincronizados contra el reloj de audio.
 *
 * Interfaz (propuesta para T10, coautoría fe):
 *   const av = new Avatar3D(contenedor, { reloj: new RelojAudioContext(ctx) });
 *   socket → av.recibirVisemas(evento 'avatar.visemas')
 *   reproductor de audio → av.iniciarTurno(turno, inicioMsEnRelojDeAudio)
 *   cliente habla encima → av.cortar()
 *   av.destruir()
 * Si el navegador no tiene WebGL, el constructor lanza ErrorSinWebGL: el front debe caer al
 * modo clips (AvatarClips), que no necesita GPU.
 */
import * as THREE from 'three';
import type { EventoAvatarVisemas } from './contrato/eventos';
import type { RelojAudio } from './visemas/reloj';
import { MotorVisemas, type InfoFrame } from './visemas/motor';
import type { OpcionesSincronizador, ResultadoRecepcion } from './visemas/sincronizador';
import type { OpcionesSuavizado } from './visemas/suavizado';
import {
  aplicarPesos,
  articulacionMezclada,
  detectarEsquema,
  type EsquemaBlendshapes,
} from './modelo/blendshapes';
import { crearModeloProcedural, type ModeloAvatar } from './modelo/procedural';
import { MedidorFrames } from './medicion/frames';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { crearRespaldoSilla, cubrir, liberarGrupo, type Entorno } from './entornos';

export type Calidad = 'baja' | 'media' | 'alta';

export interface OpcionesAvatar3D {
  reloj: RelojAudio;
  /** Modelo a usar; por defecto el procedural. Para GLB: `await cargarModeloGLB(url)` (T30). */
  modelo?: ModeloAvatar;
  calidad?: Calidad;
  /** Tope de fps (ahorro de batería en gama baja). 0 = sin tope. */
  fpsMax?: number;
  sincronizador?: OpcionesSincronizador;
  suavizado?: OpcionesSuavizado;
  /** Se llama en cada frame renderizado (medición). */
  alFrame?: (info: InfoFrame) => void;
  /** Texto alternativo del lienzo (accesibilidad). */
  descripcionAccesible?: string;
}

export class ErrorSinWebGL extends Error {
  constructor(causa?: unknown) {
    super('WebGL no disponible: usar modo clips');
    this.name = 'ErrorSinWebGL';
    this.cause = causa;
  }
}

export function relacionPixeles(calidad: Calidad, dpr: number): number {
  const tope = calidad === 'baja' ? 1 : calidad === 'media' ? 1.5 : 2;
  return Math.max(0.5, Math.min(dpr || 1, tope));
}

/** Fondo tipo Meshy: degradé radial gris oscuro detrás del busto. */
export function crearFondoDegrade(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(256, 220, 20, 256, 260, 340);
  grd.addColorStop(0, '#7a7a7a');
  grd.addColorStop(0.35, '#4a4a4a');
  grd.addColorStop(0.7, '#222222');
  grd.addColorStop(1, '#0e0e0e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Avatar3D {
  readonly lienzo: HTMLCanvasElement;
  readonly medidor = new MedidorFrames();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private readonly motor: MotorVisemas;
  private modelo: ModeloAvatar;
  private esquemas: EsquemaBlendshapes[] = [];
  private observador: ResizeObserver | null = null;
  private ultimoRender = -Infinity;
  private t0: number | null = null;
  private destruido = false;
  private fondoTex: THREE.CanvasTexture | null = null;
  private modoBusto = false;
  private luces: THREE.Light[] = [];
  private entornoTex: THREE.Texture | null = null;
  private entornoFondo: THREE.Texture | null = null;
  private entornoPmrem: THREE.Texture | null = null;
  private respaldo: THREE.Object3D | null = null;

  constructor(private readonly contenedor: HTMLElement, private readonly op: OpcionesAvatar3D) {
    this.lienzo = document.createElement('canvas');
    this.lienzo.setAttribute('role', 'img');
    this.lienzo.setAttribute('aria-label', op.descripcionAccesible ?? 'Asistente con casco de obra que habla');
    const calidad = op.calidad ?? 'media';
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.lienzo,
        antialias: calidad !== 'baja',
        alpha: false,
        powerPreference: 'default',
      });
    } catch (e) {
      throw new ErrorSinWebGL(e);
    }
    this.renderer.setPixelRatio(relacionPixeles(calidad, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    contenedor.appendChild(this.lienzo);

    this.fondoTex = crearFondoDegrade();
    this.escena.background = this.fondoTex;

    // Luz suave tipo estudio (referencia Meshy).
    const hemi = new THREE.HemisphereLight(0xf0f0f5, 0x2a2a32, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(1.2, 2.2, 2.5);
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.45);
    fill.position.set(-2, 0.8, 1.2);
    const rim = new THREE.DirectionalLight(0xfff0e0, 0.35);
    rim.position.set(0, 1.5, -2);
    this.luces = [hemi, key, fill, rim];
    for (const l of this.luces) {
      l.userData.intensidadBase = l.intensity;
      this.escena.add(l);
    }

    this.camara.position.set(0, -0.35, 7.2);
    this.camara.lookAt(0, -0.55, 0);

    this.modelo = op.modelo ?? crearModeloProcedural({ detalle: calidad === 'baja' ? 'baja' : 'media' });
    this.usarModelo(this.modelo);

    this.motor = new MotorVisemas(op.reloj, { sincronizador: op.sincronizador, suavizado: op.suavizado });

    this.ajustarTamano();
    if (typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(() => this.ajustarTamano());
      this.observador.observe(contenedor);
    }
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Cambia el modelo en caliente (procedural → GLB de T30). Libera el anterior. */
  usarModelo(m: ModeloAvatar): void {
    if (this.modelo && this.modelo !== m) {
      this.escena.remove(this.modelo.raiz);
      this.modelo.liberar();
    }
    this.modelo = m;
    this.esquemas = m.mallasVisemas.map((x) => detectarEsquema(x) ?? 'visemas');
    if (!this.escena.children.includes(m.raiz)) this.escena.add(m.raiz);
    this.modoBusto = m.mallasVisemas.some((x) => detectarEsquema(x) === 'valid');
    this.aplicarCamara();
  }

  /**
   * Pone al asesor en un lugar (T46): el HDRI es el fondo desenfocado y la luz de la
   * escena. Si la carga falla, queda el degradé de siempre (la llamada no se rompe).
   */
  async usarEntorno(e: Entorno): Promise<void> {
    const [tex, fondo] = await Promise.all([
      new HDRLoader().loadAsync(e.url),
      new THREE.TextureLoader().loadAsync(e.fondo),
    ]);
    if (this.destruido) {
      tex.dispose();
      fondo.dispose();
      return;
    }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose(); // la luz usa el PMREM; el equirect ya no hace falta
    this.quitarEntorno();
    fondo.colorSpace = THREE.SRGBColorSpace;
    this.entornoFondo = fondo;
    this.entornoPmrem = env;
    cubrir(fondo, this.contenedor.clientWidth, this.contenedor.clientHeight);
    this.escena.background = fondo;
    this.escena.environment = env;
    this.escena.environmentIntensity = e.intensidadLuz;
    this.escena.environmentRotation.set(0, e.rotacionY, 0);
    for (const l of this.luces) l.intensity = l.userData.intensidadBase * e.luzEstudio;
    if (e.respaldo === 'silla') {
      this.respaldo = crearRespaldoSilla();
      this.escena.add(this.respaldo);
    }
  }

  private quitarEntorno(): void {
    if (this.respaldo) {
      this.escena.remove(this.respaldo);
      liberarGrupo(this.respaldo);
      this.respaldo = null;
    }
    this.entornoTex?.dispose();
    this.entornoFondo?.dispose();
    this.entornoPmrem?.dispose();
    this.entornoTex = this.entornoFondo = this.entornoPmrem = null;
    this.escena.background = this.fondoTex;
    this.escena.environment = null;
    for (const l of this.luces) l.intensity = l.userData.intensidadBase;
  }

  /** Plano busto (cabeza/hombros) como en la referencia Meshy. */
  private aplicarCamara(): void {
    if (this.modoBusto) {
      this.camara.fov = 28;
      this.camara.near = 0.05;
      this.camara.far = 20;
      // Cabeza centrada en origen por encuadrarValid; cámara a la altura de los ojos.
      this.camara.position.set(0, 0.06, 0.78);
      this.camara.lookAt(0, 0.02, 0);
    } else {
      this.camara.fov = 28;
      this.camara.position.set(0, -0.35, 7.2);
      this.camara.lookAt(0, -0.55, 0);
    }
    this.camara.updateProjectionMatrix();
  }

  recibirVisemas(ev: EventoAvatarVisemas): ResultadoRecepcion {
    return this.motor.recibirVisemas(ev);
  }

  iniciarTurno(turno: number, inicioRelojMs: number): void {
    this.motor.iniciarTurno(turno, inicioRelojMs);
  }

  cortar(): void {
    this.motor.cortar();
  }

  get sincronizador() {
    return this.motor.sincronizador;
  }

  infoRenderer(): { gpu: string; webgl2: boolean; triangulos: number; llamadas: number; pixelRatio: number } {
    const gl = this.renderer.getContext();
    let gpu = 'desconocida';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch {
      /* algunos navegadores lo bloquean */
    }
    return {
      gpu,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      triangulos: this.renderer.info.render.triangles,
      llamadas: this.renderer.info.render.calls,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  estadisticasModelo() {
    return this.modelo.estadisticas();
  }

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.renderer.setAnimationLoop(null);
    this.observador?.disconnect();
    this.modelo.liberar();
    this.quitarEntorno();
    this.fondoTex?.dispose();
    this.fondoTex = null;
    this.renderer.dispose();
    this.lienzo.remove();
  }

  private ajustarTamano(): void {
    const w = Math.max(1, this.contenedor.clientWidth);
    const h = Math.max(1, this.contenedor.clientHeight);
    this.renderer.setSize(w, h, true);
    if (this.entornoFondo) cubrir(this.entornoFondo, w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  private frame(t: number): void {
    const fpsMax = this.op.fpsMax ?? 0;
    if (fpsMax > 0 && t - this.ultimoRender < 1000 / fpsMax - 2) return;
    this.ultimoRender = t;
    if (this.t0 === null) this.t0 = t;
    const info = this.motor.paso(t);
    this.modelo.mallasVisemas.forEach((m, i) => aplicarPesos(m, info.pesos, this.esquemas[i]));
    this.modelo.fijarMandibula?.(articulacionMezclada(info.pesos).mandibula);
    this.modelo.animarOcio(t - this.t0);
    this.renderer.render(this.escena, this.camara);
    this.medidor.registrar(t);
    this.op.alFrame?.(info);
  }
}
