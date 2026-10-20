/**
 * Prueba de extremo a extremo del flujo de VideoCotización en Chromium real (Playwright)
 * con CÁMARA Y MICRÓFONO FALSOS contra el servidor falso (scripts/mock-servidor-vc.mjs).
 *
 *   node scripts/e2e-videocotizacion.mjs
 *   CAPTURAS=../proyecto/docs/fe/capturas  BASE_URL=http://localhost:5173  CHROMIUM=/opt/pw-browsers/chromium
 *
 * Levanta el servidor falso (puerto 8787) y, si no hay nada en BASE_URL, `vite dev` con VITE_VC_MOCK=1.
 * NO prueba: backend real, voz real (reconocimiento/síntesis), cámara real, otros navegadores ni móvil real.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { ENLACES, iniciarMock } from "./mock-servidor-vc.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const CAPTURAS = resolve(process.env.CAPTURAS ?? "test-results/capturas");
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
function ok(cond, msg) {
  resultados.push({ ok: !!cond, msg });
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) process.exitCode = 1;
}

async function servidorArriba(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let vite = null;
if (!(await servidorArriba(BASE))) {
  console.log("levantando vite dev en modo simulado…");
  vite = spawn("npx", ["vite", "dev", "--port", "5173", "--host", "localhost"], {
    env: { ...process.env, VITE_VC_MOCK: "1" },
    stdio: "ignore",
    detached: true, // grupo propio: así se cierra también el proceso hijo de npx
  });
  for (let i = 0; i < 60 && !(await servidorArriba(BASE)); i++)
    await new Promise((r) => setTimeout(r, 500));
}

const mock = await iniciarMock({
  puerto: 8787,
  origenes: [new URL(BASE).origin],
  silencioso: true,
  pausaMs: 400,
});
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const MOVIL = { width: 390, height: 844 };
async function nuevaPagina({ viewport = MOVIL, denegarCamara = false } = {}) {
  const ctx = await browser.newContext({
    viewport,
    permissions: ["camera", "microphone"],
    locale: "es-AR",
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  // Las fuentes de Google las bloquea el proxy del sandbox: no es un error del flujo.
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|fonts\.g/.test(m.text() + (m.location().url ?? "")) &&
      errores.push(m.text()),
  );
  await page.addInitScript((denegar) => {
    window.__gum = 0;
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      window.__gum++;
      if (denegar) return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      return orig(c);
    };
  }, denegarCamara);
  return { page, ctx, errores };
}
// Pausa corta para que terminen las animaciones de entrada antes de capturar.
const foto = async (page, nombre) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
};
const sesionDe = (enlace) => [...mock.sesiones.values()].filter((s) => s.enlace === enlace).at(-1);
const fase = (page) => page.locator("[data-fase]").first().getAttribute("data-fase");
async function esperarFase(page, f, ms = 15000) {
  await page.waitForSelector(`[data-fase="${f}"]`, { timeout: ms });
}
async function aceptarConsentimiento(page) {
  for (const k of [
    "acepta_camara_y_microfono",
    "acepta_tratamiento",
    "declara_mayor_de_18",
    "informado_asistente_automatico",
  ]) {
    await page.getByTestId(`consent-${k}`).check();
  }
}
async function abrirEnlace(page, enlace) {
  await page.goto(`${BASE}/c/${enlace}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Iniciar VideoCotización" }).first().click();
}
async function decir(page, texto) {
  await page.getByTestId("texto-cliente").fill(texto);
  await page.getByTestId("enviar-texto").click();
}

try {
  // ---------------------------------------------------------------- 1. flujo feliz
  console.log("\n1. Flujo completo (móvil 390x844, cámara y micrófono falsos)");
  {
    const { page, ctx, errores } = await nuevaPagina();
    await page.goto(`${BASE}/c/${ENLACES.ok}`, { waitUntil: "networkidle" });
    await foto(page, "00-portada-enlace-profesional");
    await page.getByRole("button", { name: "Iniciar VideoCotización" }).first().click();
    await page.getByText("Cotizá con Rober").or(page.getByTestId("consent-aceptar")).waitFor();
    const conectar = page.getByTestId("conectar");
    if (await conectar.isVisible()) {
      ok(await page.getByText("Cotizá con Rober").isVisible(), "se resolvió el enlace con Rober");
      await conectar.click();
    } else {
      ok(true, "un solo avatar: se salteó el picker y se abrió el consentimiento");
    }
    ok(
      (await page.evaluate(() => window.__gum)) === 0,
      "todavía no se pidió cámara ni micrófono (getUserMedia = 0)",
    );
    await foto(page, "01-enlace-resuelto");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await foto(page, "02-consentimiento");
    ok(
      (await page.evaluate(() => window.__gum)) === 0,
      "en la pantalla de consentimiento getUserMedia sigue en 0",
    );
    ok(
      await page.getByText("Texto a validar con abogado").isVisible(),
      "el aviso está marcado «a validar con abogado»",
    );
    ok(
      await page.getByTestId("consent-aceptar").isDisabled(),
      "no se puede aceptar sin tildar los 4 consentimientos",
    );
    await aceptarConsentimiento(page);
    ok(
      await page.getByTestId("consent-aceptar").isEnabled(),
      "con los 4 tildados se habilita aceptar",
    );
    await foto(page, "03-consentimiento-aceptado");
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "llamada");
    ok(
      (await page.evaluate(() => window.__gum)) >= 1,
      "recién después de aceptar se pidió cámara y micrófono",
    );
    const s = sesionDe(ENLACES.ok);
    ok(
      s.registro.consentimientos === 1,
      "el servidor registró el consentimiento antes del token de medios",
    );
    await page.getByText("¡Hola! Soy Rober").waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid="mi-camara"]');
      return v && v.videoWidth > 0;
    });
    const modoAvatar = await page
      .locator('[data-testid="avatar"]')
      .getAttribute("data-avatar-modo");
    ok(
      modoAvatar === "3d" || modoAvatar === "clips" || modoAvatar === "placeholder-2d",
      `avatar montado en modo ${modoAvatar ?? "desconocido"}`,
    );
    ok(
      (await page.locator('[data-testid="avatar"] canvas').count()) >= 1 ||
        modoAvatar === "placeholder-2d",
      "el avatar 3D/clips dibuja en un canvas (o cayó al 2D)",
    );
    ok(true, "se ve la cámara propia (video falso con ancho > 0) y habla el asesor");
    await page.waitForTimeout(1200);
    await foto(page, "04-llamada-saludo");
    ok(
      !/\$\s?\d/.test(await page.getByRole("dialog").innerText()),
      "antes del final NO hay ningún precio en pantalla",
    );

    await decir(page, "Quiero pintar el living");
    await page.getByTestId("pizarron-oficio").waitFor();
    ok(
      await page.getByTestId("pizarron-tarea").isVisible(),
      "pizarrón en vivo con oficio y tarea anotados",
    );
    ok((await fase(page)) === "llamada", "el pizarrón no cortó la conversación (sigue en llamada)");
    await page.waitForTimeout(500);
    await foto(page, "05-pizarron-en-vivo");
    await decir(page, "Son 24 metros cuadrados en Cobo");
    await page.getByTestId("pizarron-zona").waitFor();
    // dejamos pasar >6 s para varios fotogramas (uno cada 3 s)
    await page.waitForTimeout(6500);
    ok(
      !/\$\s?\d/.test(await page.getByRole("dialog").innerText()),
      "con todos los datos anotados, todavía NO hay precio",
    );
    await foto(page, "06-llamada-datos-completos");
    await decir(page, "La altura es normal");
    await esperarFase(page, "resultado", 20000);
    await page.getByTestId("total").waitFor();
    const total = await page.getByTestId("total").innerText();
    ok(/123\.000,00/.test(total), `el precio aparece SOLO al final: ${total}`);
    const href = await page.getByTestId("whatsapp").getAttribute("href");
    const cod = await page.getByTestId("codigo-referencia").innerText();
    ok(
      /^https:\/\/wa\.me\/\d{8,15}\?text=/.test(href ?? "") &&
        decodeURIComponent(href).includes(cod),
      `derivación wa.me con el código ${cod}`,
    );
    ok(
      (await page.getByTestId("whatsapp").getAttribute("target")) === "_blank",
      "WhatsApp abre en pestaña nueva (noopener)",
    );
    await foto(page, "07-resultado-presupuesto-whatsapp");

    // fotogramas: reglas del contrato medidas en el servidor falso (solo metadatos)
    const fr = s.registro.fotogramas;
    ok(fr.length >= 2, `el servidor recibió ${fr.length} fotogramas`);
    ok(
      fr.every((f) => f.firma_jpeg && f.bytes <= 131072 && f.ancho <= 1024 && f.alto <= 1024),
      `todos son JPEG ≤128 KiB y ≤1024 px (máx ${Math.max(...fr.map((f) => f.bytes))} B, ${Math.max(...fr.map((f) => f.ancho))}x${Math.max(...fr.map((f) => f.alto))} px)`,
    );
    ok(
      fr.every((f) => f.resultado === "aceptado"),
      "el servidor aceptó todos (ninguno descartado por tamaño/frecuencia)",
    );
    const gaps = fr.slice(1).map((f, i) => f.t - fr[i].t);
    ok(
      gaps.every((g) => g >= 2950),
      `separados ≥ 3 s (intervalos: ${gaps.map((g) => (g / 1000).toFixed(1)).join(", ")} s)`,
    );
    ok(
      s.registro.textos.length === 3,
      "el servidor recibió los 3 textos del cliente por texto.enviar",
    );
    ok(
      s.registro.autenticaciones === 1 && s.registro.conexiones === 1,
      "una sola conexión autenticada con token de medios",
    );
    ok(
      await page.evaluate(
        () => !Object.keys(localStorage).length && !Object.keys(sessionStorage).length,
      ),
      "nada de fotogramas ni datos en localStorage/sessionStorage",
    );
    ok(
      errores.length === 0,
      `sin errores de consola${errores.length ? ": " + errores.slice(0, 2).join(" | ") : ""}`,
    );
    // al cerrar, se libera la cámara
    await page.getByTestId("cerrar").click();
    await page.waitForTimeout(300);
    ctx.close();
  }

  // ---------------------------------------------------------------- 2. escritorio
  console.log("\n2. Vista de escritorio (1280x800)");
  {
    const { page, ctx } = await nuevaPagina({ viewport: { width: 1280, height: 800 } });
    await abrirEnlace(page, ENLACES.ok);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await aceptarConsentimiento(page);
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "llamada");
    await page.getByText("¡Hola! Soy Rober").waitFor();
    await decir(page, "Quiero pintar el living");
    await page.getByTestId("pizarron-oficio").waitFor();
    await page.waitForTimeout(1500);
    await foto(page, "08-escritorio-llamada");
    ok(true, "captura de escritorio");
    // ---- cortar
    await page.getByTestId("cortar").click();
    await esperarFase(page, "cerrada");
    await page.getByTestId("derivacion").waitFor();
    await foto(page, "09-cortar-cierre-con-whatsapp");
    ok(
      (await page.getByTestId("cierre-motivo").innerText()).includes("Cortaste la llamada"),
      "cortar: cierre claro «Cortaste la llamada»",
    );
    ok(
      sesionDe(ENLACES.ok).registro.cierre === "cliente_cerro",
      "cortar: el servidor recibió cerrarSesion(cliente_cerro)",
    );
    ok(
      await page.getByTestId("whatsapp").isVisible(),
      "cortar: se ofrece WhatsApp con el enlace de leerDerivacion",
    );
    ctx.close();
  }

  // ---------------------------------------------------------------- 3. rechazo de consentimiento
  console.log("\n3. Rechazo del consentimiento");
  {
    const { page, ctx } = await nuevaPagina();
    await abrirEnlace(page, ENLACES.ok);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    const antes = mock.sesiones.size;
    await page.getByTestId("consent-rechazar").click();
    await esperarFase(page, "cerrada");
    await foto(page, "10-consentimiento-rechazado");
    ok(
      (await page.evaluate(() => window.__gum)) === 0,
      "sin consentimiento NUNCA se abrió cámara ni micrófono",
    );
    ok(
      [...mock.sesiones.values()].at(-1).registro.cierre === "sin_consentimiento",
      "el servidor recibió cerrarSesion(sin_consentimiento)",
    );
    ok(
      (await page.getByTestId("cierre-motivo").innerText()).includes(
        "ni la cámara ni el micrófono",
      ),
      "mensaje claro de que no se abrió nada",
    );
    void antes;
    ctx.close();
  }

  // ---------------------------------------------------------------- 4. cámara denegada
  console.log("\n4. Cámara denegada (NotAllowedError simulado)");
  {
    const { page, ctx } = await nuevaPagina({ denegarCamara: true });
    await abrirEnlace(page, ENLACES.ok);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await aceptarConsentimiento(page);
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "camara_denegada");
    await foto(page, "11-camara-denegada");
    const txt = await page.getByTestId("camara-denegada").innerText();
    ok(
      /necesitamos/i.test(txt) && /no podemos seguir/.test(txt),
      "explica que la cámara se necesita y que no se sigue",
    );
    const s = [...mock.sesiones.values()].at(-1);
    ok(s.registro.cierre === "sin_camara", "el servidor recibió cerrarSesion(sin_camara)");
    ok(
      s.registro.conexiones === 0 && s.registro.autenticaciones === 0,
      "no se abrió ningún WebSocket de medios",
    );
    ctx.close();
  }

  // ---------------------------------------------------------------- 5. errores del catálogo
  console.log("\n5. Errores del catálogo con mensajes en español");
  for (const [enlace, nombre, regex, reintento, archivo] of [
    [ENLACES.cuota, "cuota agotada", /no hay cupo/, false, "12-error-cuota-agotada"],
    [
      ENLACES.desafio,
      "desafío inválido",
      /verificar el navegador/,
      true,
      "13-error-desafio-invalido",
    ],
    [
      "zzzzzzzzzzzzzzzzzzzzzz",
      "enlace inexistente",
      /no existe o ya no está activo/,
      false,
      "14-error-enlace-inexistente",
    ],
  ]) {
    const { page, ctx } = await nuevaPagina();
    await abrirEnlace(page, enlace);
    if (enlace.startsWith("zzzz")) await esperarFase(page, "error");
    else {
      await esperarFase(page, "enlace");
      await page.getByTestId("conectar").click();
      await esperarFase(page, "error");
    }
    const m = await page.getByTestId("error-mensaje").innerText();
    ok(regex.test(m), `${nombre}: «${m}»`);
    ok(
      (await page.getByTestId("reintentar").count()) === (reintento ? 1 : 0),
      `${nombre}: ${reintento ? "ofrece" : "no ofrece"} reintentar`,
    );
    await foto(page, archivo);
    ctx.close();
  }
  {
    const { page, ctx } = await nuevaPagina();
    await abrirEnlace(page, ENLACES.simultaneas);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await aceptarConsentimiento(page);
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "error");
    const m = await page.getByTestId("error-mensaje").innerText();
    ok(/Probá en unos minutos/.test(m), `simultáneas agotadas al pedir el token de medios: «${m}»`);
    await foto(page, "15-error-simultaneas-agotadas");
    ctx.close();
  }
  {
    const { page, ctx } = await nuevaPagina();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Iniciar VideoCotización" }).first().click();
    await esperarFase(page, "error");
    ok(
      /enlace de tu profesional/.test(await page.getByTestId("pantalla-error").innerText()),
      "portada sin /c/<id>: pide el enlace del profesional",
    );
    await foto(page, "16-portada-sin-enlace");
    ctx.close();
  }

  // ---------------------------------------------------------------- 6. reconexión
  console.log("\n6. Reconexión del WebSocket");
  {
    const { page, ctx } = await nuevaPagina();
    await abrirEnlace(page, ENLACES.caida);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await aceptarConsentimiento(page);
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "llamada");
    await page.getByText("¡Hola! Soy Rober").waitFor();
    await decir(page, "Quiero pintar el living");
    await page.getByTestId("pizarron-oficio").waitFor();
    await page.getByTestId("reconectando").waitFor({ timeout: 8000 });
    await foto(page, "17-reconectando");
    ok(true, "se cortó el socket: aparece el cartel «Reintentando»");
    await esperarFase(page, "llamada", 15000);
    const s = sesionDe(ENLACES.caida);
    ok(
      s.registro.conexiones >= 2 && s.registro.autenticaciones >= 2,
      `reconectó con token nuevo (conexiones: ${s.registro.conexiones})`,
    );
    ok(
      await page.getByTestId("pizarron-oficio").isVisible(),
      "el pizarrón se conserva tras reconectar",
    );
    await decir(page, "Son 24 metros cuadrados en Cobo");
    await decir(page, "La altura es normal");
    await esperarFase(page, "resultado", 20000);
    await foto(page, "18-reconexion-y-presupuesto");
    ok(
      /123\.000,00/.test(await page.getByTestId("total").innerText()),
      "después de reconectar la llamada llega al presupuesto",
    );
    ctx.close();
  }

  // ---------------------------------------------------------------- 7. sin voz
  console.log("\n7. Corte del servidor por sin_voz");
  {
    const { page, ctx } = await nuevaPagina();
    await abrirEnlace(page, ENLACES.sinvoz);
    await esperarFase(page, "enlace");
    await page.getByTestId("conectar").click();
    await esperarFase(page, "consentimiento");
    await aceptarConsentimiento(page);
    await page.getByTestId("consent-aceptar").click();
    await esperarFase(page, "llamada");
    await page.getByText(/No te escuchamos/).waitFor({ timeout: 6000 });
    await foto(page, "19-aviso-sin-voz");
    await esperarFase(page, "cerrada", 8000);
    ok(
      (await page.getByTestId("cierre-motivo").innerText()).includes("no te escuchamos"),
      "cierre por sin_voz explicado",
    );
    await foto(page, "20-cierre-sin-voz");
    ctx.close();
  }
} finally {
  await browser.close();
  await mock.cerrar();
  if (vite?.pid) process.kill(-vite.pid);
}

const fallas = resultados.filter((r) => !r.ok).length;
console.log(
  `\n${resultados.length - fallas}/${resultados.length} verificaciones OK · capturas en ${CAPTURAS}`,
);
process.exit(fallas ? 1 : 0);
