import type { WallKind } from '../geometry/types.ts';
import type { Mm } from '../model/types.ts';

export type WallPresetId =
  | 'bloco-14-externo'
  | 'tijolo-em-pe'
  | 'tijolo-deitado'
  | 'bloco-ceramico-9'
  | 'bloco-ceramico-14'
  | 'bloco-concreto-14'
  | 'bloco-concreto-19'
  | 'drywall'
  | 'bloco-concreto-14-aparente';

export type WallChoice = WallPresetId | 'custom';

/** A common Brazilian wall build, with its finished thickness (plaster included where it applies). */
export interface WallPreset {
  id: WallPresetId;
  thickness: Mm;
  label: string;
  explanation: string;
  kinds: readonly WallKind[];
}

const ALL: readonly WallKind[] = ['internal', 'external', 'boundary'];

export const WALL_PRESETS: readonly WallPreset[] = [
  {
    id: 'bloco-14-externo',
    thickness: 200,
    label: '20 cm · bloco de 14 cm com reboco externo (padrão SP)',
    explanation:
      'Bloco de 14 cm com reboco mais grosso por fora, comum nas paredes externas em São Paulo.',
    kinds: ['external', 'boundary'],
  },
  {
    id: 'tijolo-em-pe',
    thickness: 150,
    label: '15 cm · tijolo comum em pé (meia vez)',
    explanation: 'Tijolo de 10 cm com reboco dos dois lados. O mais comum dentro de casa.',
    kinds: ALL,
  },
  {
    id: 'tijolo-deitado',
    thickness: 250,
    label: '25 cm · tijolo comum deitado (uma vez)',
    explanation: 'Tijolo de 20 cm com reboco. Parede grossa, segura mais o som e o calor.',
    kinds: ALL,
  },
  {
    id: 'bloco-ceramico-9',
    thickness: 140,
    label: '14 cm · bloco cerâmico (baiano) de 9 cm',
    explanation: 'Bloco furado de 9 cm com reboco. Leve e barato, bom para dentro de casa.',
    kinds: ALL,
  },
  {
    id: 'bloco-ceramico-14',
    thickness: 190,
    label: '19 cm · bloco cerâmico de 14 cm',
    explanation: 'Bloco furado de 14 cm com reboco. Comum nas paredes de fora.',
    kinds: ALL,
  },
  {
    id: 'bloco-concreto-14',
    thickness: 190,
    label: '19 cm · bloco de concreto de 14 cm',
    explanation: 'Bloco de concreto de 14 cm com reboco. Firme e resistente.',
    kinds: ALL,
  },
  {
    id: 'bloco-concreto-19',
    thickness: 240,
    label: '24 cm · bloco de concreto de 19 cm',
    explanation: 'Bloco de concreto de 19 cm com reboco. Para paredes de fora e muros altos.',
    kinds: ['external', 'boundary'],
  },
  {
    id: 'drywall',
    thickness: 100,
    label: '10 cm · drywall (gesso acartonado)',
    explanation: 'Placas de gesso sobre perfis de aço, sem reboco. Só para dentro de casa.',
    kinds: ['internal'],
  },
  {
    id: 'bloco-concreto-14-aparente',
    thickness: 140,
    label: '14 cm · bloco de concreto sem reboco',
    explanation: 'Bloco de concreto de 14 cm aparente. Comum em muro de divisa.',
    kinds: ['boundary'],
  },
];

export const WALL_CUSTOM_RANGE = { min: 50, max: 400 } as const;

export const WALL_PRESET_NOTE =
  'Medidas com reboco de 2,5 cm de cada lado. Em São Paulo, o mais comum é parede interna de 15 cm e externa de 20 cm.';

const BY_ID = new Map<string, WallPreset>(WALL_PRESETS.map((p) => [p.id, p]));

export const wallPresetsFor = (kind: WallKind): WallPreset[] =>
  WALL_PRESETS.filter((p) => p.kinds.includes(kind));

/** The preset only when it exists and applies to this kind of wall. */
export function wallPresetFor(id: string | null | undefined, kind: WallKind): WallPreset | null {
  const p = id ? BY_ID.get(id) : undefined;
  return p?.kinds.includes(kind) ? p : null;
}

/**
 * The choice shown for a wall kind: the stored choice when it still matches the thickness,
 * else the first preset with that thickness, else custom.
 */
export function resolveWallChoice(
  kind: WallKind,
  thickness: Mm,
  stored: string | null | undefined,
): WallChoice {
  if (stored === 'custom') return 'custom';
  const kept = wallPresetFor(stored, kind);
  if (kept && kept.thickness === thickness) return kept.id;
  return wallPresetsFor(kind).find((p) => p.thickness === thickness)?.id ?? 'custom';
}
