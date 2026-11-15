import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { tuning } from '../juice/tuning.ts';
import { reducedMotion } from '../juice/tween.ts';
import type { Fill, LayerId, ProjectDoc } from '../model/types.ts';
import { isFlatFill } from '../render/PatternDefs.tsx';
import type { RenderContext } from '../render/RenderContext.ts';
import { fillsInUse, type SceneData, SceneLayers } from '../render/SceneSvg.tsx';
import { SCENE_THEME } from '../render/theme.ts';
import { camera, cameraStore } from '../store/cameraStore.ts';
import { docStore, useDoc } from '../store/docStore.ts';
import { useScene } from '../store/selectors.ts';
import { type UiState, uiStore, useUi } from '../store/uiStore.ts';
import { fitClearOfChrome, fitLotView, lotViewBounds, setToolKeyHandler } from '../ui/shortcuts.ts';
import { startFrontageSync } from './frontageSync.ts';
import { attachInput } from './InputRouter.ts';
import { Effects } from './overlay/Effects.tsx';
import { OverlaySvg } from './overlay/OverlaySvg.tsx';
import { setCursorSink, toolContext } from './toolContext.ts';
import { toolFor } from './tools/registry.ts';
import '../store/devApi.ts';
import './Canvas.css';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  const pref = useUi((s) => s.prefs.motion);
  const system = useSyncExternalStore(
    (notify) => {
      const mql = matchMedia(REDUCE_QUERY);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => matchMedia(REDUCE_QUERY).matches,
  );
  return pref === 'auto' ? system : pref === 'reduced';
}

const visibleLayers = (layers: UiState['layers']): Record<LayerId, boolean> => ({
  grid: layers.grid.visible,
  context: layers.context.visible,
  textures: layers.textures.visible,
  items: layers.items.visible,
  openings: layers.openings.visible,
  measures: layers.measures.visible,
});

/**
 * Committed zoom for the pattern LOD. It changes only when a fill crosses the flat-color threshold,
 * so the areas re-render on an LOD bucket change and never on a plain zoom.
 */
function useLodZoom(fills: Fill[], ctx: RenderContext): number {
  const key = useStore(cameraStore, (st) =>
    fills.map((f) => (isFlatFill(f, ctx, st.committed.zoom) ? '1' : '0')).join(''),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bucket key is the trigger
  return useMemo(() => cameraStore.getState().committed.zoom, [key, fills]);
}

const isBlank = (doc: ProjectDoc) =>
  doc.areas.length === 0 &&
  doc.items.length === 0 &&
  doc.openings.length === 0 &&
  doc.rulers.length === 0 &&
  doc.walkways.length === 0;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t instanceof HTMLButtonElement
  );
}

/**
 * Lot reveal after a new project: outline draw, sidewalk slide, neighbor stagger with a shimmer,
 * muro, grid fade and a camera fit. A tap skips it. Returns the clean-up.
 */
function playLotReveal(svg: SVGSVGElement, doc: ProjectDoc): () => void {
  const bounds = fitClearOfChrome(lotViewBounds(doc.lot));
  const pad = 0;
  camera.fit(bounds, pad, false);
  if (reducedMotion()) return () => {};

  const r = tuning.lotReveal;
  const { vw, vh } = camera.get();
  camera.zoomAt({ x: vw / 2, y: vh / 2 }, 0.72);
  camera.commitLive();

  const anims: Animation[] = [];
  const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    anims.push(el.animate(keyframes, { fill: 'backwards', ...options }));
  };
  const all = (sel: string) => [...svg.querySelectorAll(`[data-reveal="${sel}"]`)];
  const enter = 'cubic-bezier(0, 0, 0.2, 1)';

  for (const el of all('ground')) play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
  for (const el of all('outline')) {
    play(
      el,
      [
        { opacity: 1, strokeDashoffset: 1 },
        { opacity: 1, strokeDashoffset: 0, offset: 0.85 },
        { opacity: 0, strokeDashoffset: 0 },
      ],
      { duration: r.outlineMs * 1.25, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'none' },
    );
  }
  for (const el of all('lotline')) {
    play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: r.outlineMs * 0.85 });
  }
  for (const el of all('street')) {
    const dx = Number(el.getAttribute('data-dx') ?? 0);
    const dy = Number(el.getAttribute('data-dy') ?? 0);
    play(
      el,
      [
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
        { transform: 'translate(0px, 0px)', opacity: 1 },
      ],
      { duration: r.sidewalkMs, delay: r.outlineMs * 0.5, easing: enter },
    );
  }
  all('neighbor').forEach((el, i) => {
    play(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      delay: r.outlineMs * 0.6 + i * r.neighborStaggerMs,
      easing: enter,
    });
  });
  for (const el of all('shimmer')) {
    const travel = Number(el.getAttribute('data-travel') ?? 0);
    play(
      el,
      [
        { transform: 'translateX(0px)', opacity: 1 },
        { transform: `translateX(${travel}px)`, opacity: 1 },
      ],
      {
        duration: 900,
        delay: r.outlineMs * 0.6,
        iterations: 2,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'none',
      },
    );
  }
  for (const el of all('muro')) {
    play(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 300,
      delay: r.outlineMs + r.sidewalkMs * 0.4,
    });
  }
  for (const el of all('grid')) {
    play(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 400,
      delay: r.outlineMs + r.sidewalkMs * 0.7,
    });
  }

  const fitTimer = window.setTimeout(() => camera.fit(bounds, pad, true), r.outlineMs * 0.35);
  const skip = () => {
    window.clearTimeout(fitTimer);
    for (const a of anims) a.finish();
    camera.fit(bounds, pad, false);
  };
  svg.addEventListener('pointerdown', skip, { once: true, capture: true });
  const done = Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
  void done.then(() => svg.removeEventListener('pointerdown', skip, { capture: true }));

  return () => {
    window.clearTimeout(fitTimer);
    svg.removeEventListener('pointerdown', skip, { capture: true });
    for (const a of anims) a.cancel();
  };
}

/**
 * The plan canvas. The viewBox shows the committed camera; during a gesture the scene group gets a
 * matrix from committed to live, so pan and zoom never render React. Input goes through the router.
 */
export function Canvas(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGGElement>(null);
  const spaceRef = useRef(false);
  const revealedRef = useRef<string | null>(null);
  const revealStop = useRef<(() => void) | null>(null);

  const doc = useDoc((s) => s.doc);
  const live = useDoc(
    (s) => s.gesture !== null && s.doc !== null && s.doc.areas !== s.gesture.base.areas,
  );
  const scene = useScene();
  const layers = useUi((s) => s.layers);
  const toolId = useUi((s) => s.tool);
  const reduced = useReducedMotion();

  const ctx = useMemo<RenderContext>(
    () => ({
      mode: 'screen',
      theme: SCENE_THEME,
      print: null,
      layers: visibleLayers(layers),
      reducedMotion: reduced,
    }),
    [layers, reduced],
  );
  const fills = useMemo(() => (doc ? fillsInUse(doc) : []), [doc]);
  const pxPerMm = useLodZoom(fills, ctx);
  const data = useMemo<SceneData | null>(
    () => (doc ? { doc, scene, pxPerMm, live } : null),
    [doc, scene, pxPerMm, live],
  );

  // Camera → DOM, imperatively.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const g = liveRef.current;
    const host = hostRef.current;
    if (!svg || !g || !host) return;
    let shown = { cx: Number.NaN, cy: Number.NaN, zoom: Number.NaN, vw: 0, vh: 0 };
    let idle = 0;

    const apply = () => {
      const st = camera.get();
      const c = st.committed;
      if (
        c.cx !== shown.cx ||
        c.cy !== shown.cy ||
        c.zoom !== shown.zoom ||
        st.vw !== shown.vw ||
        st.vh !== shown.vh
      ) {
        const w = st.vw / c.zoom;
        const h = st.vh / c.zoom;
        svg.setAttribute('viewBox', `${c.cx - w / 2} ${c.cy - h / 2} ${w} ${h}`);
        if (c.zoom !== shown.zoom) svg.style.setProperty('--mmpp', String(1 / c.zoom));
        shown = { ...c, vw: st.vw, vh: st.vh };
      }
      window.clearTimeout(idle);
      if (camera.isLive()) {
        const k = st.zoom / c.zoom;
        g.setAttribute(
          'transform',
          `matrix(${k} 0 0 ${k} ${c.cx - k * st.cx} ${c.cy - k * st.cy})`,
        );
        idle = window.setTimeout(() => camera.commitLive(), tuning.camera.liveCommitIdleMs);
      } else {
        g.removeAttribute('transform');
      }
    };

    const box = host.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) camera.setViewport(box.width, box.height);
    apply();
    const unsubscribe = camera.subscribe(apply);
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) camera.setViewport(width, height);
    });
    ro.observe(host);
    return () => {
      window.clearTimeout(idle);
      unsubscribe();
      ro.disconnect();
    };
  }, []);

  useEffect(() => startFrontageSync(), []);

  // Input router, tool keys, Space pan and the hover cursor.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const setCursor = (c: string | null) => {
      svg.style.setProperty(
        '--tool-cursor',
        c ?? toolFor(uiStore.getState().tool).cursor ?? 'default',
      );
    };
    setCursorSink(setCursor);
    setToolKeyHandler((e) => toolFor(uiStore.getState().tool).onKey?.(e, toolContext) ?? false);

    const detach = attachInput(svg, {
      tool: () => toolFor(uiStore.getState().tool),
      ctx: () => toolContext,
      spaceHeld: () => spaceRef.current,
      onPan: (on) => {
        svg.dataset.pan = on ? 'true' : '';
      },
    });

    const keyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (spaceRef.current) return;
      spaceRef.current = true;
      svg.dataset.space = 'true';
    };
    const release = () => {
      spaceRef.current = false;
      svg.dataset.space = '';
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') release();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', release);
    return () => {
      detach();
      setToolKeyHandler(null);
      setCursorSink(null);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  // Tool lifecycle: deactivate the old tool, activate the new one.
  useEffect(() => {
    const tool = toolFor(toolId);
    tool.onActivate?.(toolContext);
    const svg = svgRef.current;
    svg?.style.setProperty('--tool-cursor', tool.cursor ?? 'default');
    return () => tool.onDeactivate?.(toolContext);
  }, [toolId]);

  // A new doc: reveal a blank lot, or fit the view at once.
  const docId = doc?.id ?? null;
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !docId || revealedRef.current === docId) return;
    revealedRef.current = docId;
    revealStop.current?.();
    revealStop.current = null;
    const current = docStore.getState().doc;
    if (!current) return;
    if (isBlank(current)) revealStop.current = playLotReveal(svg, current);
    else fitLotView(current.lot, false);
  }, [docId]);

  useEffect(
    () => () => {
      revealStop.current?.();
      revealStop.current = null;
    },
    [],
  );

  return (
    <div className="canvas" ref={hostRef} style={{ background: SCENE_THEME.world }}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        role="application"
        aria-label="Área de desenho da planta"
        aria-roledescription="planta"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: role="application" makes the canvas a keyboard target
        tabIndex={0}
        preserveAspectRatio="xMidYMid meet"
      >
        <g ref={liveRef}>{data ? <SceneLayers data={data} ctx={ctx} /> : null}</g>
      </svg>
      <OverlaySvg ctx={ctx} />
      <Effects />
    </div>
  );
}
