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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EventoAvatarVisemas } from './contrato/eventos';
import type { RelojAudio } from './visemas/reloj';
import { MotorVisemas, type InfoFrame } from './visemas/motor';
import type { OpcionesSincronizador, ResultadoRecepcion } from './visemas/sincronizador';
import type { OpcionesSuavizado } from './visemas/suavizado';
import { aplicarPesos, detectarEsquema, type EsquemaBlendshapes } from './modelo/blendshapes';
import { crearModeloProcedural, type ModeloAvatar } from './modelo/procedural';
import { cargarModeloGLB } from './modelo/glb';
import { agregarCascoObra, encuadrarRetrato } from './modelo/obrero';
import { MedidorFrames } from './medicion/frames';

export type Calidad = 'baja' | 'media' | 'alta';

export interface OpcionesAvatar3D {
  reloj: RelojAudio;
  /** Modelo a usar; por defecto el procedural. Para GLB: `await cargarModeloGLB(url)` (T30). */
  modelo?: ModeloAvatar;
  /**
   * URL de un GLB humano con blendshapes (Ready Player Me, etc.). Se carga en segundo plano:
   * arranca con el procedural y, cuando el GLB está listo, lo reemplaza en caliente. Si falla
   * (red, sin visemas, sin WebGL) se queda con el procedural. Para RPM basta el link "pelado".
   */
  modeloUrl?: string;
  /** Agregar casco de obra sobre el GLB (identidad de obra que RPM no trae). Por defecto true. */
  casco?: boolean;
  calidad?: Calidad;
  /** Tope de fps (ahorro de batería en gama baja). 0 = sin tope. */
  fpsMax?: number;
  sincronizador?: OpcionesSincronizador;
  suavizado?: OpcionesSuavizado;
  /** Se llama en cada frame renderizado (medición). */
  alFrame?: (info: InfoFrame) => void;
  /** Se llama cuando el GLB termina de cargar (true) o falla y queda el procedural (false). */
  alCambiarModelo?: (ok: boolean, detalle?: unknown) => void;
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
  private esProcedural = true;

  constructor(private readonly contenedor: HTMLElement, private readonly op: OpcionesAvatar3D) {
    this.lienzo = document.createElement('canvas');
    this.lienzo.setAttribute('role', 'img');
    this.lienzo.setAttribute('aria-label', op.descripcionAccesible ?? 'Asistente con casco de obra que habla');
    const calidad = op.calidad ?? 'media';
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.lienzo,
        antialias: calidad !== 'baja',
        alpha: true,
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

    // Iluminación de estudio: ambiente PBR (reflejos suaves) + key / fill / contraluz.
    // Da volumen y piel creíble al GLB realista; también mejora el procedural.
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch {
      /* algunos entornos sin float textures: seguimos solo con luces directas */
    }
    this.escena.add(new THREE.HemisphereLight(0xfff4e0, 0x3a4252, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.8, 2.2, 3.2);
    const relleno = new THREE.DirectionalLight(0xdfe8ff, 0.55);
    relleno.position.set(-2.4, 0.4, 2.2);
    const contra = new THREE.DirectionalLight(0xbcd3ff, 0.9);
    contra.position.set(-1.2, 2.0, -2.6);
    this.escena.add(key, relleno, contra);

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

    if (op.modeloUrl && !op.modelo) void this.cargarGlb(op.modeloUrl);
  }

  /** Carga el GLB en segundo plano y lo reemplaza en caliente; si falla, se queda el procedural. */
  private async cargarGlb(url: string): Promise<void> {
    try {
      const glb = await cargarModeloGLB(url);
      if (this.destruido) {
        glb.liberar();
        return;
      }
      this.usarModelo(glb);
      this.esProcedural = false;
      const caja = new THREE.Box3().setFromObject(glb.raiz);
      const altura = Math.max(caja.max.y - caja.min.y, 1e-3);
      if ((this.op.casco ?? true)) {
        try {
          agregarCascoObra(glb.raiz, { radioCabeza: altura * 0.052, segmentos: this.op.calidad === 'baja' ? 16 : 28 });
        } catch {
          /* rig inesperado: seguimos sin casco antes que romper el render */
        }
      }
      encuadrarRetrato(glb.raiz, this.camara);
      this.lienzo.setAttribute('aria-label', this.op.descripcionAccesible ?? 'Asesora con casco de obra que habla');
      this.op.alCambiarModelo?.(true);
    } catch (e) {
      this.op.alCambiarModelo?.(false, e);
    }
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

  /** true mientras se usa el modelo procedural (aún no cargó el GLB o falló). */
  get usandoProcedural(): boolean {
    return this.esProcedural;
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
    this.escena.environment?.dispose();
    this.renderer.dispose();
    this.lienzo.remove();
  }

  private ajustarTamano(): void {
    const w = Math.max(1, this.contenedor.clientWidth);
    const h = Math.max(1, this.contenedor.clientHeight);
    this.renderer.setSize(w, h, true);
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
    this.modelo.animarOcio(t - this.t0);
    this.renderer.render(this.escena, this.camara);
    this.medidor.registrar(t);
    this.op.alFrame?.(info);
  }
}
