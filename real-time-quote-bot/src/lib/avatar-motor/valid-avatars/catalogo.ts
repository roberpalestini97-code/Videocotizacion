/**
 * Catálogo VALID (c-frame/valid-avatars-glb) → URL GLB por avatar_id del contrato.
 * Commit fijado en jsdelivr para builds reproducibles.
 */
export const VALID_AVATARS_COMMIT = 'c539a28';

const BASE_DEFECTO = `https://cdn.jsdelivr.net/gh/c-frame/valid-avatars-glb@${VALID_AVATARS_COMMIT}/`;

export type EntradaValidAvatar = {
  avatarId: string;
  modelPath: string;
};

const ENTRADAS: EntradaValidAvatar[] = [
  { avatarId: 'av_valid_laura', modelPath: 'avatars/Hispanic/Hispanic_F_2_Util.glb' },
  { avatarId: 'av_valid_tito', modelPath: 'avatars/Asian/Asian_M_1_Util.glb' },
  { avatarId: 'av_valid_juan', modelPath: 'avatars/White/White_M_3_Medi.glb' },
];

const POR_ID = new Map(ENTRADAS.map((e) => [e.avatarId, e]));

function baseUrl(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_VALID_AVATARS_BASE : undefined;
  const raw = typeof env === 'string' && env.trim() ? env.trim() : BASE_DEFECTO;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function esValidAvatar(avatarId: string): boolean {
  return POR_ID.has(avatarId);
}

export function urlGlbValid(avatarId: string): string | null {
  const e = POR_ID.get(avatarId);
  if (!e) return null;
  return baseUrl() + e.modelPath;
}
