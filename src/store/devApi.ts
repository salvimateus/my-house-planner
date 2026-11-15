import { MATERIALS } from '../catalog/registry.ts';
import { toolContext } from '../editor/toolContext.ts';
import { toolFor } from '../editor/tools/registry.ts';
import type { PointerInput, Tool, ToolId } from '../editor/tools/types.ts';
import { deriveScene } from '../geometry/scene.ts';
import { parseProject } from '../model/codec.ts';
import type { Vec } from '../model/types.ts';
import { renderThumbSvg } from '../render/thumb.ts';
import { commands } from '../ui/shortcuts.ts';
import { camera, cameraStore } from './cameraStore.ts';
import { docStore } from './docStore.ts';
import { catalogLookup } from './selectors.ts';
import { uiStore } from './uiStore.ts';

interface DevPointer {
  tool?: ToolId;
  pointerType?: PointerInput['pointerType'];
  shift?: boolean;
  alt?: boolean;
}

function input(world: Vec, o: DevPointer = {}): PointerInput {
  return {
    world: { x: world.x, y: world.y },
    screen: camera.worldToScreen(world),
    pointerType: o.pointerType ?? 'mouse',
    button: 0,
    shift: o.shift ?? false,
    alt: o.alt ?? false,
    meta: false,
    time: performance.now(),
  };
}

function toolOf(o: DevPointer): Tool {
  if (o.tool && o.tool !== uiStore.getState().tool) uiStore.getState().setTool(o.tool);
  return toolFor(uiStore.getState().tool);
}

/** Drives tool handlers with world points, for tests that synthetic pointer events cannot drive. */
const tools = {
  use(id: ToolId): void {
    uiStore.getState().setTool(id);
  },
  tap(world: Vec, o: DevPointer = {}): void {
    toolOf(o).onTap?.(input(world, o), toolContext);
  },
  longPress(world: Vec, o: DevPointer = {}): void {
    toolOf(o).onLongPress?.(input(world, o), toolContext);
  },
  hover(world: Vec, o: DevPointer = {}): void {
    toolOf(o).onHover?.(input(world, o), toolContext);
  },
  /** Returns false when the tool declined the drag (the router would pan instead). */
  drag(from: Vec, to: Vec, o: DevPointer & { steps?: number } = {}): boolean {
    const tool = toolOf(o);
    const start = input(from, o);
    if (!tool.onDragStart?.(start, toolContext)) return false;
    const steps = Math.max(1, Math.round(o.steps ?? 8));
    let p = start;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      p = input({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, o);
      tool.onDrag?.(p, start, toolContext);
    }
    tool.onDragEnd?.(p, start, toolContext);
    return true;
  },
  cancel(): void {
    toolFor(uiStore.getState().tool).onCancel?.(toolContext);
  },
  key(key: string, init: KeyboardEventInit = {}): boolean {
    const e = new KeyboardEvent('keydown', { key, ...init });
    return toolFor(uiStore.getState().tool).onKey?.(e, toolContext) ?? false;
  },
};

/** Loads a project JSON (text or object) into the editor. Returns the repair messages. */
function loadDocJson(json: string | object): string[] {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  const { doc, repairs } = parseProject(text, { isKnownMaterial: (id) => MATERIALS.has(id) });
  docStore.getState().load(doc);
  const ui = uiStore.getState();
  ui.select(null);
  ui.setScreen('editor');
  return repairs;
}

const api = {
  docStore,
  uiStore,
  cameraStore,
  camera,
  commands,
  deriveScene: (doc = docStore.getState().doc) => (doc ? deriveScene(doc, catalogLookup) : null),
  parseProject,
  loadDocJson,
  renderThumbSvg,
  tools,
};

declare global {
  interface Window {
    __casinha?: typeof api;
  }
}

if (import.meta.env.DEV) window.__casinha = api;
