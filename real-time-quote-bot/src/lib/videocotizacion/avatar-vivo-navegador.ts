/**
 * Motores reales del navegador: Avatar3D (three.js) y AvatarClips (lienzo).
 * Solo se importa desde crearControlador (cliente).
 */
import { Avatar3D, ErrorSinWebGL } from "../avatar-motor/Avatar3D";
import { AvatarClips } from "../avatar-motor/clips/AvatarClips";
import { catalogoPlaceholder } from "../avatar-motor/clips/ColaClips";
import { cargarModeloGLB } from "../avatar-motor/modelo/glb";
import { entornoDeAvatar, urlGlbValid } from "../avatar-motor/valid-avatars/catalogo";
import { AvatarVivo } from "./avatar-vivo";

const CSS_ID = "vc-avatar-motor-css";
const CSS = `[data-testid="avatar"]{background:radial-gradient(ellipse 70% 60% at 50% 42%,#6a6a6a 0%,#3a3a3a 40%,#1a1a1a 75%,#0e0e0e 100%)}
[data-testid="avatar"] canvas{display:block;width:100%;height:100%}
.vc-clips{position:absolute;inset:0}
.vc-clips canvas,.vc-clips video{width:100%;height:100%;object-fit:cover;display:block}
.vc-clips-subtitulo{position:absolute;bottom:4.5rem;left:.75rem;right:.75rem;margin:0;color:#fff;font:600 .85rem/1.3 system-ui,sans-serif;text-align:center;text-shadow:0 1px 4px #0008}`;

function asegurarEstilos(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.append(s);
}

function marcarModelo(el: HTMLElement, tipo: "procedural" | "glb" | "glb-pendiente"): void {
  el.dataset['avatarModelo'] = tipo;
}

export function crearAvatarVivo(): AvatarVivo {
  return new AvatarVivo({
    intentar3d: (el, op) => {
      asegurarEstilos();
      const av = new Avatar3D(el, {
        reloj: op.reloj,
        descripcionAccesible: op.descripcion,
        alFrame: (info) => op.alFrame({ dominante: info.dominante }),
        calidad: "media",
        fpsMax: 30,
      });
      av.lienzo.style.display = "block";
      av.lienzo.style.width = "100%";
      av.lienzo.style.height = "100%";

      const entorno = entornoDeAvatar(op.avatarId);
      if (entorno)
        void av.usarEntorno(entorno).catch((err) => {
          console.warn("[avatar] no se pudo cargar el entorno; queda el fondo liso:", err);
        });

      const url = urlGlbValid(op.avatarId);
      if (url) {
        marcarModelo(el, "glb-pendiente");
        void cargarModeloGLB(url)
          .then((modelo) => {
            av.usarModelo(modelo);
            marcarModelo(el, "glb");
          })
          .catch((err) => {
            console.warn("[avatar] no se pudo cargar GLB VALID:", err);
            marcarModelo(el, "procedural");
          });
      } else {
        marcarModelo(el, "procedural");
      }

      return {
        recibirVisemas(turno, items, seq) {
          av.recibirVisemas({
            v: 1,
            tipo: "avatar.visemas",
            seq,
            ts: new Date().toISOString(),
            datos: { turno, items },
          });
        },
        iniciarTurno: (t, ms) => av.iniciarTurno(t, ms),
        cortar: () => av.cortar(),
        destruir: () => av.destruir(),
      };
    },
    intentarClips: (el) => {
      asegurarEstilos();
      const av = new AvatarClips(el, { catalogo: catalogoPlaceholder() });
      return {
        recibirRespuesta(turno, texto, clipId) {
          av.recibirRespuesta({
            v: 1,
            tipo: "avatar.respuesta",
            seq: turno,
            ts: new Date().toISOString(),
            datos: { turno, texto, ...(clipId ? { clip_id: clipId } : {}) },
          });
        },
        interrumpir: () => av.interrumpir(),
        destruir: () => av.destruir(),
      };
    },
    esSinWebGL: (e) => e instanceof ErrorSinWebGL,
  });
}
