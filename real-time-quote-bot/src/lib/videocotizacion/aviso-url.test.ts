import { describe, expect, it } from "vitest";
import { rutaLocalDelAviso } from "./aviso-url";

describe("rutaLocalDelAviso", () => {
  it("se queda con el path del aviso publicado en el contrato", () => {
    expect(
      rutaLocalDelAviso("https://cotizar.videocotizacion.local/privacidad/2026-10-08.1"),
    ).toBe("/privacidad/2026-10-08.1");
  });

  it("conserva consulta y ancla", () => {
    expect(rutaLocalDelAviso("https://cotizar.ejemplo/privacidad/2026-10-08.1?x=1#fin")).toBe(
      "/privacidad/2026-10-08.1?x=1#fin",
    );
  });

  it("no reescribe una URL que no es el aviso", () => {
    expect(rutaLocalDelAviso("https://www.argentina.gob.ar/aaip")).toBe(
      "https://www.argentina.gob.ar/aaip",
    );
    expect(rutaLocalDelAviso("no-es-url")).toBe("no-es-url");
  });
});
