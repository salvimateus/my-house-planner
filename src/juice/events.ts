import type { ToolId } from '../editor/tools/types.ts';
import type { Id } from '../model/types.ts';

export type AppEvent =
  | { type: 'tool-activated'; tool: ToolId }
  /** Areas in mm². */
  | { type: 'room-created'; areaId: Id; grossArea: number; netArea: number }
  | { type: 'opening-placed'; openingId: Id }
  | { type: 'opening-flipped'; openingId: Id }
  | { type: 'item-placed'; itemId: Id }
  | { type: 'ruler-created'; rulerId: Id }
  | { type: 'area-painted'; areaId: Id }
  | { type: 'export-done'; format: 'pdf' | 'svg' | 'png' }
  | { type: 'pinch-used' }
  | { type: 'project-opened'; projectId: Id }
  | { type: 'tutorial-requested' };

type Listener = (e: AppEvent) => void;

const listeners = new Map<AppEvent['type'], Set<Listener>>();

export function emit(e: AppEvent): void {
  const set = listeners.get(e.type);
  if (!set) return;
  for (const fn of [...set]) fn(e);
}

export function on<T extends AppEvent['type']>(
  type: T,
  fn: (e: Extract<AppEvent, { type: T }>) => void,
): () => void {
  const set = listeners.get(type) ?? new Set<Listener>();
  const listener = fn as Listener;
  set.add(listener);
  listeners.set(type, set);
  return () => {
    set.delete(listener);
  };
}
