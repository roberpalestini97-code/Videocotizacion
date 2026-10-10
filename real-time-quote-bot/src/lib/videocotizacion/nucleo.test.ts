import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClienteVC, urlSocketPermitida, urlWhatsAppPermitida } from "./cliente";
import { leerConfig, validarConfig } from "./config";
import { cerosIniciales, resolverDesafio } from "./desafio";
import { ErrorVC, MENSAJES_ERROR, mensajeError } from "./errores";

const ID_ENLACE = "RYZ4c3qAHifF6Rh4XEo3fG";
const ID_SESION = "ses_01HZX3K9Q8V7M2N4P5R6S7T8W9";
const DESAFIO = "dsf_" + "A".repeat(43);

function respuesta(status: number, cuerpo: unknown, cab: Record<string, string> = {}): Response {
  const esProblema = status >= 400;
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": esProblema ? "application/problem+json" : "application/json", ...cab },
  });
}

function cliente(f: typeof fetch, extra: Partial<ConstructorParameters<typeof ClienteVC>[0]> = {}) {
  return new ClienteVC({
    apiBase: "https://api.ejemplo.test/",
    clavePublica: "vc_pub_prueba",
    fetch: f,
    uuid: () => "uuid-fijo",
    ...extra,
  });
}

describe("config", () => {
  it("lee VITE_* y recorta la barra final", () => {
    const c = leerConfig({ VITE_VC_API_BASE: "https://api.x.test/", VITE_VC_CLAVE_PUBLICA: "vc_pub_a" });
    expect(c).toEqual({ apiBase: "https://api.x.test", clavePublica: "vc_pub_a", mock: false, enlaceDemo: undefined });
    expect(validarConfig(c)).toBeNull();
  });
  it("modo mock completa con valores locales no secretos", () => {
    const c = leerConfig({ VITE_VC_MOCK: "1", VITE_VC_ENLACE_DEMO: "abc" });
    expect(c.apiBase).toBe("http://localhost:8787");
    expect(c.clavePublica.startsWith("vc_pub_")).toBe(true);
    expect(c.enlaceDemo).toBe("abc");
  });
  it("sin variables y sin mock la config es inválida", () => {
    expect(validarConfig(leerConfig({}))).toMatch(/VITE_VC_API_BASE/);
    expect(validarConfig(leerConfig({ VITE_VC_API_BASE: "https://a.test" }))).toMatch(/CLAVE_PUBLICA/);
  });
  it("rechaza una clave secreta en el navegador", () => {
    const c = leerConfig({ VITE_VC_API_BASE: "https://a.test", VITE_VC_CLAVE_PUBLICA: "vc_sec_zzz" });
    expect(validarConfig(c)).toMatch(/SECRETA/);
  });
});

describe("desafío (prueba de trabajo)", () => {
  it("cuenta bits en cero iniciales", () => {
    expect(cerosIniciales(Uint8Array.from([0, 0, 0x10]))).toBe(19);
    expect(cerosIniciales(Uint8Array.from([0x80]))).toBe(0);
    expect(cerosIniciales(Uint8Array.from([0x01]))).toBe(7);
    expect(cerosIniciales(Uint8Array.from([0, 0]))).toBe(16);
  });
  it("resuelve `<desafio>.<nonce hex16>` que cumple la dificultad con SHA-256 real", async () => {
    const x = await resolverDesafio(DESAFIO, 12, { inicio: 0 });
    expect(x).toMatch(/^dsf_[A-Za-z0-9_-]{43}\.[0-9a-f]{16}$/);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
    expect(cerosIniciales(h)).toBeGreaterThanOrEqual(12);
  });
  it("corta si la dificultad no es razonable para un navegador", async () => {
    await expect(resolverDesafio(DESAFIO, 32)).rejects.toMatchObject({ codigo: "desafio_invalido" });
  });
});

describe("cliente HTTP", () => {
  it("leerEnlace manda la clave pública, sin credenciales ni cookies", async () => {
    const f = vi.fn<typeof fetch>(async () => respuesta(200, { id_publico: ID_ENLACE }));
    await cliente(f).leerEnlace(ID_ENLACE);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`https://api.ejemplo.test/v1/widget/enlaces/${ID_ENLACE}`);
    expect((init!.headers as Record<string, string>)["X-VC-Clave-Publica"]).toBe("vc_pub_prueba");
    expect(init!.credentials).toBe("omit");
    expect((init!.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("un id de enlace mal formado ni sale a la red: es un 404", async () => {
    const f = vi.fn<typeof fetch>();
    await expect(cliente(f).leerEnlace("../../etc")).rejects.toMatchObject({ codigo: "no_encontrado" });
    expect(f).not.toHaveBeenCalled();
  });

  it("crearSesion: emite desafío, lo resuelve y manda X-Desafio + Idempotency-Key", async () => {
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/desafios")
        ? respuesta(201, { desafio: DESAFIO, mecanismo: "prueba_de_trabajo_sha256", dificultad_bits: 8, vence_en_s: 60 })
        : respuesta(201, { sesion_id: ID_SESION }),
    );
    const resolver = vi.fn(async (d: string) => `${d}.00000000000000ab`);
    const r = await cliente(f, { resolver }).crearSesion({ enlace: ID_ENLACE, modo_avatar: "3d", idioma: "es-AR" });
    expect(r.sesion_id).toBe(ID_SESION);
    expect(resolver).toHaveBeenCalledWith(DESAFIO, 8);
    const init = f.mock.calls[1]![1]!;
    const h = init.headers as Record<string, string>;
    expect(h["X-Desafio"]).toBe(`${DESAFIO}.00000000000000ab`);
    expect(h["Idempotency-Key"]).toBe("uuid-fijo");
    expect(JSON.parse(init.body as string)).toEqual({ enlace: ID_ENLACE, modo_avatar: "3d", idioma: "es-AR" });
  });

  it("las rutas de sesión usan el token de sesión como Bearer (y no la clave pública)", async () => {
    const f = vi.fn<typeof fetch>(async () => respuesta(200, { total_centavos: 1 }));
    await cliente(f).leerCotizacion(ID_SESION, "vc_ses_tok");
    const h = f.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer vc_ses_tok");
    expect(h["X-VC-Clave-Publica"]).toBeUndefined();
  });

  it("traduce application/problem+json a ErrorVC con código, traza y Retry-After", async () => {
    const f = vi.fn<typeof fetch>(async () =>
      respuesta(429, { codigo: "limite_de_tasa", id_traza: "tr_0123456789abcdef", status: 429 }, { "Retry-After": "30" }),
    );
    const e = await cliente(f)
      .leerAviso()
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorVC);
    expect(e).toMatchObject({ codigo: "limite_de_tasa", status: 429, idTraza: "tr_0123456789abcdef", reintentarEnS: 30 });
  });

  it("falla de red, tiempo agotado y respuesta que no es JSON", async () => {
    await expect(cliente(async () => Promise.reject(new TypeError("fallo"))).leerAviso()).rejects.toMatchObject({ codigo: "red" });
    await expect(cliente(async () => respuesta(200, "<html>")).leerAviso()).rejects.toMatchObject({
      codigo: "respuesta_invalida",
    });
    const colgado: typeof fetch = (_u, init) =>
      new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError"))));
    await expect(cliente(colgado, { tiempoMaxMs: 10 }).leerAviso()).rejects.toMatchObject({ codigo: "tiempo_agotado" });
  });

  it("un 5xx sin cuerpo es error_interno", async () => {
    await expect(cliente(async () => new Response("", { status: 502 })).leerAviso()).rejects.toMatchObject({
      codigo: "error_interno",
      status: 502,
    });
  });
});

describe("URLs permitidas", () => {
  it("el socket solo va por wss:// (ws:// solo en localhost)", () => {
    expect(urlSocketPermitida(`wss://api.x.test/v1/sesiones/${ID_SESION}/medios`)).toBe(true);
    expect(urlSocketPermitida("ws://localhost:8787/v1/sesiones/x/medios")).toBe(true);
    expect(urlSocketPermitida("ws://evil.test/x")).toBe(false);
    expect(urlSocketPermitida("javascript:alert(1)")).toBe(false);
  });
  it("solo se abre un wa.me del contrato", () => {
    expect(urlWhatsAppPermitida("https://wa.me/5492236000000?text=VC-AB12-CD34EF")).toBe(true);
    expect(urlWhatsAppPermitida("https://evil.test/?u=https://wa.me/5492236000000?text=x")).toBe(false);
    expect(urlWhatsAppPermitida("javascript:alert(1)")).toBe(false);
    expect(urlWhatsAppPermitida("http://wa.me/5492236000000?text=x")).toBe(false);
  });
});

describe("errores del catálogo", () => {
  it("cubre todos los códigos de catalogo-errores.json con el mismo texto (si el contrato está al lado)", () => {
    const ruta = resolve(__dirname, "../../../../proyecto/contracts/catalogo-errores.json");
    if (!existsSync(ruta)) return; // el front puede vivir en su repo aparte
    const cat = JSON.parse(readFileSync(ruta, "utf8")) as { errores: Record<string, { mensaje: string }> };
    for (const [codigo, v] of Object.entries(cat.errores)) {
      expect(MENSAJES_ERROR[codigo], codigo).toBe(v.mensaje);
    }
    expect(Object.keys(MENSAJES_ERROR).sort()).toEqual(Object.keys(cat.errores).sort());
  });

  it("cuota agotada: mensaje claro y sin botón de reintento", () => {
    const m = mensajeError(new ErrorVC("cuota_agotada", { status: 429 }));
    expect(m.titulo).toBe("Cupo agotado");
    expect(m.mensaje).toMatch(/WhatsApp/);
    expect(m.reintentable).toBe(false);
  });
  it("desafío inválido: se puede reintentar", () => {
    const m = mensajeError(new ErrorVC("desafio_invalido", { status: 403 }));
    expect(m.mensaje).toMatch(/verificar el navegador/);
    expect(m.reintentable).toBe(true);
  });
  it("sesión vencida: hay que reiniciar", () => {
    const m = mensajeError(new ErrorVC("sesion_vencida", { status: 401 }));
    expect(m.mensaje).toMatch(/venció/);
    expect(m.accion).toBe("reiniciar");
  });
  it("enlace inexistente o revocado", () => {
    const m = mensajeError(new ErrorVC("no_encontrado", { status: 404 }));
    expect(m.mensaje).toMatch(/enlace/);
    expect(m.reintentable).toBe(false);
  });
  it("simultáneas agotadas y límite de tasa muestran la espera", () => {
    const m = mensajeError(new ErrorVC("limite_de_tasa", { reintentarEnS: 30 }));
    expect(m.mensaje).toMatch(/30 s/);
    expect(mensajeError(new ErrorVC("simultaneas_agotadas")).mensaje).toMatch(/Probá en unos minutos/);
  });
  it("el catálogo vivo (/v1/textos) pisa el respaldo, salvo los textos propios del front", () => {
    const m = mensajeError(new ErrorVC("proveedor_no_disponible"), { "error.proveedor_no_disponible": "Texto vivo." });
    expect(m.mensaje).toBe("Texto vivo.");
  });
  it("un código desconocido no rompe: cae en un mensaje genérico", () => {
    const m = mensajeError(new ErrorVC("algo_nuevo" as never));
    expect(m.mensaje.length).toBeGreaterThan(10);
  });
  it("cámara denegada explica que se necesita y que no se sigue", () => {
    const m = mensajeError(new ErrorVC("camara_denegada"));
    expect(m.mensaje).toMatch(/necesitamos/i);
    expect(m.mensaje).toMatch(/no podemos seguir/);
  });
  it("conserva el id de traza para soporte", () => {
    expect(mensajeError(new ErrorVC("error_interno", { idTraza: "tr_1" })).idTraza).toBe("tr_1");
  });
});
