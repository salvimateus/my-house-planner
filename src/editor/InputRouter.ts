import { emit } from '../juice/events.ts';
import { tuning } from '../juice/tuning.ts';
import { camera } from '../store/cameraStore.ts';
import { EMPTY_TRANSIENT } from '../store/uiStore.ts';
import { setPointerKind } from './toolContext.ts';
import type { PointerInput, Tool, ToolContext } from './tools/types.ts';

/**
 * - pending: one pointer down, under the drag threshold.
 * - tool: the active tool owns the drag.
 * - pan: one pointer (or Space, or the middle button) pans the camera.
 * - pinch: two or more pointers; ends only when every pointer is up.
 * - spent: the gesture ended early (long press, cancel); ignore until every pointer is up.
 */
type Mode = 'idle' | 'pending' | 'tool' | 'pan' | 'pinch' | 'spent';

export interface InputDeps {
  tool(): Tool;
  ctx(): ToolContext;
  spaceHeld(): boolean;
  /** Pan state changes, for the grab cursor. */
  onPan?(active: boolean): void;
}

interface Pt {
  x: number;
  y: number;
}

let pinchEmitted = false;

const kindOf = (e: PointerEvent): PointerInput['pointerType'] =>
  e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';

const slopFor = (kind: PointerInput['pointerType']) =>
  kind === 'mouse' ? tuning.touch.dragSlopMousePx : tuning.touch.dragSlopTouchPx;

/** Wheel deltas in px, whatever the delta mode. */
function wheelPx(e: WheelEvent, viewH: number): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewH : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

/**
 * Pointer arbitration for mouse, pen and touch on the canvas: drag threshold, tap, long press,
 * pan, two-finger pinch, wheel and trackpad zoom. Moves run at most once per animation frame.
 * Returns the clean-up that removes every listener.
 */
export function attachInput(svg: SVGSVGElement, deps: InputDeps): () => void {
  const pointers = new Map<number, Pt>();
  let mode: Mode = 'idle';
  let active: Tool | null = null;
  let start: PointerInput | null = null;
  let startId = -1;
  let last: Pt = { x: 0, y: 0 };
  let longPress = 0;
  let frame = 0;
  let queued: PointerEvent | null = null;
  let pinch: { dist: number; mid: Pt } | null = null;
  let box = svg.getBoundingClientRect();
  let boxAt = 0;

  const refreshBox = () => {
    box = svg.getBoundingClientRect();
    boxAt = performance.now();
  };
  const local = (e: { clientX: number; clientY: number }): Pt => ({
    x: e.clientX - box.left,
    y: e.clientY - box.top,
  });
  const toInput = (e: PointerEvent, screen: Pt = local(e), button = e.button): PointerInput => ({
    world: camera.screenToWorld(screen),
    screen,
    pointerType: kindOf(e),
    button,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey || e.ctrlKey,
    time: e.timeStamp,
  });

  const pinchState = (): { dist: number; mid: Pt } => {
    const [a, b] = [...pointers.values()];
    if (!a) return { dist: 0, mid: last };
    if (!b) return { dist: 0, mid: { x: a.x, y: a.y } };
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const setPan = (on: boolean) => deps.onPan?.(on);

  /** Roll back the tool gesture of the active tool. */
  const cancelTool = () => {
    window.clearTimeout(longPress);
    const tool = active;
    if (!tool) return;
    const ctx = deps.ctx();
    tool.onCancel?.(ctx);
    ctx.doc.cancelGesture();
    ctx.ui.setTransient(EMPTY_TRANSIENT);
  };

  const endPan = () => {
    camera.commitLive();
    setPan(false);
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    if (pointers.size === 0) refreshBox();
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone (a fast tap on some browsers).
    }
    pointers.set(e.pointerId, local(e));
    setPointerKind(kindOf(e));

    if (pointers.size >= 2) {
      if (mode === 'tool' || mode === 'pending') cancelTool();
      if (mode === 'pan') setPan(false);
      active = null;
      start = null;
      mode = 'pinch';
      pinch = pinchState();
      if (!pinchEmitted) {
        pinchEmitted = true;
        emit({ type: 'pinch-used' });
      }
      return;
    }

    if (e.pointerType === 'mouse') svg.focus({ preventScroll: true });
    active = deps.tool();
    start = toInput(e);
    startId = e.pointerId;
    last = start.screen;
    if (e.button === 1 || deps.spaceHeld()) {
      e.preventDefault();
      mode = 'pan';
      setPan(true);
      return;
    }
    mode = 'pending';
    window.clearTimeout(longPress);
    // A slow mouse click stays a click; long press is a touch and pen gesture.
    if (e.pointerType === 'mouse') return;
    longPress = window.setTimeout(() => {
      if (mode !== 'pending' || !start || !active) return;
      mode = 'spent';
      active.onLongPress?.(start, deps.ctx());
    }, tuning.touch.longPressMs);
  };

  const flush = () => {
    frame = 0;
    const e = queued;
    queued = null;
    if (!e) return;

    if (mode === 'pinch') {
      if (!pinch) return;
      const next = pinchState();
      // Pan first, so the world point under the old midpoint lands under the new one.
      camera.panBy(next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y);
      if (pinch.dist > 0 && next.dist > 0) camera.zoomAt(next.mid, next.dist / pinch.dist);
      pinch = next;
      return;
    }

    // A tool switch in the middle of a gesture rolls it back.
    if ((mode === 'tool' || mode === 'pending') && active && active !== deps.tool()) {
      cancelTool();
      mode = 'spent';
      return;
    }

    if (mode === 'idle') {
      if (pointers.size === 0 && e.pointerType !== 'touch') {
        deps.tool().onHover?.(toInput(e, local(e), -1), deps.ctx());
      }
      return;
    }
    if (e.pointerId !== startId || !start || !active) return;

    const p = toInput(e, local(e), start.button);
    if (mode === 'pending') {
      const moved = Math.hypot(p.screen.x - start.screen.x, p.screen.y - start.screen.y);
      if (moved < slopFor(start.pointerType)) return;
      window.clearTimeout(longPress);
      const owned = active.onDragStart?.(start, deps.ctx()) ?? false;
      mode = owned ? 'tool' : 'pan';
      if (!owned) setPan(true);
    }
    if (mode === 'tool') active.onDrag?.(p, start, deps.ctx());
    else if (mode === 'pan') camera.panBy(p.screen.x - last.x, p.screen.y - last.y);
    last = p.screen;
  };

  const move = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, local(e));
    else if (mode !== 'idle') return;
    queued = e;
    if (!frame) frame = requestAnimationFrame(flush);
  };

  const flushNow = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    flush();
  };

  const finish = () => {
    mode = 'idle';
    active = null;
    start = null;
    startId = -1;
    pinch = null;
  };

  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    // The last move lands before the end of the gesture.
    flushNow();
    pointers.delete(e.pointerId);

    if (mode === 'pinch') {
      if (pointers.size === 0) {
        finish();
        camera.commitLive();
      } else {
        pinch = pinchState();
      }
      return;
    }
    if (mode === 'spent') {
      if (pointers.size === 0) finish();
      return;
    }
    window.clearTimeout(longPress);
    if (e.pointerId !== startId) return;
    const tool = active;
    const s = start;
    const m = mode;
    finish();
    if (!tool || !s) return;
    if (m === 'pending') tool.onTap?.(s, deps.ctx());
    else if (m === 'tool') tool.onDragEnd?.(toInput(e, local(e), s.button), s, deps.ctx());
    else if (m === 'pan') endPan();
  };

  const cancel = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    queued = null;
    if (mode === 'tool' || mode === 'pending') cancelTool();
    if (mode === 'pan') setPan(false);
    if (mode !== 'pinch' && mode !== 'idle') mode = 'spent';
    if (pointers.size === 0) {
      finish();
      camera.commitLive();
    } else if (mode === 'pinch') {
      pinch = pinchState();
    }
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (performance.now() - boxAt > 500) refreshBox();
    const at = local(e);
    const { dx, dy } = wheelPx(e, box.height);
    if (e.ctrlKey) {
      // Trackpad pinch arrives as Ctrl+wheel with small deltas; a mouse notch is clamped.
      const d = Math.max(-30, Math.min(30, dy));
      camera.zoomAt(at, Math.exp(-d * tuning.camera.pinchWheelFactor));
    } else if (e.shiftKey || dx !== 0) {
      const px = e.shiftKey && dx === 0 ? dy : dx;
      camera.panBy(-px, e.shiftKey ? 0 : -dy);
    } else {
      camera.zoomAt(at, tuning.camera.wheelZoomBase ** -dy);
    }
  };

  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || (mode !== 'tool' && mode !== 'pending')) return;
    cancelTool();
    mode = 'spent';
    e.preventDefault();
  };

  const block = (e: Event) => e.preventDefault();

  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', cancel);
  svg.addEventListener('wheel', wheel, { passive: false });
  svg.addEventListener('contextmenu', block);
  svg.addEventListener('gesturestart', block);
  svg.addEventListener('gesturechange', block);
  svg.addEventListener('gestureend', block);
  window.addEventListener('keydown', key);

  return () => {
    if (mode === 'tool' || mode === 'pending') cancelTool();
    if (mode === 'pan' || mode === 'pinch') camera.commitLive();
    setPan(false);
    window.clearTimeout(longPress);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    queued = null;
    pointers.clear();
    finish();
    svg.removeEventListener('pointerdown', down);
    svg.removeEventListener('pointermove', move);
    svg.removeEventListener('pointerup', up);
    svg.removeEventListener('pointercancel', cancel);
    svg.removeEventListener('wheel', wheel);
    svg.removeEventListener('contextmenu', block);
    svg.removeEventListener('gesturestart', block);
    svg.removeEventListener('gesturechange', block);
    svg.removeEventListener('gestureend', block);
    window.removeEventListener('keydown', key);
  };
}
