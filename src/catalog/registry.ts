import { createElement, type ReactElement } from 'react';
import type { ItemTypeId, MaterialId, OpeningType } from '../model/types.ts';
import { strokeProps } from '../render/RenderContext.ts';
import {
  defineItem,
  defineMaterial,
  type ItemDef,
  type MaterialDef,
  type OpeningDef,
  type SymbolProps,
} from './types.ts';

function BoxSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  return createElement('rect', {
    x: -w / 2,
    y: -d / 2,
    width: w,
    height: d,
    fill: color,
    stroke: ctx.theme.wall,
    ...strokeProps(ctx, 1, 0.25),
  });
}

const FALLBACK_ITEM: ItemDef = defineItem({
  type: 'generic-box',
  label: 'Objeto',
  category: 'living',
  keywords: [],
  size: { w: 600, d: 600 },
  min: { w: 100, d: 100 },
  max: { w: 10_000, d: 10_000 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#E3E4E6',
  colorable: true,
  Symbol: BoxSymbol,
});

const FALLBACK_MATERIAL: MaterialDef = defineMaterial({
  id: 'solid',
  label: 'Cor lisa',
  group: 'indoor',
  permeable: false,
  defaultColor: '#F2F0EB',
  tile: { w: 1000, h: 1000 },
  // Flat fills never render a pattern; PatternDefs paints them with the plain color.
  Pattern: () => null as never,
  flatColor: (c) => c,
});

const itemModules = import.meta.glob<{ default: ItemDef }>('./items/**/*.tsx', { eager: true });
export const ITEMS: ReadonlyMap<ItemTypeId, ItemDef> = new Map(
  Object.values(itemModules).map((m) => [m.default.type, m.default]),
);
export const itemDef = (type: ItemTypeId): ItemDef => ITEMS.get(type) ?? FALLBACK_ITEM;

const openingModules = import.meta.glob<{ default: OpeningDef }>('./openings/*.tsx', {
  eager: true,
});
export const OPENINGS: ReadonlyMap<OpeningType, OpeningDef> = new Map(
  Object.values(openingModules).map((m) => [m.default.type, m.default]),
);
/** null: the layer draws a plain gap. */
export const openingDef = (type: OpeningType): OpeningDef | null => OPENINGS.get(type) ?? null;

const materialModules = import.meta.glob<{ default: MaterialDef }>('./materials/*.tsx', {
  eager: true,
});
export const MATERIALS: ReadonlyMap<MaterialId, MaterialDef> = new Map(
  Object.values(materialModules).map((m) => [m.default.id, m.default]),
);
export const materialDef = (id: MaterialId): MaterialDef => MATERIALS.get(id) ?? FALLBACK_MATERIAL;
