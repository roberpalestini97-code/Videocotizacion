import { describe, expect, it } from "vitest";
import {
  LARGO_ENCABEZADO,
  MAX_CARGA,
  TIPO_TRAMA,
  armarTrama,
  crearEventoCliente,
  leerEncabezado,
  parsearEventoServidor,
} from "./protocolo";
import { PIZARRON_VACIO, aplicarPizarron, camposVisibles, esCampoDeMonto } from "./pizarron";

const sobre = (tipo: string, datos: unknown, extra: object = {}) =>
  JSON.stringify({ v: 1, tipo, seq: 1, ts: "2026-10-10T12:00:00Z", datos, ...extra });

describe("eventos del servidor", () => {
  it("acepta avatar.respuesta y limpia < > y controles (nunca HTML)", () => {
    const e = parsearEventoServidor(sobre("avatar.respuesta", { turno: 1, texto: "Hola <b>che</b>\u0007 qué tal", clip_id: "clip_saludo" }));
    expect(e).toMatchObject({ tipo: "avatar.respuesta", datos: { turno: 1, clip_id: "clip_saludo" } });
    expect(e && "texto" in e.datos && e.datos.texto).toBe("Hola b che /b qué tal");
  });
  it("ignora clip_id con forma inválida", () => {
    const e = parsearEventoServidor(sobre("avatar.respuesta", { turno: 1, texto: "x", clip_id: "../x" }));
    expect(e && "clip_id" in e.datos).toBe(false);
  });
  it("descarta visemas fuera del set de 15", () => {
    const e = parsearEventoServidor(
      sobre("avatar.visemas", { turno: 2, items: [{ v: "aa", t_ms: 0, d_ms: 80 }, { v: "ZZ", t_ms: 80, d_ms: 80 }] }),
    );
    expect(e && e.tipo === "avatar.visemas" && e.datos.items).toEqual([{ v: "aa", t_ms: 0, d_ms: 80 }]);
  });
  it("rechaza JSON roto, versión distinta, tipo desconocido y mensajes enormes", () => {
    expect(parsearEventoServidor("{")).toBeNull();
    expect(parsearEventoServidor(sobre("avatar.respuesta", { turno: 1, texto: "x" }, { v: 2 }))).toBeNull();
    expect(parsearEventoServidor(sobre("evento.nuevo", {}))).toBeNull();
    expect(parsearEventoServidor(sobre("avatar.respuesta", { turno: "1", texto: "x" }))).toBeNull();
    expect(parsearEventoServidor("x".repeat(20_000))).toBeNull();
  });
  it("cotizacion.emitida exige cotización y derivación con forma mínima", () => {
    expect(parsearEventoServidor(sobre("cotizacion.emitida", { cotizacion: {}, derivacion: {} }))).toBeNull();
    const ok = parsearEventoServidor(
      sobre("cotizacion.emitida", {
        cotizacion: { total_centavos: 100, items: [] },
        derivacion: { url_wa_me: "https://wa.me/5492236000000?text=VC", codigo_referencia: "VC-AAAA-BBBBBB" },
      }),
    );
    expect(ok?.tipo).toBe("cotizacion.emitida");
  });
  it("arma eventos del cliente con sobre común", () => {
    const j = JSON.parse(crearEventoCliente("texto.enviar", { texto: "hola" }, 3, new Date("2026-10-10T00:00:00Z")));
    expect(j).toEqual({ v: 1, tipo: "texto.enviar", seq: 3, ts: "2026-10-10T00:00:00.000Z", datos: { texto: "hola" } });
  });
});

describe("encabezado binario de 20 bytes", () => {
  it("arma y lee VC, versión 1, tipo 0x10, big-endian", () => {
    const carga = Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    const t = armarTrama(TIPO_TRAMA.fotograma_jpeg, carga, 7, 3000);
    expect(t.byteLength).toBe(LARGO_ENCABEZADO + 6);
    expect([...t.slice(0, 4)]).toEqual([0x56, 0x43, 1, 0x10]);
    expect([...t.slice(5, 8)]).toEqual([0, 0, 0]);
    expect(leerEncabezado(t)).toEqual({ version: 1, tipo: 0x10, flags: 0, seq: 7, ts_ms: 3000, longitud: 6 });
    expect([...t.slice(8, 12)]).toEqual([0, 0, 0, 7]);
    expect([...t.slice(LARGO_ENCABEZADO)]).toEqual([...carga]);
  });
  it("no deja armar una carga de más de 131072 bytes", () => {
    expect(() => armarTrama(0x10, new Uint8Array(MAX_CARGA + 1), 0, 0)).toThrow(RangeError);
    expect(armarTrama(0x10, new Uint8Array(MAX_CARGA), 0, 0).byteLength).toBe(MAX_CARGA + 20);
  });
  it("leerEncabezado rechaza basura", () => {
    expect(leerEncabezado(new Uint8Array(10))).toBeNull();
    expect(leerEncabezado(new Uint8Array(30))).toBeNull();
  });
});

describe("pizarrón en vivo", () => {
  const campo = (clave: string, valor: string, estado: "anotado" | "faltante" = "anotado") => ({
    clave,
    etiqueta: clave,
    valor,
    estado,
  });
  it("aplica versiones crecientes y descarta las viejas o repetidas", () => {
    const p1 = aplicarPizarron(PIZARRON_VACIO, 1, [campo("oficio", "pintura")]);
    expect(p1.version).toBe(1);
    const p2 = aplicarPizarron(p1, 2, [campo("oficio", "pintura"), campo("zona", "Cobo")]);
    expect(p2.campos).toHaveLength(2);
    expect(aplicarPizarron(p2, 2, [])).toBe(p2); // reenvío tras reconectar
    expect(aplicarPizarron(p2, 1, [])).toBe(p2);
  });
  it("nunca muestra montos aunque el servidor los mande", () => {
    const p = aplicarPizarron(PIZARRON_VACIO, 1, [
      campo("oficio", "pintura"),
      campo("precio_estimado", "algo"),
      campo("nota", "sale $ 45000"),
      campo("tarea", "pintar 24 m2"),
    ]);
    expect(p.campos.map((c) => c.clave)).toEqual(["oficio", "tarea"]);
    expect(esCampoDeMonto({ clave: "total", valor: "x" })).toBe(true);
    expect(esCampoDeMonto({ clave: "superficie", valor: "24 m2" })).toBe(false);
  });
  it("separa lo anotado de lo que falta", () => {
    const p = aplicarPizarron(PIZARRON_VACIO, 1, [campo("oficio", "pintura"), campo("altura", "?", "faltante")]);
    const v = camposVisibles(p);
    expect(v.anotados).toHaveLength(1);
    expect(v.faltantes).toHaveLength(1);
  });
});
