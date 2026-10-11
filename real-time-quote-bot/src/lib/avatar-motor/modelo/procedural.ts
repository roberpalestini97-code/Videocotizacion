// @ts-nocheck — copia del spike T07 (avatar-spike). El typecheck vive allá.
/**
 * Modelo PROCEDURAL propio (sin licencias de terceros): cabeza simple de trabajador con casco
 * de obra y chaleco. Los blendshapes de la boca se generan por código a partir de FORMAS
 * (15 morph targets `viseme_<v>`, relativos). Es un placeholder de T07; el modelo final es T30.
 *
 * Todo lo de este archivo corre en Node (no necesita WebGL): crea geometrías y materiales,
 * no renderiza.
 */
import * as THREE from 'three';
import { VISEMAS } from '../contrato/eventos';
import { FORMAS, NOMBRE_BLENDSHAPE, type Articulacion } from './formas';
import type { MallaConMorphs } from './blendshapes';

export const BOCA = { rx: 0.16, ry: 0.07, apertura: 0.17 } as const;

export type Deformador = (x: number, y: number, z: number, a: Articulacion) => [number, number, number];

const c01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Deformación de labios e interior de boca (coordenadas locales de la boca, centro en 0,0,0). */
export const deformarBoca: Deformador = (x, y, z, a) => {
  const abajo = c01(0.5 - y / (2 * BOCA.ry)); // 1 en el labio inferior, 0 en el superior
  let nx = x * (1 + 0.35 * a.ancho) * (1 - 0.4 * a.redondez);
  let ny = y * (1 + 0.25 * a.redondez) * (1 - 0.85 * a.presion);
  let nz = z + 0.05 * a.redondez * (1 - Math.min(1, Math.abs(x) / BOCA.rx) * 0.5) + 0.01 * a.presion;
  ny -= BOCA.apertura * a.mandibula * abajo;
  ny += 0.035 * a.labioInferior * abajo;
  nz -= 0.02 * a.labioInferior * abajo;
  if (!Number.isFinite(nx)) nx = x;
  return [nx, ny, nz];
};

export const deformarLengua: Deformador = (x, y, z, a) => [
  x,
  y - BOCA.apertura * 0.75 * a.mandibula,
  z + 0.09 * a.lengua,
];

export const deformarMenton: Deformador = (x, y, z, a) => [x, y - BOCA.apertura * a.mandibula, z];

/**
 * Agrega a la geometría los 15 morph targets relativos (`morphTargetsRelative = true`).
 * El orden de morphAttributes.position es el de VISEMAS.
 */
export function agregarMorphsVisemas(geo: THREE.BufferGeometry, deformar: Deformador): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const lista: THREE.BufferAttribute[] = [];
  for (const v of VISEMAS) {
    const a = FORMAS[v];
    const delta = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const [nx, ny, nz] = deformar(x, y, z, a);
      delta[i * 3] = nx - x;
      delta[i * 3 + 1] = ny - y;
      delta[i * 3 + 2] = nz - z;
    }
    const attr = new THREE.Float32BufferAttribute(delta, 3);
    attr.name = NOMBRE_BLENDSHAPE(v);
    lista.push(attr);
  }
  geo.morphAttributes.position = lista;
  geo.morphTargetsRelative = true;
  return geo;
}

export interface ModeloAvatar {
  raiz: THREE.Object3D;
  /** Mallas que reciben pesos de visemas. */
  mallasVisemas: (THREE.Mesh & MallaConMorphs)[];
  /** Animación ociosa (parpadeo, balanceo); t en ms. */
  animarOcio(tMs: number): void;
  /** Libera geometrías y materiales. */
  liberar(): void;
  /** Datos para el informe: triángulos, mallas, morphs. */
  estadisticas(): { triangulos: number; mallas: number; morphTargets: number };
}

/** Parpadeo: 0 = abierto, 1 = cerrado. Cada ~3,7 s, 150 ms; doble parpadeo cada 4 ciclos. */
export function parpadeo(tMs: number, periodoMs = 3700, duracionMs = 150): number {
  if (!Number.isFinite(tMs) || tMs < 0) return 0;
  const ciclo = Math.floor(tMs / periodoMs);
  let fase = tMs - ciclo * periodoMs;
  if (ciclo % 4 === 3 && fase > duracionMs + 120) fase -= duracionMs + 120;
  if (fase >= duracionMs) return 0;
  const x = fase / duracionMs;
  return 1 - Math.abs(2 * x - 1);
}

function contarTriangulos(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
}

export interface OpcionesProcedural {
  /** 'baja' reduce segmentos (equipos modestos). */
  detalle?: 'baja' | 'media';
}

export function crearModeloProcedural(op: OpcionesProcedural = {}): ModeloAvatar {
  const bajo = op.detalle === 'baja';
  const seg = bajo ? 16 : 28;
  const raiz = new THREE.Group();
  raiz.name = 'avatar_procedural';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
    mats.push(m);
    return m;
  };
  const malla = (g: THREE.BufferGeometry, m: THREE.Material, nombre: string): THREE.Mesh => {
    geos.push(g);
    const me = new THREE.Mesh(g, m);
    me.name = nombre;
    return me;
  };

  const piel = mat(0xc89070);
  const cabezaPivote = new THREE.Group();
  cabezaPivote.name = 'cabeza';
  raiz.add(cabezaPivote);

  // Cabeza
  const cabeza = malla(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), piel, 'craneo');
  cabeza.scale.set(0.85, 1.05, 0.9);
  cabezaPivote.add(cabeza);

  // Orejas, nariz
  for (const s of [-1, 1]) {
    const oreja = malla(new THREE.SphereGeometry(0.16, 10, 8), piel, `oreja_${s}`);
    oreja.scale.set(0.5, 1, 0.8);
    oreja.position.set(0.84 * s, -0.05, 0);
    cabezaPivote.add(oreja);
  }
  const nariz = malla(new THREE.ConeGeometry(0.09, 0.28, 10), piel, 'nariz');
  nariz.rotation.x = Math.PI / 2;
  nariz.position.set(0, -0.12, 0.9);
  cabezaPivote.add(nariz);

  // Ojos (grupo que se escala en Y para parpadear) y cejas
  const ojos = new THREE.Group();
  ojos.name = 'ojos';
  const blanco = mat(0xf4f1ea, { roughness: 0.4 });
  const pupila = mat(0x2b1d14, { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const ojo = malla(new THREE.SphereGeometry(0.1, 12, 10), blanco, `ojo_${s}`);
    ojo.position.set(0.29 * s, 0.12, 0.76);
    const p = malla(new THREE.SphereGeometry(0.05, 10, 8), pupila, `pupila_${s}`);
    p.position.set(0.29 * s, 0.12, 0.85);
    ojos.add(ojo, p);
    const ceja = malla(new THREE.BoxGeometry(0.24, 0.04, 0.05), mat(0x3a2618), `ceja_${s}`);
    ceja.position.set(0.29 * s, 0.3, 0.8);
    ceja.rotation.z = -0.12 * s;
    cabezaPivote.add(ceja);
  }
  cabezaPivote.add(ojos);

  // Boca con blendshapes
  const boca = new THREE.Group();
  boca.name = 'boca';
  boca.position.set(0, -0.45, 0.8);
  cabezaPivote.add(boca);

  const geoLabios = new THREE.TorusGeometry(1, 0.22, bajo ? 6 : 8, bajo ? 24 : 36);
  geoLabios.scale(BOCA.rx, BOCA.ry * 1.05, 0.15);
  agregarMorphsVisemas(geoLabios, deformarBoca);
  const labios = malla(geoLabios, mat(0xa0524a, { roughness: 0.55 }), 'labios');
  boca.add(labios);

  const geoInterior = new THREE.CircleGeometry(1, bajo ? 24 : 36);
  geoInterior.scale(BOCA.rx * 0.95, BOCA.ry * 0.9, 1);
  geoInterior.translate(0, 0, -0.012);
  agregarMorphsVisemas(geoInterior, deformarBoca);
  const interior = malla(geoInterior, mat(0x2a0f0f, { roughness: 1 }), 'interior_boca');
  boca.add(interior);

  const dientes = malla(new THREE.BoxGeometry(0.2, 0.035, 0.02), mat(0xf2efe6, { roughness: 0.3 }), 'dientes');
  dientes.position.set(0, BOCA.ry * 0.35, -0.005);
  boca.add(dientes);

  const geoLengua = new THREE.SphereGeometry(0.075, 12, 8);
  geoLengua.scale(1, 0.45, 1);
  geoLengua.translate(0, -0.025, -0.03);
  agregarMorphsVisemas(geoLengua, deformarLengua);
  const lengua = malla(geoLengua, mat(0xc0605a, { roughness: 0.6 }), 'lengua');
  boca.add(lengua);

  const geoMenton = new THREE.SphereGeometry(0.2, 14, 10);
  geoMenton.scale(1.1, 0.55, 0.6);
  geoMenton.translate(0, -0.2, -0.02);
  agregarMorphsVisemas(geoMenton, deformarMenton);
  const menton = malla(geoMenton, piel, 'menton');
  boca.add(menton);

  // Casco de obra (amarillo): calota, ala y cresta
  const amarillo = mat(0xf2b705, { roughness: 0.45 });
  const calota = malla(new THREE.SphereGeometry(1.0, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), amarillo, 'casco_calota');
  calota.scale.set(0.95, 0.85, 1.0);
  calota.position.y = 0.28;
  const ala = malla(new THREE.CylinderGeometry(1.12, 1.12, 0.05, seg), amarillo, 'casco_ala');
  ala.scale.set(0.95, 1, 1.12);
  ala.position.set(0, 0.29, 0.12);
  const cresta = malla(new THREE.TorusGeometry(0.86, 0.07, 6, seg, Math.PI), amarillo, 'casco_cresta');
  cresta.rotation.y = Math.PI / 2;
  cresta.position.y = 0.3;
  cabezaPivote.add(calota, ala, cresta);

  // Cuello y torso con chaleco reflectivo
  const cuello = malla(new THREE.CylinderGeometry(0.35, 0.42, 0.6, 14), piel, 'cuello');
  cuello.position.y = -1.15;
  const chaleco = malla(new THREE.CylinderGeometry(1.05, 1.45, 1.6, bajo ? 14 : 20), mat(0xff6a13, { roughness: 0.8 }), 'chaleco');
  chaleco.position.y = -2.1;
  const gris = mat(0xd9dde0, { roughness: 0.25, metalness: 0.4 });
  for (const y of [-1.8, -2.4]) {
    const r = 1.05 + ((y + 1.3) / -1.6) * 0.4;
    const banda = malla(new THREE.CylinderGeometry(r + 0.012, r + 0.03, 0.12, bajo ? 14 : 20, 1, true), gris, 'banda');
    banda.position.y = y;
    raiz.add(banda);
  }
  raiz.add(cuello, chaleco);

  const mallasVisemas = [labios, interior, lengua, menton] as (THREE.Mesh & MallaConMorphs)[];
  for (const m of mallasVisemas) m.updateMorphTargets();

  return {
    raiz,
    mallasVisemas,
    animarOcio(tMs: number) {
      const b = parpadeo(tMs);
      ojos.scale.y = 1 - 0.9 * b;
      ojos.position.y = 0.12 * 0.9 * b; // compensa el centro del grupo para que bajen los párpados
      cabezaPivote.rotation.y = 0.06 * Math.sin(tMs / 2300);
      cabezaPivote.rotation.x = 0.025 * Math.sin(tMs / 1700);
    },
    liberar() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
    estadisticas() {
      return {
        triangulos: geos.reduce((s, g) => s + contarTriangulos(g), 0),
        mallas: geos.length,
        morphTargets: mallasVisemas.reduce((s, m) => s + (m.morphTargetInfluences?.length ?? 0), 0),
      };
    },
  };
}
