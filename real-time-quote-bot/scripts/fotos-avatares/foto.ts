// Monta el mismo Avatar3D de la llamada con el GLB del asesor (?id=av_valid_...) para sacarle una foto.
import { Avatar3D } from "../../src/lib/avatar-motor/Avatar3D";
import { cargarModeloGLB } from "../../src/lib/avatar-motor/modelo/glb";
import { entornoDeAvatar, urlGlbValid } from "../../src/lib/avatar-motor/valid-avatars/catalogo";

const id = new URLSearchParams(location.search).get("id") ?? "";
const url = urlGlbValid(id);
const w = window as unknown as { listo?: boolean; error?: string };
if (!url) w.error = `sin GLB para ${id}`;
else {
  const av = new Avatar3D(document.getElementById("c")!, {
    reloj: { ahoraMs: () => performance.now() },
    calidad: "alta",
  });
  av.lienzo.style.width = "100%";
  av.lienzo.style.height = "100%";
  const q = new URLSearchParams(location.search);
  const base = entornoDeAvatar(id);
  // ?rot=&blur=&luz= para probar encuadres del entorno sin tocar el catálogo.
  const entorno = base && {
    ...base,
    ...(q.has("rot") ? { rotacionY: Number(q.get("rot")) } : {}),
    ...(q.has("blur") ? { desenfoque: Number(q.get("blur")) } : {}),
    ...(q.has("luz") ? { intensidadLuz: Number(q.get("luz")) } : {}),
  };
  Promise.all([cargarModeloGLB(url), entorno ? av.usarEntorno(entorno) : null])
    .then(([m]) => {
      av.usarModelo(m);
      // unos frames para que asiente la pose y el parpadeo no quede a mitad
      setTimeout(() => (w.listo = true), 1500);
    })
    .catch((e) => (w.error = String(e)));
}
