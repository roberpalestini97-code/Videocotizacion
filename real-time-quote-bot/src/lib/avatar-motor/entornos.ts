/**
 * Entornos de los avatares (T46): el asesor aparece en un lugar real, como en una
 * videollamada, en vez de flotar sobre un degradé. Ver proyecto/docs/avatar/entornos.md.
 *
 * Todo sale de un HDRI de Poly Haven (CC0) copiado en public/entornos/:
 * - la luz de la escena, del .hdr de 1k;
 * - el fondo, de una vista en perspectiva del mismo lugar recortada del panorama en 8k
 *   y apenas desenfocada (scripts/generar-fondos-entornos.mjs). Con el plano de busto,
 *   el HDRI de 1k como fondo se veía como una mancha borrosa.
 */
import * as THREE from 'three';

export type IdEntorno = 'oficina' | 'plaza';

export type Entorno = {
  id: IdEntorno;
  /** HDRI equirectangular (solo luz y reflejos), servido desde public/. */
  url: string;
  /** Imagen de fondo (vista recortada del mismo lugar), servida desde public/. */
  fondo: string;
  /** Hacia dónde mira la cámara en el panorama (radianes): orienta la luz como el fondo. */
  rotacionY: number;
  /** Brillo de la luz y los reflejos que aporta el HDRI. */
  intensidadLuz: number;
  /** Factor sobre las luces de estudio (el HDRI ya ilumina). */
  luzEstudio: number;
  /** Respaldo detrás de los hombros para que se lea "sentado". */
  respaldo: 'silla' | null;
};

export const ENTORNOS: Record<IdEntorno, Entorno> = {
  oficina: {
    id: 'oficina',
    url: '/entornos/hotel_room.hdr',
    fondo: '/entornos/oficina.jpg',
    rotacionY: 0,
    intensidadLuz: 0.6,
    luzEstudio: 0.7,
    respaldo: 'silla',
  },
  plaza: {
    id: 'plaza',
    url: '/entornos/greenwich_park_02.hdr',
    fondo: '/entornos/plaza.jpg',
    rotacionY: Math.PI / 4,
    intensidadLuz: 0.6,
    luzEstudio: 0.65,
    respaldo: null,
  },
};

/**
 * Respaldo alto de silla de escritorio, en las coordenadas del encuadre de busto
 * (cabeza en el origen, ~1,7 m de alto): asoma detrás del cuello y los hombros.
 */
export function crearRespaldoSilla(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'respaldo-silla';
  const tela = new THREE.MeshStandardMaterial({ color: 0x2f3238, roughness: 0.95, metalness: 0 });
  const forma = new THREE.Shape();
  const w = 0.2;
  const r = 0.14;
  const abajo = -0.62;
  const arriba = -0.03;
  forma.moveTo(-w, abajo);
  forma.lineTo(w, abajo);
  forma.lineTo(w, arriba - r);
  forma.quadraticCurveTo(w, arriba, w - r, arriba);
  forma.lineTo(-w + r, arriba);
  forma.quadraticCurveTo(-w, arriba, -w, arriba - r);
  forma.lineTo(-w, abajo);
  const geo = new THREE.ExtrudeGeometry(forma, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 4,
    curveSegments: 10,
  });
  const respaldo = new THREE.Mesh(geo, tela);
  // Detrás de la espalda y apenas inclinado hacia atrás, como una silla de oficina.
  respaldo.position.set(0, 0, -0.2);
  respaldo.rotation.x = -0.08;
  g.add(respaldo);
  // Costura central: le da volumen al tapizado.
  const costura = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, arriba - abajo - 0.12, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 1 }),
  );
  costura.position.set(0, (arriba + abajo) / 2, -0.2 + 0.06 + 0.026);
  costura.rotation.x = -0.08;
  g.add(costura);
  return g;
}

/** Libera geometrías y materiales de un grupo creado acá. */
export function liberarGrupo(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/** Ajusta una textura de fondo cuadrada a "cover" para un lienzo de ancho/alto dado. */
export function cubrir(tex: THREE.Texture, ancho: number, alto: number): void {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const ai = img?.width && img?.height ? img.width / img.height : 1;
  const al = ancho / Math.max(1, alto);
  if (al > ai) {
    tex.repeat.set(1, ai / al);
    tex.offset.set(0, (1 - ai / al) / 2);
  } else {
    tex.repeat.set(al / ai, 1);
    tex.offset.set((1 - al / ai) / 2, 0);
  }
}
