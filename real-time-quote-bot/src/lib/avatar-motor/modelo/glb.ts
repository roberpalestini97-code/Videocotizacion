// @ts-nocheck — portado del spike T07/T30 (avatar-spike/src/modelo/glb.ts).
/**
 * Carga GLB con blendshapes: viseme_* (Oculus/RPM), ARKit o VALID (`h_expressions.*`).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { detectarEsquema, type MallaConMorphs } from './blendshapes';
import { parpadeo, type ModeloAvatar } from './procedural';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export function mallasConVisemas(raiz: THREE.Object3D): (THREE.Mesh & MallaConMorphs)[] {
  const out: (THREE.Mesh & MallaConMorphs)[] = [];
  raiz.traverse((o) => {
    const m = o as THREE.Mesh & MallaConMorphs;
    if ((m as THREE.Mesh).isMesh && detectarEsquema(m)) out.push(m);
  });
  return out;
}

/** Huesos del esqueleto skinned (+ fallback isBone en el grafo). */
export function mapaHuesos(raiz: THREE.Object3D): Map<string, THREE.Bone> {
  const map = new Map<string, THREE.Bone>();
  raiz.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      for (const b of sm.skeleton.bones) {
        if (b.name) map.set(b.name, b);
      }
    }
    const b = o as THREE.Bone;
    if (b.isBone && b.name) map.set(b.name, b);
  });
  return map;
}

function huesoPorNombre(raiz: THREE.Object3D, nombre: string): THREE.Bone | null {
  return mapaHuesos(raiz).get(nombre) ?? null;
}

/** Deltas locales (quaternion) T-pose → brazos abajo. No tocar Spine/Hips. */
const Q_BRAZO_IZQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.05, 1.35));
const Q_BRAZO_DER = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.05, -1.35));
const Q_CODO_IZQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.45, 0));
const Q_CODO_DER = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, -0.45, 0));

export type PoseBrazosValid = {
  leftArm: THREE.Bone;
  rightArm: THREE.Bone;
  leftFore?: THREE.Bone;
  rightFore?: THREE.Bone;
  bindLeftArm: THREE.Quaternion;
  bindRightArm: THREE.Quaternion;
  bindLeftFore?: THREE.Quaternion;
  bindRightFore?: THREE.Quaternion;
};

/**
 * Guarda bind y aplica pose de reposo. Hay que reaplicar cada frame:
 * el skin a veces vuelve al bind si solo se setea una vez.
 */
export function capturarPoseBrazosValid(raiz: THREE.Object3D): PoseBrazosValid | null {
  const huesos = mapaHuesos(raiz);
  const leftArm = huesos.get('LeftArm');
  const rightArm = huesos.get('RightArm');
  if (!leftArm || !rightArm) return null;
  const leftFore = huesos.get('LeftForeArm');
  const rightFore = huesos.get('RightForeArm');
  const pose: PoseBrazosValid = {
    leftArm,
    rightArm,
    leftFore,
    rightFore,
    bindLeftArm: leftArm.quaternion.clone(),
    bindRightArm: rightArm.quaternion.clone(),
    bindLeftFore: leftFore?.quaternion.clone(),
    bindRightFore: rightFore?.quaternion.clone(),
  };
  aplicarPoseBrazosValid(pose);
  return pose;
}

export function aplicarPoseBrazosValid(pose: PoseBrazosValid): void {
  pose.leftArm.quaternion.copy(pose.bindLeftArm).multiply(Q_BRAZO_IZQ);
  pose.rightArm.quaternion.copy(pose.bindRightArm).multiply(Q_BRAZO_DER);
  if (pose.leftFore && pose.bindLeftFore) {
    pose.leftFore.quaternion.copy(pose.bindLeftFore).multiply(Q_CODO_IZQ);
  }
  if (pose.rightFore && pose.bindRightFore) {
    pose.rightFore.quaternion.copy(pose.bindRightFore).multiply(Q_CODO_DER);
  }
}

/** @deprecated usar capturarPoseBrazosValid */
export function poseReposoValid(raiz: THREE.Object3D): void {
  capturarPoseBrazosValid(raiz);
  raiz.updateMatrixWorld(true);
}

/**
 * Escala a ~1.7 m y centra la **cabeza** en el origen (plano busto tipo Meshy).
 * Mixamo VALID mira +Z (hacia la cámara). No girar 180°.
 */
export function encuadrarValid(raiz: THREE.Object3D): PoseBrazosValid | null {
  const poseBrazos = capturarPoseBrazosValid(raiz);
  raiz.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raiz);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 1e-6) return poseBrazos;
  const escala = 1.7 / size.y;
  raiz.scale.multiplyScalar(escala);
  raiz.updateMatrixWorld(true);

  const head = mapaHuesos(raiz).get('Head');
  const ancla = new THREE.Vector3();
  if (head) {
    head.getWorldPosition(ancla);
    // Un poco más abajo del cráneo → centro visual en ojos/nariz.
    ancla.y -= 0.04;
  } else {
    const box2 = new THREE.Box3().setFromObject(raiz);
    const size2 = box2.getSize(new THREE.Vector3());
    const center2 = box2.getCenter(new THREE.Vector3());
    ancla.set(center2.x, center2.y + size2.y * 0.32, center2.z);
  }
  raiz.position.sub(ancla);
  return poseBrazos;
}

export function modeloDesdeEscena(raiz: THREE.Object3D, opciones?: { encuadrarValid?: boolean }): ModeloAvatar {
  const poseBrazos = opciones?.encuadrarValid ? encuadrarValid(raiz) : null;
  const mallas = mallasConVisemas(raiz);
  const conParpadeoArkit = mallas.filter((m) => m.morphTargetDictionary && 'eyeBlinkLeft' in m.morphTargetDictionary);
  const conParpadeoValid = mallas.filter(
    (m) => m.morphTargetDictionary && 'h_expressions.ReyeClose_h' in m.morphTargetDictionary,
  );
  const mandibula = huesoPorNombre(raiz, 'Jaw') ?? huesoPorNombre(raiz, 'jaw');
  const rotMandibulaBase = mandibula ? mandibula.rotation.x : 0;
  let mandibulaObj = 0;
  const spine = huesoPorNombre(raiz, 'Spine1');
  const spineBind = spine ? spine.quaternion.clone() : null;
  const qRespira = new THREE.Quaternion();
  const eRespira = new THREE.Euler();
  const esValid = opciones?.encuadrarValid === true;

  return {
    raiz,
    mallasVisemas: mallas,
    animarOcio(tMs) {
      // Reaplicar brazos cada frame (si no, el mesh se queda en T-pose bind).
      if (poseBrazos) aplicarPoseBrazosValid(poseBrazos);
      const b = parpadeo(tMs);
      for (const m of conParpadeoArkit) {
        const d = m.morphTargetDictionary!;
        const inf = m.morphTargetInfluences!;
        for (const k of ['eyeBlinkLeft', 'eyeBlinkRight']) {
          const i = d[k];
          if (i !== undefined) inf[i] = b;
        }
      }
      for (const m of conParpadeoValid) {
        const d = m.morphTargetDictionary!;
        const inf = m.morphTargetInfluences!;
        for (const k of ['h_expressions.ReyeClose_h', 'h_expressions.LeyeClose_h']) {
          const i = d[k];
          if (i !== undefined) inf[i] = b;
        }
      }
      if (mandibula) {
        mandibula.rotation.x = rotMandibulaBase + mandibulaObj * 0.22;
      }
      if (esValid && spine && spineBind) {
        eRespira.set(Math.sin(tMs / 1800) * 0.02, 0, 0);
        qRespira.setFromEuler(eRespira);
        spine.quaternion.copy(spineBind).multiply(qRespira);
      }
    },
    /** Respaldo mandíbula cuando los morphs no alcanzan (VALID). */
    fijarMandibula(w: number) {
      mandibulaObj = w;
    },
    liberar() {
      raiz.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const ms = Array.isArray(m.material) ? m.material : [m.material];
        ms.forEach((x) => x.dispose());
      });
    },
    estadisticas() {
      let triangulos = 0;
      let mallasN = 0;
      raiz.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        mallasN++;
        const g = m.geometry;
        triangulos += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      });
      return {
        triangulos,
        mallas: mallasN,
        morphTargets: mallas.reduce((s, m) => s + (m.morphTargetInfluences?.length ?? 0), 0),
      };
    },
  };
}

function esValidGlb(raiz: THREE.Object3D): boolean {
  let valid = false;
  raiz.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name === 'H_DDS_HighRes') valid = true;
  });
  return valid;
}

/** Carga un GLB desde URL (mismo origen o CORS) y lo envuelve como ModeloAvatar. */
export async function cargarModeloGLB(url: string): Promise<ModeloAvatar> {
  const gltf = await loader.loadAsync(url);
  const encuadrar = esValidGlb(gltf.scene);
  const modelo = modeloDesdeEscena(gltf.scene, { encuadrarValid: encuadrar });
  if (modelo.mallasVisemas.length === 0) {
    modelo.liberar();
    throw new Error('El GLB no tiene morph targets viseme_*, ARKit (jawOpen) ni VALID (h_expressions)');
  }
  return modelo;
}

/** Igual que cargarModeloGLB pero desde bytes (pruebas). */
export async function cargarModeloGLBDesdeBytes(bytes: ArrayBuffer): Promise<ModeloAvatar> {
  const gltf = await loader.parseAsync(bytes, '');
  return modeloDesdeEscena(gltf.scene, { encuadrarValid: esValidGlb(gltf.scene) });
}
