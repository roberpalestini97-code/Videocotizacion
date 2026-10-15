/**
 * Decoración "obrero" sobre un GLB humano realista (p. ej. Ready Player Me): le agrega un
 * CASCO de obra amarillo anclado al hueso de la cabeza y encuadra la cámara como un retrato
 * (cabeza + hombros). La cara, los visemas y el parpadeo los pone el GLB; esto solo suma la
 * identidad de obra que no viene en RPM.
 *
 * Todo corre en Node (geometrías/escena), no necesita WebGL: se puede testear sin GPU.
 * Los offsets dependen del rig del GLB; para RPM los valores por defecto quedan cerca y se
 * pueden ajustar con las opciones.
 */
import * as THREE from 'three';

/** Busca el primer objeto cuyo nombre matchea `re` (huesos incluidos). */
export function buscarObjeto(raiz: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let hallado: THREE.Object3D | null = null;
  raiz.traverse((o) => {
    if (!hallado && re.test(o.name)) hallado = o;
  });
  return hallado;
}

/** Hueso de la cabeza del rig (RPM/Mixamo lo llaman `Head`), sin tomar `HeadTop_End`. */
export function buscarCabeza(raiz: THREE.Object3D): THREE.Object3D | null {
  return buscarObjeto(raiz, /^(mixamorig)?head$/i) ?? buscarObjeto(raiz, /head$/i);
}

export interface OpcionesCasco {
  /** Radio aproximado de la cabeza en metros (RPM ≈ 0.095). */
  radioCabeza?: number;
  /** Color del casco (hex). */
  color?: number;
  /** Corrimiento local respecto del hueso de la cabeza (metros). */
  offset?: { x?: number; y?: number; z?: number };
  /** Segmentos de las geometrías (gama baja usa menos). */
  segmentos?: number;
}

/**
 * Agrega un casco de obra al modelo. Si encuentra el hueso de la cabeza, lo cuelga de ahí
 * (sigue los movimientos); si no, lo cuelga de la raíz a la altura estimada de la coronilla.
 * El grupo queda dentro de `raiz`, así `modeloDesdeEscena(...).liberar()` también lo libera.
 */
export function agregarCascoObra(raiz: THREE.Object3D, op: OpcionesCasco = {}): THREE.Group {
  const r = op.radioCabeza ?? 0.095;
  const color = op.color ?? 0xf2b705;
  const seg = op.segmentos ?? 28;
  const grupo = new THREE.Group();
  grupo.name = 'casco_obra';

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
  const malla = (g: THREE.BufferGeometry, nombre: string) => {
    const m = new THREE.Mesh(g, mat);
    m.name = nombre;
    return m;
  };

  // Calota (media esfera), ala, cresta y banda inferior.
  const calota = malla(
    new THREE.SphereGeometry(r * 1.18, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2),
    'casco_calota',
  );
  calota.scale.set(1.0, 0.92, 1.08);
  calota.position.y = r * 0.5;

  const ala = malla(new THREE.CylinderGeometry(r * 1.36, r * 1.42, r * 0.09, seg), 'casco_ala');
  ala.scale.set(1, 1, 1.12);
  ala.position.set(0, r * 0.46, r * 0.14);

  const cresta = malla(new THREE.TorusGeometry(r * 1.02, r * 0.09, 6, seg, Math.PI), 'casco_cresta');
  cresta.rotation.y = Math.PI / 2;
  cresta.position.y = r * 0.6;

  const banda = malla(new THREE.TorusGeometry(r * 1.16, r * 0.055, 8, seg), 'casco_banda');
  banda.rotation.x = Math.PI / 2;
  banda.position.y = r * 0.42;

  grupo.add(calota, ala, cresta, banda);

  const cabeza = buscarCabeza(raiz);
  grupo.position.set(op.offset?.x ?? 0, op.offset?.y ?? (cabeza ? r * 0.9 : 0), op.offset?.z ?? r * 0.08);
  (cabeza ?? raiz).add(grupo);
  return grupo;
}

export interface OpcionesEncuadre {
  /** FOV vertical de la cámara en grados (debe coincidir con la cámara real). */
  fovGrados?: number;
  /** Margen extra alrededor del encuadre (1 = justo, 1.25 = un poco de aire). */
  margen?: number;
  /** Porción vertical del modelo a encuadrar (0.33 ≈ cabeza + hombros). */
  porcionAltura?: number;
}

export interface Encuadre {
  mira: THREE.Vector3;
  distancia: number;
}

/**
 * Coloca la cámara como un retrato de cabeza + hombros del modelo y devuelve el punto de
 * mira (para re-aplicar `lookAt` tras un resize). Usa el hueso de la cabeza si existe; si no,
 * el tope de la bounding box. Modelo mirando hacia +Z (convención RPM).
 */
export function encuadrarRetrato(
  raiz: THREE.Object3D,
  camara: THREE.PerspectiveCamera,
  op: OpcionesEncuadre = {},
): Encuadre {
  raiz.updateWorldMatrix(true, true);
  const caja = new THREE.Box3().setFromObject(raiz);
  const centro = caja.getCenter(new THREE.Vector3());
  const tam = caja.getSize(new THREE.Vector3());
  const altura = Math.max(tam.y, 1e-3);

  const fov = ((op.fovGrados ?? camara.fov) * Math.PI) / 180;
  const porcion = op.porcionAltura ?? 0.34;
  const margen = op.margen ?? 1.22;
  const extension = altura * porcion;

  const cabeza = buscarCabeza(raiz);
  const topeY = cabeza ? cabeza.getWorldPosition(new THREE.Vector3()).y + altura * 0.06 : caja.max.y;
  const miraY = topeY - extension * 0.44;
  const mira = new THREE.Vector3(centro.x, miraY, centro.z);

  const distancia = (extension / 2 / Math.tan(fov / 2)) * margen;
  camara.position.set(centro.x, miraY + extension * 0.05, caja.max.z + distancia);
  camara.near = Math.max(0.01, distancia * 0.02);
  camara.far = distancia * 20 + 10;
  camara.updateProjectionMatrix();
  camara.lookAt(mira);
  return { mira, distancia };
}
