import { describe, expect, it } from "vitest";
import { esValidAvatar, urlGlbValid, VALID_AVATARS_COMMIT } from "./catalogo";

describe("catalogo VALID", () => {
  it("resuelve los tres avatares demo", () => {
    expect(esValidAvatar("av_valid_laura")).toBe(true);
    const url = urlGlbValid("av_valid_laura");
    expect(url).toContain(VALID_AVATARS_COMMIT);
    expect(url).toMatch(/Hispanic_F_2_Util\.glb$/);
  });

  it("ignora ids legacy", () => {
    expect(urlGlbValid("av_pintora")).toBeNull();
  });
});
