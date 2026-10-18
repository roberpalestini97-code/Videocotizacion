/**
 * Genera los fondos de los entornos (public/entornos/{oficina,plaza}.jpg, T46): baja el
 * panorama 8k de Poly Haven (CC0), recorta una vista en perspectiva con three.js en
 * Chrome headless y la desenfoca apenas. También baja el HDRI 1k que da la luz.
 *
 *   node scripts/generar-fondos-entornos.mjs
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const ENTORNOS = [
  { nombre: "oficina", hdri: "hotel_room", yaw: 0, pitch: -2, fov: 62 },
  { nombre: "plaza", hdri: "greenwich_park_02", yaw: 45, pitch: 2, fov: 62 },
];
const DESENFOQUE_PX = 2.2;

const raiz = fileURLToPath(new URL("..", import.meta.url));
const tmp = `${raiz}scripts/fotos-avatares/.panoramas`;
const ejecutable = [
  process.env.CHROMIUM,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));
if (!ejecutable) throw new Error("No encontré Chrome/Edge: definí CHROMIUM=ruta");

async function bajar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

mkdirSync(tmp, { recursive: true });
mkdirSync(`${raiz}public/entornos`, { recursive: true });
const vite = await createServer({
  root: raiz,
  configFile: false,
  logLevel: "error",
  server: { port: 5197, strictPort: true, host: "127.0.0.1" },
});
await vite.listen();
const nav = await chromium.launch({
  executablePath: ejecutable,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const pagina = await nav.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const e of ENTORNOS) {
    const archivos = await (await fetch(`https://api.polyhaven.com/files/${e.hdri}`)).json();
    await bajar(archivos.hdri["1k"].hdr.url, `${raiz}public/entornos/${e.hdri}.hdr`);
    await bajar(archivos.tonemapped.url, `${tmp}/${e.hdri}.jpg`);
    const q = `src=/scripts/fotos-avatares/.panoramas/${e.hdri}.jpg&yaw=${e.yaw}&pitch=${e.pitch}&fov=${e.fov}&blur=${DESENFOQUE_PX}`;
    await pagina.goto(`http://127.0.0.1:5197/scripts/fotos-avatares/fondo.html?${q}`);
    await pagina.waitForFunction(() => window.listo || window.error, null, { timeout: 180_000 });
    const error = await pagina.evaluate(() => window.error);
    if (error) throw new Error(`${e.nombre}: ${error}`);
    const destino = `${raiz}public/entornos/${e.nombre}.jpg`;
    await pagina.locator("#c").screenshot({ path: destino, type: "jpeg", quality: 80 });
    console.log("ok", destino);
  }
} finally {
  await nav.close();
  await vite.close();
  rmSync(tmp, { recursive: true, force: true });
}
