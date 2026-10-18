// Recorta una vista en perspectiva de un panorama equirectangular (?src=&yaw=&pitch=&fov=&blur=)
// para usarla como fondo nítido del entorno (T46). La corre generar-fondos-entornos.mjs.
import * as THREE from "three";

const q = new URLSearchParams(location.search);
const w = window as unknown as { listo?: boolean; error?: string };
const c = document.getElementById("c")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(c.clientWidth, c.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
c.appendChild(renderer.domElement);
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(Number(q.get("fov") ?? 70), 1, 0.1, 10);
camara.rotation.order = "YXZ";
camara.rotation.y = THREE.MathUtils.degToRad(Number(q.get("yaw") ?? 0));
camara.rotation.x = THREE.MathUtils.degToRad(Number(q.get("pitch") ?? 0));
new THREE.TextureLoader()
  .loadAsync(q.get("src") ?? "")
  .then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    escena.background = t;
    renderer.render(escena, camara);
    // Desenfoque leve, como una cámara con foco en la persona.
    const px = Number(q.get("blur") ?? 0);
    if (px > 0) renderer.domElement.style.filter = `blur(${px}px)`;
    w.listo = true;
  })
  .catch((e) => (w.error = String(e)));
