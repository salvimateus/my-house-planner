import type { ReactElement } from 'react';
import type {
  AreaKind,
  Fill,
  ItemTypeId,
  MaterialId,
  Mm,
  OpeningType,
  RoomPresetId,
} from '../model/types.ts';
import type { RenderContext } from '../render/RenderContext.ts';

export type ItemCategory =
  | 'bathroom'
  | 'kitchen'
  | 'service'
  | 'living'
  | 'bedroom'
  | 'office'
  | 'outdoor'
  | 'garage'
  | 'structure';

/** Drawn centered at (0,0), back side at -d/2. */
export interface SymbolProps {
  w: Mm;
  d: Mm;
  color: string;
  mirrored: boolean;
  ctx: RenderContext;
}

export interface ItemDef {
  type: ItemTypeId;
  label: string;
  category: ItemCategory;
  keywords: string[];
  size: { w: Mm; d: Mm };
  min: { w: Mm; d: Mm };
  max: { w: Mm; d: Mm };
  variants?: Array<{ id: string; label: string; w: Mm; d: Mm }>;
  wallSnap: 'back' | 'none';
  layer: 'floor' | 'furniture' | 'structure';
  color: string;
  colors?: string[];
  colorable: boolean;
  keepAspect?: boolean;
  rotationStep?: 15 | 90;
  Symbol: (props: SymbolProps) => ReactElement;
}

export interface OpeningSymbolProps {
  width: Mm;
  thickness: Mm;
  hinge: 'start' | 'end';
  side: 1 | -1;
  swing: number;
  ctx: RenderContext;
}

export interface OpeningDef {
  type: OpeningType;
  label: string;
  tip: string;
  Symbol: (props: OpeningSymbolProps) => ReactElement;
}

export interface MaterialPatternProps {
  id: string;
  color: string;
  scale: number;
  angle: 0 | 45 | 90;
  ctx: RenderContext;
}

export interface MaterialDef {
  id: MaterialId;
  label: string;
  group: 'indoor' | 'outdoor';
  permeable: boolean;
  defaultColor: string;
  tile: { w: Mm; h: Mm };
  /** Returns a `<pattern patternUnits="userSpaceOnUse">` sized in mm. */
  Pattern: (props: MaterialPatternProps) => ReactElement;
  flatColor(color: string): string;
}

export interface RoomPreset {
  id: RoomPresetId;
  label: string;
  kind: AreaKind;
  fill: Fill;
  /** lucide-react icon name (key of its `icons` export). */
  icon: string;
  /** Recommended minimum, m². */
  minArea?: number;
  needsWindow?: boolean;
  doorWidth?: Mm;
}

export const defineItem = (d: ItemDef): ItemDef => d;
export const defineOpening = (d: OpeningDef): OpeningDef => d;
export const defineMaterial = (d: MaterialDef): MaterialDef => d;
