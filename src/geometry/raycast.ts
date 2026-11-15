import type { Axis, Mm, Ruler, Vec } from '../model/types.ts';
import type { Face, Rect, RulerDerived, Span } from './types.ts';

/** Clear span through `p` along `axis`, from solid face to solid face inside `bounds`. Null inside a solid. */
export function clearSpan(p: Vec, axis: Axis, solids: Rect[], bounds: Rect): Span | null {
  if (axis === 'h') {
    let left = bounds.x0;
    let right = bounds.x1;
    for (const o of solids) {
      if (p.y < o.y0 || p.y > o.y1) continue;
      if (o.x1 <= p.x) left = Math.max(left, o.x1);
      else if (o.x0 >= p.x) right = Math.min(right, o.x0);
      else return null;
    }
    return { a: { x: left, y: p.y }, b: { x: right, y: p.y }, length: right - left, axis };
  }
  let top = bounds.y0;
  let bottom = bounds.y1;
  for (const o of solids) {
    if (p.x < o.x0 || p.x > o.x1) continue;
    if (o.y1 <= p.y) top = Math.max(top, o.y1);
    else if (o.y0 >= p.y) bottom = Math.min(bottom, o.y0);
    else return null;
  }
  return { a: { x: p.x, y: top }, b: { x: p.x, y: bottom }, length: bottom - top, axis };
}

/** 'auto' picks the shorter span through the origin (corridor width). */
export function fitSpan(
  origin: Vec,
  axis: Axis | 'auto',
  solids: Rect[],
  bounds: Rect,
): Span | null {
  if (axis !== 'auto') return clearSpan(origin, axis, solids, bounds);
  const h = clearSpan(origin, 'h', solids, bounds);
  const v = clearSpan(origin, 'v', solids, bounds);
  if (!h) return v;
  if (!v) return h;
  return h.length <= v.length ? h : v;
}

/** Runs on every derive, so a fit ruler follows the walls. Solids = house + boundary wall bodies, no gaps. */
export function resolveRuler(r: Ruler, solids: Rect[], bounds: Rect): RulerDerived {
  if (r.mode === 'free') {
    return {
      a: r.a,
      b: r.b,
      length: Math.round(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y)),
      valid: true,
    };
  }
  const s = clearSpan(r.origin, r.axis, solids, bounds);
  return s && s.length > 0
    ? { a: s.a, b: s.b, length: s.length, valid: true }
    : { a: r.origin, b: r.origin, length: 0, valid: false };
}

/** Sticks a free ruler endpoint to the nearest wall face, measured perpendicular to the ruler axis. */
export function snapRulerEnd(p: Vec, axis: Axis | null, faces: Face[], tolMm: Mm): Vec {
  let best = p;
  let bestD = tolMm;
  for (const f of faces) {
    if (axis === 'h' && f.axis !== 'v') continue;
    if (axis === 'v' && f.axis !== 'h') continue;
    const along = f.axis === 'v' ? p.y : p.x;
    if (along < f.from || along > f.to) continue;
    const d = Math.abs((f.axis === 'v' ? p.x : p.y) - f.at);
    if (d < bestD) {
      bestD = d;
      best = f.axis === 'v' ? { x: f.at, y: p.y } : { x: p.x, y: f.at };
    }
  }
  return best;
}
