import { createStore } from 'zustand';
import type { Rect } from '../geometry/types.ts';
import { tuning } from '../juice/tuning.ts';
import { easeInOut, type TweenHandle, tween } from '../juice/tween.ts';
import type { Mm, Vec } from '../model/types.ts';

export interface CameraState {
  cx: Mm;
  cy: Mm;
  /** Screen px per mm, current (live during gestures). */
  zoom: number;
  vw: number;
  vh: number;
  /** What the viewBox shows. */
  committed: { cx: Mm; cy: Mm; zoom: number };
}

export interface CameraApi {
  get(): CameraState;
  subscribe(fn: (st: CameraState) => void): () => void;
  worldToScreen(v: Vec): { x: number; y: number };
  screenToWorld(p: { x: number; y: number }): Vec;
  mmPerPx(): number;
  zoomAt(p: { x: number; y: number }, factor: number): void;
  panBy(dxPx: number, dyPx: number): void;
  fit(bounds: Rect, paddingPx: number, animate: boolean): void;
  setViewport(w: number, h: number): void;
  commitLive(): void;
  isLive(): boolean;
}

export const cameraStore = createStore<CameraState>()(() => ({
  cx: 5000,
  cy: 12500,
  zoom: 0.02,
  vw: 320,
  vh: 480,
  committed: { cx: 5000, cy: 12500, zoom: 0.02 },
}));

const s = () => cameraStore.getState();
const clampZoom = (z: number) =>
  Math.min(tuning.camera.maxZoom, Math.max(tuning.camera.minZoom, z));

let fitTween: TweenHandle | null = null;
const stopFit = () => {
  fitTween?.cancel();
  fitTween = null;
};

export const camera: CameraApi = {
  get: s,
  subscribe: (fn) => cameraStore.subscribe(fn),
  worldToScreen: ({ x, y }) => {
    const st = s();
    return { x: (x - st.cx) * st.zoom + st.vw / 2, y: (y - st.cy) * st.zoom + st.vh / 2 };
  },
  screenToWorld: ({ x, y }) => {
    const st = s();
    return { x: (x - st.vw / 2) / st.zoom + st.cx, y: (y - st.vh / 2) / st.zoom + st.cy };
  },
  mmPerPx: () => 1 / s().zoom,
  zoomAt: (p, factor) => {
    stopFit();
    const st = s();
    const before = camera.screenToWorld(p);
    const zoom = clampZoom(st.zoom * factor);
    cameraStore.setState({
      zoom,
      cx: before.x - (p.x - st.vw / 2) / zoom,
      cy: before.y - (p.y - st.vh / 2) / zoom,
    });
  },
  panBy: (dx, dy) => {
    stopFit();
    cameraStore.setState((st) => ({ cx: st.cx - dx / st.zoom, cy: st.cy - dy / st.zoom }));
  },
  fit: (b, pad, animate) => {
    stopFit();
    const st = s();
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const availW = Math.max(1, st.vw - 2 * pad);
    const availH = Math.max(1, st.vh - 2 * pad);
    const zoom = w > 0 && h > 0 ? clampZoom(Math.min(availW / w, availH / h)) : st.zoom;
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    if (!animate) {
      cameraStore.setState({ cx, cy, zoom, committed: { cx, cy, zoom } });
      return;
    }
    const from = { cx: st.cx, cy: st.cy, zoom: st.zoom };
    const zoomRatio = zoom / from.zoom;
    const handle = tween(
      tuning.camera.fitMs,
      (t) => {
        cameraStore.setState({
          cx: from.cx + (cx - from.cx) * t,
          cy: from.cy + (cy - from.cy) * t,
          // Geometric interpolation keeps the perceived zoom speed constant.
          zoom: from.zoom * zoomRatio ** t,
        });
      },
      easeInOut,
    );
    fitTween = handle;
    void handle.finished.then(() => {
      if (fitTween !== handle) return;
      fitTween = null;
      camera.commitLive();
    });
  },
  setViewport: (vw, vh) => cameraStore.setState({ vw, vh }),
  commitLive: () =>
    cameraStore.setState((st) => ({ committed: { cx: st.cx, cy: st.cy, zoom: st.zoom } })),
  isLive: () => {
    const st = s();
    return st.cx !== st.committed.cx || st.cy !== st.committed.cy || st.zoom !== st.committed.zoom;
  },
};
