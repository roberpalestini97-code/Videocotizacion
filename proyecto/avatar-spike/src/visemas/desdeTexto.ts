/**
 * Visemas aproximados desde texto en español rioplatense (reglas de grafemas, sin fonética real).
 * Uso: guion del demo y respaldo si el TTS no da marcas de tiempo y tampoco hay análisis de audio.
 * NO reemplaza los visemas del proveedor de TTS (ADR 0002 §8).
 *
 * Reglas: vocales → aa/E/I/O/U; p b v m → PP; f → FF; s z, c+e/i → SS (seseo);
 * t d → DD; k q g j, c+a/o/u → kk; ch → CH; ll, y+vocal → CH (rioplatense "sh");
 * n ñ l → nn; r rr → RR; h muda; espacios y puntuación → sil.
 */
import type { ItemVisema, Visema } from '../contrato/eventos';

export interface OpcionesTexto {
  vocalMs?: number;
  consonanteMs?: number;
  pausaComaMs?: number;
  pausaPuntoMs?: number;
  espacioMs?: number;
}

const VOCAL: Record<string, Visema> = { a: 'aa', e: 'E', i: 'I', o: 'O', u: 'U' };

function sinTildes(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùü]/g, 'u');
}

/** Secuencia de visemas (sin tiempos). Exportada para pruebas. */
export function visemasDeTexto(texto: string): Visema[] {
  const s = sinTildes(texto);
  const out: Visema[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const sig = s[i + 1] ?? '';
    if (c in VOCAL) {
      // "y" sola o al final suena como i; acá solo vocales reales.
      out.push(VOCAL[c]!);
      continue;
    }
    switch (c) {
      case 'p': case 'b': case 'v': case 'm':
        out.push('PP'); break;
      case 'f':
        out.push('FF'); break;
      case 's': case 'z': case 'x':
        out.push('SS'); break;
      case 'c':
        if (sig === 'h') { out.push('CH'); i++; }
        else if (sig === 'e' || sig === 'i') out.push('SS');
        else out.push('kk');
        break;
      case 'l':
        if (sig === 'l') { out.push('CH'); i++; } else out.push('nn');
        break;
      case 'y':
        if (sig && sig in VOCAL) out.push('CH'); else out.push('I');
        break;
      case 't': case 'd':
        out.push('DD'); break;
      case 'k': case 'q': case 'g': case 'j':
        out.push('kk'); break;
      case 'n': case 'ñ':
        out.push('nn'); break;
      case 'r':
        out.push('RR');
        if (sig === 'r') i++;
        break;
      case 'h':
        break; // muda
      case ',': case ';': case ':':
        out.push('sil'); out.push('sil'); break;
      case '.': case '?': case '!': case '¿': case '¡':
        out.push('sil'); out.push('sil'); out.push('sil'); break;
      default:
        if (/\s/.test(c)) out.push('sil');
        // dígitos y otros: se ignoran
    }
  }
  // Los silencios consecutivos se colapsan en itemsDesdeTexto (sumando duraciones).
  return out;
}

/** Ítems con tiempos (formato del contrato) desde texto. */
export function itemsDesdeTexto(texto: string, op: OpcionesTexto = {}): ItemVisema[] {
  const vocalMs = op.vocalMs ?? 110;
  const consonanteMs = op.consonanteMs ?? 70;
  const espacioMs = op.espacioMs ?? 40;
  const items: ItemVisema[] = [];
  let t = 0;
  const seq = visemasDeTexto(texto);
  for (const v of seq) {
    let d: number;
    if (v === 'sil') d = espacioMs;
    else if (v === 'aa' || v === 'E' || v === 'I' || v === 'O' || v === 'U') d = vocalMs;
    else d = consonanteMs;
    const prev = items[items.length - 1];
    if (prev && prev.v === v && v === 'sil') {
      prev.d_ms = Math.min(5000, prev.d_ms + d);
    } else {
      items.push({ v, t_ms: t, d_ms: d });
    }
    t += d;
  }
  return items;
}
