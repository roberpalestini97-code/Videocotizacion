// Smoke del spike en Chromium HEADLESS con renderizado por SOFTWARE (SwiftShader).
// NO REPRESENTATIVO de equipos reales: no hay GPU, la CPU del contenedor no es la de un
// teléfono, el audio sale a un dispositivo falso y no hay pantalla con vsync real.
// Sirve para: (1) comprobar que demo.html carga, crea el contexto WebGL y anima;
// (2) obtener un número de referencia "peor caso software"; (3) probar cámara falsa,
// codificación JPEG real del navegador e ida y vuelta GLB.
//
// Uso: npm run build && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4173;
const ejecutable = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

async function cargarPlaywright() {
  for (const m of ['playwright', '/opt/npm-tools/node_modules/playwright/index.mjs']) {
    try {
      return await import(m);
    } catch {
      /* siguiente */
    }
  }
  throw new Error('No se encontró playwright');
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function levantarPreview() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: raiz, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO}/demo.html`);
      if (r.ok) return p;
    } catch {
      /* todavía no */
    }
    await esperar(200);
  }
  p.kill();
  throw new Error('vite preview no respondió');
}

const { chromium } = await cargarPlaywright();
const servidor = await levantarPreview();
const resultados = { fecha: new Date().toISOString(), advertencia: 'NO REPRESENTATIVO: Chromium headless, WebGL por software (SwiftShader), sin GPU, audio a dispositivo falso, sin vsync real.', corridas: [] };
const consola = [];

try {
  const navegador = await chromium.launch({
    executablePath: ejecutable,
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  resultados.versionNavegador = navegador.version();

  for (const conf of [
    { nombre: '3d_media_640x480', calidad: 'media', viewport: { width: 1000, height: 700 }, dpr: 1 },
    { nombre: '3d_baja_movil_360x640_dpr2', calidad: 'baja', viewport: { width: 360, height: 640 }, dpr: 2 },
    { nombre: '3d_baja_tope30fps', calidad: 'baja', viewport: { width: 360, height: 640 }, dpr: 2, fpsMax: 30 },
  ]) {
    const contexto = await navegador.newContext({ viewport: conf.viewport, deviceScaleFactor: conf.dpr, permissions: ['camera'] });
    const pagina = await contexto.newPage();
    pagina.on('console', (m) => consola.push(`[${conf.nombre}] ${m.type()}: ${m.text()}`));
    pagina.on('pageerror', (e) => consola.push(`[${conf.nombre}] pageerror: ${e.message}`));
    const q = new URLSearchParams({ calidad: conf.calidad, repeticiones: '1', ...(conf.fpsMax ? { fpsMax: String(conf.fpsMax) } : {}) });
    await pagina.goto(`http://localhost:${PUERTO}/demo.html?${q}`);
    await pagina.waitForFunction(() => window.__vc && window.__vc.listo, null, { timeout: 15000 });
    // Calentamiento (compilación de shaders) y medición en reposo
    await esperar(1500);
    await pagina.evaluate(() => window.__vc.reiniciarMedicion());
    const t0 = Date.now();
    await pagina.evaluate(() => window.__vc.reproducirGuion(1));
    const duracionGuionS = (Date.now() - t0) / 1000;
    const medicion = await pagina.evaluate(() => window.__vc.medicion());
    const corrida = { ...conf, duracionGuionS, medicion };
    if (conf.nombre === '3d_media_640x480') {
      corrida.muestreoSinteticoRuido = await pagina.evaluate(() => window.__vc.probarMuestreoSintetico('ruido', 1920, 1080));
      corrida.muestreoSinteticoDegradado = await pagina.evaluate(() => window.__vc.probarMuestreoSintetico('degradado', 1920, 1080));
      try {
        corrida.camaraFalsa = await pagina.evaluate(() => window.__vc.probarCamara(7));
      } catch (e) {
        corrida.camaraFalsa = { error: String(e) };
      }
      corrida.glb = await pagina.evaluate(() => window.__vc.probarGLB());
      await pagina.evaluate(() => window.__vc.reiniciarMedicion());
      await esperar(2000);
      corrida.trasGLB = (await pagina.evaluate(() => window.__vc.medicion())).frames;
      await pagina.evaluate(() => window.__vc.cambiarModo('clips'));
      await pagina.evaluate(() => window.__vc.reproducirGuion(1));
      corrida.clips = (await pagina.evaluate(() => window.__vc.medicion())).clips;
      await pagina.screenshot({ path: join(raiz, 'resultados', 'smoke-clips.png') }).catch(() => {});
      await pagina.evaluate(() => window.__vc.cambiarModo('3d'));
      await pagina.screenshot({ path: join(raiz, 'resultados', 'smoke-3d.png') }).catch(() => {});
    }
    resultados.corridas.push(corrida);
    await contexto.close();
  }
  await navegador.close();
} finally {
  servidor.kill();
}

resultados.consola = consola.slice(0, 50);
mkdirSync(join(raiz, 'resultados'), { recursive: true });
const archivo = join(raiz, 'resultados', 'smoke-headless.json');
writeFileSync(archivo, JSON.stringify(resultados, null, 2));
for (const c of resultados.corridas) {
  const f = c.medicion.frames;
  console.log(`${c.nombre}: fps=${f?.fpsMedio} p50=${f?.intervaloP50Ms}ms p95=${f?.intervaloP95Ms}ms >33ms=${f?.pctSobre33Ms}% gpu=${c.medicion.renderer?.gpu}`);
}
console.log(`Resultados en ${archivo}`);
