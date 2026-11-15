// placeholder: WP5
import type { OpeningType, Vec } from '../../model/types.ts';
import type { Tool } from './types.ts';

export const openingTool: Tool = { id: 'opening' };

export function placeOpeningAt(_type: OpeningType, _at: Vec): boolean {
  return false;
}
