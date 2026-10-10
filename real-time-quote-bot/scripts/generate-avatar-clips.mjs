/**
 * Genera clips talking-head (P-Video-Avatar) para cada línea del asesor.
 *
 * Requisitos: `belt login` (o INFSH_API_KEY) y belt en PATH.
 *
 * Uso:
 *   node scripts/generate-avatar-clips.mjs
 *   node scripts/generate-avatar-clips.mjs --asesor=marta
 *   node scripts/generate-avatar-clips.mjs --dry-run
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "public", "avatars");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const only = [...args].find((a) => a.startsWith("--asesor="))?.split("=")[1];

/** @type {{ id: string; nombre: string; avatar: object; guion: { de: string; texto: string }[] }[]} */
const asesores = [
  {
    id: "marta",
    nombre: "Marta",
    avatar: {
      voice: "Kore (Female)",
      voiceLanguage: "Spanish",
      voicePrompt: "Cálida, cercana y detallista, ritmo natural rioplatense",
      videoPrompt:
        "Professional tradeswoman on a video call, looking at camera, natural gestures, soft indoor lighting",
      imagenFuente: "src/assets/avatar-marta.jpg",
    },
    guion: [
      "¡Hola! Soy Marta. Mostrame con la cámara el ambiente que querés pintar y te armo el presupuesto en el momento.",
      null,
      "Veo humedad en el zócalo y dos manos necesarias sobre el tono actual. ¿La pared está fisurada?",
      null,
      "Listo. Con enduido, sellador y dos manos de látex premium el trabajo queda en: ciento ochenta y cinco mil cuatrocientos pesos.",
    ],
  },
  {
    id: "diego",
    nombre: "Diego",
    avatar: {
      voice: "Puck (Male)",
      voiceLanguage: "Spanish",
      voicePrompt: "Práctico, directo y confiado, sin rodeos",
      videoPrompt:
        "Professional gardener on a video call, looking at camera, casual outdoor workwear feel, natural light",
      imagenFuente: "src/assets/avatar-diego.jpg",
    },
    guion: [
      "¡Hola! Soy Diego. Recorré el jardín con la cámara así mido el trabajo y el mantenimiento que necesita.",
      null,
      "Veo pasto alto y dos árboles para poda de altura. Eso suma retiro de residuos.",
      null,
      "Te dejo puesta a punto inicial más abono mensual: noventa y seis mil ochocientos pesos.",
    ],
  },
  {
    id: "lucia",
    nombre: "Lucía",
    avatar: {
      voice: "Zephyr (Female)",
      voiceLanguage: "Spanish",
      voicePrompt: "Clara, organizada y profesional, tono amable",
      videoPrompt:
        "Professional cleaning specialist on a video call, looking at camera, neat appearance, bright indoor lighting",
      imagenFuente: "src/assets/avatar-lucia.jpg",
    },
    guion: [
      "¡Hola! Soy Lucía. Mostrame los ambientes y te digo cuántas personas y horas lleva dejarlo impecable.",
      null,
      "Veo polvo fino en carpinterías y restos de cemento en pisos: eso pide productos específicos.",
      null,
      "Con dos personas durante una jornada completa queda listo: setenta y cuatro mil doscientos pesos.",
    ],
  },
];

function beltLoggedIn() {
  const r = spawnSync("belt", ["auth", "status"], { encoding: "utf8" });
  return r.status === 0;
}

function runBelt(input, downloadDir) {
  mkdirSync(downloadDir, { recursive: true });
  const inputPath = join(downloadDir, "input.json");
  writeFileSync(inputPath, JSON.stringify(input, null, 2));
  const r = spawnSync(
    "belt",
    [
      "app",
      "run",
      "pruna/p-video-avatar",
      "--input",
      `@${inputPath}`,
      "--download",
      downloadDir,
      "--json",
      "--no-input",
    ],
    { encoding: "utf8", cwd: root },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `belt exit ${r.status}`);
  }
  return r.stdout;
}

async function main() {
  if (!dryRun && !beltLoggedIn()) {
    console.error("✗ No hay sesión de belt. Corré: belt login");
    process.exit(1);
  }

  const lista = only ? asesores.filter((a) => a.id === only) : asesores;
  if (!lista.length) {
    console.error(`Asesor desconocido: ${only}`);
    process.exit(1);
  }

  for (const a of lista) {
    const img = resolve(root, a.avatar.imagenFuente);
    if (!existsSync(img)) {
      console.error(`✗ Falta imagen: ${img}`);
      continue;
    }
    const destDir = join(outRoot, a.id);
    mkdirSync(destDir, { recursive: true });

    for (let i = 0; i < a.guion.length; i++) {
      const texto = a.guion[i];
      if (!texto) continue;
      const outFile = join(destDir, `${i}.mp4`);
      if (existsSync(outFile)) {
        console.log(`· skip ${a.id}/${i}.mp4 (ya existe)`);
        continue;
      }
      const input = {
        image: img,
        voice_script: texto,
        voice: a.avatar.voice,
        voice_language: a.avatar.voiceLanguage,
        voice_prompt: a.avatar.voicePrompt,
        video_prompt: a.avatar.videoPrompt,
        resolution: "720p",
      };
      console.log(`→ ${a.nombre} turno ${i}: ${texto.slice(0, 48)}…`);
      if (dryRun) {
        console.log(JSON.stringify(input, null, 2));
        continue;
      }
      const tmp = join(destDir, `_tmp_${i}`);
      try {
        runBelt(input, tmp);
        // Buscar el primer mp4 descargado
        const { readdirSync, copyFileSync, rmSync } = await import("node:fs");
        const files = readdirSync(tmp).filter((f) => f.endsWith(".mp4"));
        if (!files.length) {
          // a veces el JSON tiene URL; dejar rastro
          const jsons = readdirSync(tmp).filter((f) => f.endsWith(".json"));
          console.error(`✗ Sin mp4 en ${tmp}. Archivos:`, readdirSync(tmp));
          if (jsons[0]) console.error(readFileSync(join(tmp, jsons[0]), "utf8").slice(0, 500));
          continue;
        }
        copyFileSync(join(tmp, files[0]), outFile);
        rmSync(tmp, { recursive: true, force: true });
        console.log(`✓ ${outFile}`);
      } catch (e) {
        console.error(`✗ ${a.id}/${i}:`, e.message || e);
      }
    }
  }
  console.log(dryRun ? "Dry-run listo." : "Generación terminada.");
}

main();
