import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  aplicarPoseBrazosValid,
  capturarPoseBrazosValid,
  encuadrarValid,
} from "./glb";

function escenaMixamoFake(): THREE.Group {
  const raiz = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  const spine = new THREE.Bone();
  spine.name = "Spine";
  const spine1 = new THREE.Bone();
  spine1.name = "Spine1";
  const leftArm = new THREE.Bone();
  leftArm.name = "LeftArm";
  const rightArm = new THREE.Bone();
  rightArm.name = "RightArm";
  const leftFore = new THREE.Bone();
  leftFore.name = "LeftForeArm";
  const rightFore = new THREE.Bone();
  rightFore.name = "RightForeArm";

  hips.add(spine);
  spine.add(spine1);
  spine1.add(leftArm);
  spine1.add(rightArm);
  leftArm.add(leftFore);
  rightArm.add(rightFore);
  raiz.add(hips);

  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3));
  cuerpo.position.y = 0.9;
  raiz.add(cuerpo);
  return raiz;
}

describe("pose VALID", () => {
  it("aplica deltas por quaternion sin tocar Spine", () => {
    const raiz = escenaMixamoFake();
    const spine = raiz.getObjectByName("Spine") as THREE.Bone;
    spine.quaternion.setFromEuler(new THREE.Euler(0.5, 0.2, 0.1));
    const spineAntes = spine.quaternion.clone();
    const pose = capturarPoseBrazosValid(raiz);
    expect(pose).not.toBeNull();
    const left = pose!.leftArm.quaternion.clone();
    // Simular reset al bind (como el skin a veces hace).
    pose!.leftArm.quaternion.copy(pose!.bindLeftArm);
    pose!.rightArm.quaternion.copy(pose!.bindRightArm);
    aplicarPoseBrazosValid(pose!);
    expect(pose!.leftArm.quaternion.equals(left)).toBe(true);
    expect(pose!.leftArm.quaternion.equals(pose!.bindLeftArm)).toBe(false);
    expect(spine.quaternion.equals(spineAntes)).toBe(true);
  });

  it("encuadra sin girar 180°", () => {
    const raiz = escenaMixamoFake();
    encuadrarValid(raiz);
    expect(raiz.rotation.y).toBe(0);
    expect(raiz.scale.y).toBeGreaterThan(0.5);
  });
});
