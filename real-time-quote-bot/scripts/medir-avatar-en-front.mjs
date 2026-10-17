/**
 * Mide el avatar ya enchufado en el front (T07/T08): modo real, canvas y fps
 * durante el saludo del mock. Cámara y micrófono falsos.
 *
 *   node scripts/medir-avatar-en-front.mjs
 *   CHROMIUM=C:\\ruta\\chrome.exe BASE_URL=http://localhost:5173
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { ENLACES, iniciarMock } from "./mock-servidor-vc.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const CHROMIUM = process.env.CHROMIUM ?? process.env.CHROME_PATH ?? "";

async function servidorArriba(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let vite = null;
if (!(await servidorArriba(BASE))) {
  console.log("levantando vite dev (VITE_VC_MOCK=1)…");
  vite = spawn("npx", ["vite", "dev", "--port", "5173", "--host", "localhost"], {
    env: { ...process.env, VITE_VC_MOCK: "1" },
    stdio: "ignore",
    detached: true,
    shell: true,
  });
  for (let i = 0; i < 80 && !(await servidorArriba(BASE)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await servidorArriba(BASE))) {
    console.error("vite no levantó en 40 s");
    process.exit(1);
  }
}

let mock = { cerrar: async () => {} };
if (!process.env.SKIP_MOCK) {
  try {
    mock = await iniciarMock({
      puerto: 8787,
      origenes: [new URL(BASE).origin],
      silencioso: true,
      pausaMs: 200,
    });
  } catch (e) {
    if (e && e.code !== "EADDRINUSE") throw e;
    console.log("mock ya estaba en 8787, se reusa");
  }
}

const launch = {
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
};
if (CHROMIUM) launch.executablePath = CHROMIUM;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: "es-AR" });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

try {
  await page.goto(`${BASE}/c/${ENLACES.ok}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Iniciar VideoCotización" }).first().click();
  await page.getByTestId("conectar").click();
  for (const k of [
    "acepta_camara_y_microfono",
    "acepta_tratamiento",
    "declara_mayor_de_18",
    "informado_asistente_automatico",
  ]) {
    await page.getByTestId(`consent-${k}`).check();
  }
  await page.getByTestId("consent-aceptar").click();
  await page.waitForSelector('[data-fase="llamada"]', { timeout: 20000 });
  await page.getByText("¡Hola! Soy Juan").waitFor();

  const info = await page.evaluate(async () => {
    const caja = document.querySelector('[data-testid="avatar"]');
    const canvas = caja?.querySelector("canvas");
    const t0 = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      const tick = () => {
        frames++;
        if (performance.now() - t0 >= 2000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const dt = performance.now() - t0;
    return {
      modo: caja?.getAttribute("data-avatar-modo") ?? null,
      modelo: caja?.getAttribute("data-avatar-modelo") ?? null,
      canvas: !!canvas,
      w: canvas?.width ?? 0,
      h: canvas?.height ?? 0,
      fpsRaf: Math.round((frames * 1000) / dt),
      webgl: !!(canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"))),
    };
  });

  console.log(JSON.stringify({ ok: true, ...info, errores: errores.slice(0, 3) }, null, 2));
  if (!info.modo) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await mock.cerrar();
  if (vite?.pid) {
    try {
      process.kill(-vite.pid);
    } catch {
      try {
        process.kill(vite.pid);
      } catch {
        /* ya murió */
      }
    }
  }
}
