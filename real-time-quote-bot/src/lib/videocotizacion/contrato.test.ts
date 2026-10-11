/**
 * Conformidad con el contrato: los eventos y cuerpos que produce o acepta el front,
 * y TODO lo que responde el servidor falso, se validan contra los JSON Schema de
 * proyecto/contracts/schemas (ajv 2020). Se saltea si el contrato no está al lado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WS from "ws";
// @ts-expect-error módulo .mjs sin tipos
import { ENLACES, CLAVE_PUBLICA_MOCK, iniciarMock } from "../../../scripts/mock-servidor-vc.mjs";
import { cargarEsquemas } from "@/test-support/esquemas";
import { ClienteVC } from "./cliente";
import { SesionMedios, type SocketLike } from "./medios";
import { armarTrama, crearEventoCliente, leerEncabezado, parsearEventoServidor } from "./protocolo";

const esquemas = cargarEsquemas();
const ORIGEN = "http://localhost:3000";
const describeSi = describe.skipIf(!esquemas);

function validar(nombre: string, dato: unknown) {
  const r = esquemas!.validar(nombre, dato);
  expect(r.errores, `${nombre}: ${JSON.stringify(dato).slice(0, 200)}`).toBe("");
}

describeSi("eventos del servidor del contrato → parser del front", () => {
  const nombres = [
    "sesion_lista",
    "transcripcion_parcial",
    "transcripcion_final",
    "avatar_respuesta",
    "avatar_visemas",
    "pizarron_actualizado",
    "camara_fotograma",
    "sesion_aviso",
    "cotizacion_emitida",
    "sesion_cerrada",
    "error",
  ];
  it.each(nombres)("acepta los ejemplos oficiales de Evento_%s", (n) => {
    const ej = esquemas!.ejemplos(`eventos/Evento_${n}.schema.json`);
    expect(ej.length).toBeGreaterThan(0);
    for (const e of ej) {
      const parseado = parsearEventoServidor(JSON.stringify(e));
      expect(parseado, JSON.stringify(e).slice(0, 120)).not.toBeNull();
      expect(parseado!.tipo).toBe((e as { tipo: string }).tipo);
    }
  });
});

describeSi("eventos del cliente y encabezado binario → esquemas del contrato", () => {
  it("sesion.autenticar, texto.enviar, pizarron.corregir y sesion.cerrar validan", () => {
    const fecha = new Date("2026-10-10T12:00:00Z");
    validar(
      "eventos/Evento_sesion_autenticar.schema.json",
      JSON.parse(
        crearEventoCliente(
          "sesion.autenticar",
          { token_medios: "vc_med_" + "A".repeat(43) },
          0,
          fecha,
        ),
      ),
    );
    validar(
      "eventos/Evento_texto_enviar.schema.json",
      JSON.parse(crearEventoCliente("texto.enviar", { texto: "hola" }, 1, fecha)),
    );
    validar(
      "eventos/Evento_pizarron_corregir.schema.json",
      JSON.parse(
        crearEventoCliente(
          "pizarron.corregir",
          { version_base: 2, clave: "zona", valor: "Cobo" },
          2,
          fecha,
        ),
      ),
    );
    validar(
      "eventos/Evento_sesion_cerrar.schema.json",
      JSON.parse(crearEventoCliente("sesion.cerrar", { motivo: "cliente_cerro" }, 3, fecha)),
    );
  });
  it("el encabezado de una trama de fotograma valida con EncabezadoBinario", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const h = leerEncabezado(armarTrama(0x10, jpeg, 5, 3000))!;
    const ej = esquemas!.ejemplos("eventos/EncabezadoBinario.schema.json")[0] as Record<
      string,
      unknown
    >;
    const forma = Object.keys(ej);
    // El esquema describe la forma decodificada; se arma con los mismos nombres de campo.
    const candidato: Record<string, unknown> = {};
    for (const k of forma) {
      const v = (
        {
          magia: "VC",
          version: h.version,
          tipo: "fotograma_jpeg",
          flags: h.flags,
          seq: h.seq,
          ts_ms: h.ts_ms,
          longitud: h.longitud,
        } as Record<string, unknown>
      )[k];
      candidato[k] = v ?? ej[k];
    }
    validar("eventos/EncabezadoBinario.schema.json", candidato);
  });
});

describeSi("servidor falso ⇄ cliente real ⇄ contrato", () => {
  let mock: Awaited<ReturnType<typeof iniciarMock>>;
  const bodies: { esquema: string; cuerpo: unknown }[] = [];

  /** fetch de Node + Origin (el navegador lo pone solo) y registro de cada cuerpo de petición. */
  const f: typeof fetch = (url, init) => {
    const h = new Headers(init?.headers);
    h.set("Origin", ORIGEN);
    if (init?.body && String(url).endsWith("/v1/sesiones"))
      bodies.push({
        esquema: "CrearSesionSolicitud.schema.json",
        cuerpo: JSON.parse(String(init.body)),
      });
    if (init?.body && String(url).endsWith("/consentimiento"))
      bodies.push({
        esquema: "ConsentimientoSolicitud.schema.json",
        cuerpo: JSON.parse(String(init.body)),
      });
    if (init?.body && String(url).endsWith("/cierre"))
      bodies.push({
        esquema: "CierreSolicitud.schema.json",
        cuerpo: JSON.parse(String(init.body)),
      });
    return fetch(url, { ...init, headers: h });
  };
  const cliente = () =>
    new ClienteVC({ apiBase: mock.url, clavePublica: CLAVE_PUBLICA_MOCK, fetch: f });

  beforeAll(async () => {
    mock = await iniciarMock({ puerto: 0, origenes: [ORIGEN], silencioso: true, pausaMs: 20 });
  });
  afterAll(async () => {
    await mock.cerrar();
  });

  it("todas las respuestas HTTP del flujo validan contra su esquema", async () => {
    const c = cliente();
    validar("EnlacePublico.schema.json", await c.leerEnlace(ENLACES.ok));
    validar("CatalogoTextos.schema.json", await c.leerTextos());
    validar("AvisoPrivacidad.schema.json", await c.leerAviso());
    validar("DesafioEmitido.schema.json", await c.emitirDesafio());
    const s = await c.crearSesion({
      enlace: ENLACES.ok,
      modo_avatar: "3d",
      avatar_id: "av_obrero_casco",
      idioma: "es-AR",
    });
    validar("SesionCreada.schema.json", s);
    const tok = s.token_sesion.valor;
    await expect(c.emitirTokenMedios(s.sesion_id, tok)).rejects.toMatchObject({
      codigo: "consentimiento_requerido",
    });
    validar(
      "ConsentimientoRegistrado.schema.json",
      await c.registrarConsentimiento(s.sesion_id, tok, {
        aviso_version: s.consentimiento.aviso_version,
        acepta_camara_y_microfono: true,
        acepta_tratamiento: true,
        declara_mayor_de_18: true,
        informado_asistente_automatico: true,
      }),
    );
    // Única diferencia con el contrato: el servidor falso local no tiene TLS, así que da ws:// en vez de wss://.
    const tm = await c.emitirTokenMedios(s.sesion_id, tok);
    expect(tm.ws_url.startsWith("ws://localhost")).toBe(true);
    validar("TokenMedios.schema.json", { ...tm, ws_url: tm.ws_url.replace("ws://", "wss://") });
    await expect(c.leerCotizacion(s.sesion_id, tok)).rejects.toMatchObject({
      codigo: "cotizacion_no_emitida",
    });
    validar(
      "CierreSesion.schema.json",
      await c.cerrarSesion(s.sesion_id, tok, { motivo: "cliente_cerro" }),
    );
    validar("DerivacionWhatsApp.schema.json", await c.leerDerivacion(s.sesion_id, tok));
    for (const b of bodies) validar(b.esquema, b.cuerpo);
    expect(bodies.length).toBeGreaterThanOrEqual(3);
  });

  it("los errores del mock validan con Error.schema y el front los entiende", async () => {
    const c = cliente();
    const sin = await fetch(`${mock.url}/v1/widget/enlaces/${ENLACES.ok}`, {
      headers: { Origin: "https://otro.test", "X-VC-Clave-Publica": CLAVE_PUBLICA_MOCK },
    });
    expect(sin.status).toBe(403);
    validar("Error.schema.json", await sin.json());
    await expect(c.leerEnlace("inexistente_del_mock_xx")).rejects.toMatchObject({
      codigo: "no_encontrado",
    });
    await expect(c.crearSesion({ enlace: ENLACES.cuota, modo_avatar: "3d" })).rejects.toMatchObject(
      { codigo: "cuota_agotada", reintentarEnS: 3600 },
    );
    await expect(
      c.crearSesion({ enlace: ENLACES.desafio, modo_avatar: "3d" }),
    ).rejects.toMatchObject({ codigo: "desafio_invalido" });
    const mal = new ClienteVC({ apiBase: mock.url, clavePublica: "vc_pub_otra", fetch: f });
    await expect(mal.leerEnlace(ENLACES.ok)).rejects.toMatchObject({
      codigo: "credencial_invalida",
    });
  });

  it("un desafío no se puede reusar", async () => {
    const c = cliente();
    const d = await c.emitirDesafio();
    const { resolverDesafio } = await import("./desafio");
    const x = await resolverDesafio(d.desafio, d.dificultad_bits);
    const pedir = () =>
      f(`${mock.url}/v1/sesiones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VC-Clave-Publica": CLAVE_PUBLICA_MOCK,
          "X-Desafio": x,
        },
        body: JSON.stringify({ enlace: ENLACES.ok, modo_avatar: "3d" }),
      });
    expect((await pedir()).status).toBe(201);
    expect((await pedir()).status).toBe(403);
  });

  it("WebSocket real: autenticación, texto, fotograma y presupuesto final; cada evento del servidor valida", async () => {
    const c = cliente();
    const s = await c.crearSesion({
      enlace: ENLACES.ok,
      modo_avatar: "3d",
      avatar_id: "av_obrero_casco",
      idioma: "es-AR",
    });
    const tok = s.token_sesion.valor;
    await c.registrarConsentimiento(s.sesion_id, tok, {
      aviso_version: s.consentimiento.aviso_version,
      acepta_camara_y_microfono: true,
      acepta_tratamiento: true,
      declara_mayor_de_18: true,
      informado_asistente_automatico: true,
    });
    const crudos: unknown[] = [];
    const tipos: string[] = [];
    let estadoFinal = "";
    const medios = new SesionMedios({
      obtenerToken: () => c.emitirTokenMedios(s.sesion_id, tok),
      crearSocket: (u) => {
        const w = new WS(u, { headers: { Origin: ORIGEN } });
        w.on("message", (d, bin) => !bin && crudos.push(JSON.parse(d.toString())));
        return w as unknown as SocketLike;
      },
      onEvento: (e) => tipos.push(e.tipo),
      onEstado: (e) => (estadoFinal = e),
    });
    medios.conectar();
    await vi_esperar(() => medios.lista);
    await vi_esperar(() => tipos.includes("avatar.respuesta"));
    medios.enviarTexto("Quiero pintar el living");
    await vi_esperar(() => tipos.filter((t) => t === "avatar.respuesta").length >= 2);
    // fotograma JPEG mínimo válido de 8x8 (SOF0)
    medios.enviarTrama(armarTrama(0x10, jpegMinimo(8, 8), 0, 100));
    await vi_esperar(() => tipos.includes("camara.fotograma"));
    medios.enviarTexto("Son 24 metros en Cobo");
    medios.enviarTexto("Altura normal");
    await vi_esperar(() => tipos.includes("sesion.cerrada"), 5000);
    await vi_esperar(() => estadoFinal === "cerrada");

    expect(tipos).toContain("cotizacion.emitida");
    expect(tipos.indexOf("pizarron.actualizado")).toBeLessThan(tipos.indexOf("cotizacion.emitida"));
    for (const e of crudos) {
      const t = (e as { tipo: string }).tipo;
      validar(`eventos/Evento_${t.replace(".", "_")}.schema.json`, e);
    }
    // el precio NO aparece en ningún evento anterior a cotizacion.emitida
    const iCot = crudos.findIndex((e) => (e as { tipo: string }).tipo === "cotizacion.emitida");
    expect(JSON.stringify(crudos.slice(0, iCot))).not.toMatch(
      /total_centavos|importe_centavos|precio/,
    );
    const reg = mock.sesiones.get(s.sesion_id).registro;
    expect(reg.fotogramas[0]).toMatchObject({ ancho: 8, alto: 8, resultado: "aceptado" });
    expect(reg.textos).toHaveLength(3);
    validar("Cotizacion.schema.json", await c.leerCotizacion(s.sesion_id, tok));
  });
});

// ---- auxiliares ----
async function vi_esperar(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("tiempo agotado esperando condición");
    await new Promise((r) => setTimeout(r, 10));
  }
}
/** JPEG sintético con SOI + SOF0 (solo lo que mide el servidor falso). */
function jpegMinimo(ancho: number, alto: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    alto >> 8,
    alto & 255,
    ancho >> 8,
    ancho & 255,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}
