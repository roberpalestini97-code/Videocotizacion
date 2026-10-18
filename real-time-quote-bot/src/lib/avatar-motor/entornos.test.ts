import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENTORNOS, cubrir } from "./entornos";
import { entornoDeAvatar } from "./valid-avatars/catalogo";

describe("entornos de los avatares (T46)", () => {
  it("cada asesor demo tiene su lugar: Laura y Juan en la oficina, Tito en la plaza", () => {
    expect(entornoDeAvatar("av_valid_laura")?.id).toBe("oficina");
    expect(entornoDeAvatar("av_valid_juan")?.id).toBe("oficina");
    expect(entornoDeAvatar("av_valid_tito")?.id).toBe("plaza");
    expect(entornoDeAvatar("av_obrero_casco")).toBeNull();
  });

  it("los archivos del entorno se sirven desde public/entornos", () => {
    for (const e of Object.values(ENTORNOS)) {
      expect(e.url).toMatch(/^\/entornos\/.+\.hdr$/);
      expect(e.fondo).toMatch(/^\/entornos\/.+\.jpg$/);
    }
  });

  it("cubrir recorta el fondo cuadrado sin deformarlo (lienzo apaisado y vertical)", () => {
    const t = new THREE.Texture();
    t.image = { width: 1024, height: 1024 };
    cubrir(t, 800, 400);
    expect(t.repeat.x).toBe(1);
    expect(t.repeat.y).toBeCloseTo(0.5);
    expect(t.offset.y).toBeCloseTo(0.25);
    cubrir(t, 300, 600);
    expect(t.repeat.x).toBeCloseTo(0.5);
    expect(t.repeat.y).toBe(1);
    expect(t.offset.x).toBeCloseTo(0.25);
  });
});
