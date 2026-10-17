import { describe, expect, it } from "vitest";
import { aplicarPesos, detectarEsquema, pesosValid } from "./blendshapes";
import { pesosVacios } from "../visemas/interpolacion";

describe("blendshapes VALID", () => {
  it("detecta h_expressions", () => {
    const m = {
      morphTargetDictionary: { "h_expressions.MouthOpen_h": 0 },
      morphTargetInfluences: [0],
    };
    expect(detectarEsquema(m)).toBe("valid");
  });

  it("aplica boca abierta", () => {
    const p = pesosVacios();
    p.aa = 1;
    const m = {
      morphTargetDictionary: {
        "h_expressions.AE_AA_h": 0,
        "h_expressions.MouthOpen_h": 1,
      },
      morphTargetInfluences: [0, 0],
    };
    const r = aplicarPesos(m, p, "valid");
    expect(r.aplicados).toBeGreaterThan(0);
    expect(m.morphTargetInfluences![0]).toBeGreaterThan(0.5);
    expect(pesosValid(p)["h_expressions.MouthOpen_h"]).toBeGreaterThan(0);
  });
});
