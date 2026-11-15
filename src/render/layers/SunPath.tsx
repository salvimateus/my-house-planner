import { type ReactElement, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { formatClock, sunArc, sunArcPoint, sunDirection, sunPosition } from '../../geometry/sun.ts';
import type { Lot, Vec } from '../../model/types.ts';
import { camera, cameraStore } from '../../store/cameraStore.ts';
import { sunStore, useSun } from '../../store/sunStore.ts';

/** Arc distance beyond the lot half diagonal. */
const ARC_GAP = 4000;
/** Screen px. */
const DISC_R = 9;
const GLOW_R = 22;
const LABEL_GAP = 12;
const EDGE_MARGIN = 28;
const HUD_PAD = 10;
const HUD_SELECTORS = ['.sun-bar', '.canvas-controls', '.status-chip'];

const RISE = [255, 138, 61];
const NOON = [255, 201, 60];
const SET = [242, 85, 44];

function arcColor(t: number): string {
  const [a, b, k] = t < 0.5 ? [RISE, NOON, t * 2] : [NOON, SET, (t - 0.5) * 2];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** "5:17" */
const shortClock = (m: number) => formatClock(m).replace(/^0/, '');

type Anchor = 'start' | 'middle' | 'end';
const anchorFor = (dir: Vec): Anchor => (dir.x > 0.3 ? 'start' : dir.x < -0.3 ? 'end' : 'middle');

const place = (el: SVGGElement | null, p: Vec, scale: number) =>
  el?.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${scale})`);

/**
 * The day's sun path on a circle around the lot, the sun disc on it (closer to the lot when higher),
 * and an edge marker when the disc is out of view. Static geometry renders once per day and lot;
 * the disc, the marker and the screen-size labels move through refs.
 */
export function SunPath({ lot }: { lot: Lot }): ReactElement {
  const date = useSun((s) => s.date);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const center = useMemo(() => ({ x: lot.width / 2, y: lot.depth / 2 }), [lot.width, lot.depth]);
  const radius = Math.round(Math.hypot(lot.width, lot.depth) / 2 + ARC_GAP);
  const arc = useMemo(
    () => sunArc(date, lot.northDeg, center, radius),
    [date, lot.northDeg, center, radius],
  );
  const north = useMemo(() => sunDirection(0, lot.northDeg), [lot.northDeg]);
  const ends = useMemo(
    () => [
      { key: 'rise', dir: arc.rise, text: `Nascente ${shortClock(arc.times.sunrise)}` },
      { key: 'set', dir: arc.set, text: `Poente ${shortClock(arc.times.sunset)}` },
    ],
    [arc],
  );

  const disc = useRef<SVGGElement>(null);
  const edge = useRef<SVGGElement>(null);
  const edgeText = useRef<SVGTextElement>(null);
  const labels = useRef<(SVGGElement | null)[]>([]);
  const northTick = useRef<SVGGElement>(null);
  const glowEl = useRef<SVGCircleElement>(null);

  useLayoutEffect(() => {
    const at = (dir: Vec, r: number): Vec => ({
      x: center.x + dir.x * r,
      y: center.y + dir.y * r,
    });
    const hudRects = (svg: SVGSVGElement): DOMRect[] => {
      const host = svg.getBoundingClientRect();
      const out: DOMRect[] = [];
      for (const sel of HUD_SELECTORS) {
        const el = svg.closest('.shell-stage')?.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) {
          out.push(new DOMRect(r.left - host.left, r.top - host.top, r.width, r.height));
        }
      }
      return out;
    };

    const apply = () => {
      const st = sunStore.getState();
      const cam = camera.get();
      const mmpp = 1 / cam.committed.zoom;
      const { sunrise, sunset } = arc.times;
      const night = st.minutes < sunrise || st.minutes > sunset;
      const pos = sunPosition(st.date, st.minutes);

      for (const [i, end] of ends.entries()) {
        place(labels.current[i] ?? null, at(end.dir, radius + LABEL_GAP * mmpp), mmpp);
      }
      place(northTick.current, at(north, radius), mmpp);

      const p = sunArcPoint(arc, st.minutes);
      // Height reads as size and glow: a higher sun is a bit larger and brighter.
      const lift = night ? 0 : Math.min(1, Math.max(0, pos.elevation / 90));
      const g = disc.current;
      if (g) {
        place(g, p, mmpp * (0.8 + 0.5 * lift));
        g.setAttribute('opacity', night ? '0.35' : '1');
      }
      glowEl.current?.setAttribute('opacity', (0.55 + 0.45 * lift).toFixed(3));

      const mark = edge.current;
      const svg = g?.ownerSVGElement;
      if (!mark || !svg) return;
      const s = camera.worldToScreen(p);
      const m = EDGE_MARGIN;
      const inView = s.x >= 0 && s.x <= cam.vw && s.y >= 0 && s.y <= cam.vh;
      if (inView || cam.vw < 2 * m || cam.vh < 2 * m) {
        mark.setAttribute('visibility', 'hidden');
        return;
      }
      const c = { x: cam.vw / 2, y: cam.vh / 2 };
      const v = { x: s.x - c.x, y: s.y - c.y };
      const f = Math.min(
        v.x ? (c.x - m) / Math.abs(v.x) : Infinity,
        v.y ? (c.y - m) / Math.abs(v.y) : Infinity,
      );
      const q = { x: c.x + v.x * f, y: c.y + v.y * f };
      for (const box of hudRects(svg)) {
        const pad = HUD_PAD + DISC_R;
        if (
          q.x < box.left - pad ||
          q.x > box.right + pad ||
          q.y < box.top - pad ||
          q.y > box.bottom + pad
        ) {
          continue;
        }
        const above = box.top - pad;
        if (above >= m) q.y = above;
        else q.x = Math.max(m, box.left - pad);
      }
      const k = cam.zoom / cam.committed.zoom;
      place(mark, camera.screenToWorld(q), mmpp / k);
      mark.setAttribute('visibility', 'visible');
      mark.setAttribute('opacity', night ? '0.55' : '1');
      const t = edgeText.current;
      if (t) {
        const right = v.x > 0;
        t.textContent = formatClock(st.minutes);
        t.setAttribute('x', String(right ? -(DISC_R + 6) : DISC_R + 6));
        t.setAttribute('text-anchor', right ? 'end' : 'start');
      }
    };

    apply();
    const offSun = sunStore.subscribe(apply);
    const offCam = cameraStore.subscribe(apply);
    return () => {
      offSun();
      offCam();
    };
  }, [arc, ends, center, radius, north]);

  const glow = `${uid}-glow`;
  return (
    <g className="sun-path">
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#FFD54A" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="#FFB23E" stopOpacity="0.28" />
          <stop offset="1" stopColor="#FF9A3C" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="sun-path-arc">
        {arc.pieces.map((pc) => (
          <path key={pc.t} d={pc.d} stroke={arcColor(pc.t)} />
        ))}
      </g>
      <g ref={northTick} className="sun-path-north">
        <line x1={0} y1={-5} x2={0} y2={5} transform={`rotate(${lot.northDeg})`} />
        <text
          x={north.x * 14}
          y={north.y * 14}
          textAnchor="middle"
          dominantBaseline="central"
          className="sun-path-label"
        >
          N
        </text>
      </g>
      {ends.map((end, i) => (
        <g
          key={end.key}
          ref={(el) => {
            labels.current[i] = el;
          }}
        >
          <text
            className="sun-path-label"
            textAnchor={anchorFor(end.dir)}
            dominantBaseline="central"
            y={end.dir.y > 0.3 ? 6 : end.dir.y < -0.3 ? -6 : 0}
          >
            {end.text}
          </text>
        </g>
      ))}
      <g ref={disc} className="sun-path-disc">
        <circle ref={glowEl} r={GLOW_R} fill={`url(#${glow})`} />
        <circle r={DISC_R} className="sun-path-sun" />
      </g>
      <g ref={edge} className="sun-path-edge" visibility="hidden">
        <circle r={DISC_R + 7} fill={`url(#${glow})`} />
        <circle r={DISC_R - 1} className="sun-path-sun" />
        <text ref={edgeText} className="sun-path-edge-time" dominantBaseline="central" />
      </g>
    </g>
  );
}
