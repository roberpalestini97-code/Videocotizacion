/**
 * Genera las fotos de los asesores (src/assets/avatar-valid-*.jpg) renderizando el
 * mismo Avatar3D + GLB VALID que se ve en la llamada. Volver a correr si cambia un modelo.
 *
 *   node scripts/generar-fotos-avatares.mjs
 *   CHROMIUM=C:/ruta/chrome.exe node scripts/generar-fotos-avatares.mjs
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const IDS = { av_valid_laura: "laura", av_valid_tito: "tito", av_valid_juan: "juan" };
const CANDIDATOS = [
  process.env.CHROMIUM,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const ejecutable = CANDIDATOS.find((p) => existsSync(p));
if (!ejecutable) throw new Error("No encontré Chrome/Edge: definí CHROMIUM=ruta");

const vite = await createServer({
  root: raiz,
  configFile: false,
  logLevel: "error",
  server: { port: 5199, strictPort: true, host: "127.0.0.1" },
});
await vite.listen();
const nav = await chromium.launch({
  executablePath: ejecutable,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const pagina = await nav.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const [id, nombre] of Object.entries(IDS)) {
    await pagina.goto(`http://127.0.0.1:5199/scripts/fotos-avatares/index.html?id=${id}`);
    await pagina.waitForFunction(() => window.listo || window.error, null, { timeout: 120_000 });
    const error = await pagina.evaluate(() => window.error);
    if (error) throw new Error(`${id}: ${error}`);
    const destino = `${raiz}src/assets/avatar-valid-${nombre}.jpg`;
    await pagina.locator("#c").screenshot({ path: destino, type: "jpeg", quality: 88 });
    console.log("ok", destino);
  }
} finally {
  await nav.close();
  await vite.close();
}
