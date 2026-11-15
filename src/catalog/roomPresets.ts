import type { AreaKind, Fill, MaterialId, Mm, RoomPresetId } from '../model/types.ts';
import type { RoomPreset } from './types.ts';

const fill = (color: string, material: MaterialId): Fill => ({
  color,
  material,
  scale: 1,
  angle: 0,
});

const preset = (
  id: RoomPresetId,
  label: string,
  kind: AreaKind,
  color: string,
  material: MaterialId,
  icon: string,
  extra: { minArea?: number; needsWindow?: boolean; doorWidth?: Mm } = {},
): RoomPreset => ({ id, label, kind, fill: fill(color, material), icon, ...extra });

const LIST: RoomPreset[] = [
  preset('living', 'Sala', 'room', '#F4E8D6', 'wood-planks', 'Sofa'),
  preset('kitchen', 'Cozinha', 'room', '#F7EEDC', 'porcelain-60', 'CookingPot'),
  preset('bedroom', 'Quarto', 'room', '#E5EDF7', 'wood-planks', 'BedSingle', { minArea: 7 }),
  preset('suite', 'Suíte', 'room', '#E3EAF6', 'wood-planks', 'BedDouble', { minArea: 7 }),
  preset('bathroom', 'Banheiro', 'room', '#DDF0EE', 'ceramic-45', 'Bath', {
    needsWindow: true,
    doorWidth: 700,
    minArea: 2.5,
  }),
  preset('powder', 'Lavabo', 'room', '#E2F1EF', 'ceramic-45', 'Toilet', { doorWidth: 600 }),
  preset('laundry', 'Área de serviço', 'room', '#ECEEEF', 'ceramic-45', 'WashingMachine'),
  preset('office', 'Escritório', 'room', '#EAF1E3', 'wood-planks', 'Laptop'),
  preset('closet', 'Closet', 'room', '#F1EAF4', 'wood-planks', 'Shirt'),
  preset('hall', 'Corredor', 'room', '#F2EEE8', 'porcelain-60', 'Footprints'),
  preset('pantry', 'Despensa', 'room', '#EFEBE3', 'ceramic-45', 'Package'),
  preset('room', 'Cômodo', 'room', '#F2F0EB', 'solid', 'Square'),
  preset('gourmet', 'Área gourmet', 'covered', '#F3E6DA', 'porcelain-90', 'UtensilsCrossed'),
  preset('porch', 'Varanda', 'covered', '#F1E5D5', 'deck', 'Armchair'),
  preset('garage', 'Garagem', 'covered', '#E2E3E4', 'concrete', 'Car'),
  preset('lawn', 'Grama', 'outdoor', '#9BC87A', 'grass', 'Sprout'),
  preset('garden', 'Jardim', 'outdoor', '#8DBF6E', 'grass', 'Flower2'),
  preset('patio', 'Quintal', 'outdoor', '#D8D2C6', 'stone', 'Fence'),
  preset('parking', 'Vaga descoberta', 'outdoor', '#D6D7D8', 'concrete', 'CarFront'),
  preset('pool', 'Piscina', 'outdoor', '#7CC3E6', 'water', 'WavesLadder'),
  preset('deck', 'Deck', 'outdoor', '#C9A27A', 'deck', 'Rows3'),
];

export const ROOM_PRESETS: Record<RoomPresetId, RoomPreset> = Object.fromEntries(
  LIST.map((p) => [p.id, p]),
);

export const GENERIC_PRESET_ID: RoomPresetId = 'room';

/** Unknown ids fall back to the generic room. */
export const presetFor = (id: RoomPresetId): RoomPreset =>
  ROOM_PRESETS[id] ?? ROOM_PRESETS[GENERIC_PRESET_ID]!;

export const presetsOfKind = (kind: AreaKind): RoomPreset[] => LIST.filter((p) => p.kind === kind);
