import { buildTool } from './build.ts';
import { itemTool } from './item.ts';
import { openingTool } from './opening.ts';
import { paintTool } from './paint.ts';
import { rulerTool } from './ruler.ts';
import { selectTool } from './select.ts';
import type { Tool, ToolId } from './types.ts';

export const TOOLS: Record<ToolId, Tool> = {
  select: selectTool,
  build: buildTool,
  opening: openingTool,
  item: itemTool,
  ruler: rulerTool,
  paint: paintTool,
};

export const toolFor = (id: ToolId): Tool => TOOLS[id];
