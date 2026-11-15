import type { Handle, HitTarget, Scene, SnapContext } from '../../geometry/types.ts';
import type { Id, Mm, ProjectDoc, Vec } from '../../model/types.ts';
import type { CameraApi } from '../../store/cameraStore.ts';
import type { DocActions, DocState } from '../../store/docStore.ts';
import type { UiActions, UiState } from '../../store/uiStore.ts';

export type ToolId = 'select' | 'build' | 'opening' | 'item' | 'ruler' | 'paint';

export interface PointerInput {
  world: Vec;
  screen: { x: number; y: number };
  pointerType: 'mouse' | 'pen' | 'touch';
  button: number;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  time: number;
}

export interface Feedback {
  /** Snap step: sound + haptic. */
  tick(): void;
  /** Drop or placement. */
  place(): void;
  /** Magnet attach. */
  thunk(): void;
  /** Delete: sound + burst at a world point. */
  remove(at: Vec): void;
  /** Shake + error sound. */
  invalid(target?: Element | null): void;
  success(): void;
}

export interface ToolContext {
  getDoc(): ProjectDoc | null;
  getScene(): Scene;
  getUi(): UiState;
  doc: DocActions & Pick<DocState, 'readOnly'>;
  ui: UiActions;
  camera: CameraApi;
  feedback: Feedback;
  snapContext(): SnapContext;
  tolMm(px?: number): Mm;
}

export interface Tool {
  id: ToolId;
  cursor?: string;
  onActivate?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;
  onHover?(p: PointerInput, ctx: ToolContext): void;
  /** Return false (or omit) to let the router pan the camera instead. */
  onDragStart?(p: PointerInput, ctx: ToolContext): boolean;
  onDrag?(p: PointerInput, start: PointerInput, ctx: ToolContext): void;
  onDragEnd?(p: PointerInput, start: PointerInput, ctx: ToolContext): void;
  onTap?(p: PointerInput, ctx: ToolContext): void;
  onLongPress?(p: PointerInput, ctx: ToolContext): void;
  /** Second pointer, Escape or tool switch: roll back with ctx.doc.cancelGesture(). */
  onCancel?(ctx: ToolContext): void;
  onKey?(e: KeyboardEvent, ctx: ToolContext): boolean;
}

export interface SelectHandler {
  kind: NonNullable<HitTarget>['kind'];
  onTap?(hit: HitTarget, p: PointerInput, ctx: ToolContext): void;
  onDragStart?(hit: HitTarget, p: PointerInput, ctx: ToolContext): boolean;
  onDrag?(hit: HitTarget, p: PointerInput, start: PointerInput, ctx: ToolContext): void;
  onDragEnd?(hit: HitTarget, p: PointerInput, start: PointerInput, ctx: ToolContext): void;
  onCancel?(ctx: ToolContext): void;
  /** Screen-space handles for the current selection. */
  getHandles?(ctx: ToolContext): Handle[];
  onHandleDrag?(
    handleId: string,
    p: PointerInput,
    start: PointerInput,
    ctx: ToolContext,
    phase: 'start' | 'move' | 'end',
  ): void;
  onHandleTap?(handleId: string, ctx: ToolContext): void;
}

export type { Id };
