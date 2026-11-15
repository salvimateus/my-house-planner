import type { ReactElement } from 'react';
import { rectsOverlap } from '../geometry/shape.ts';
import type { Rect, Scene } from '../geometry/types.ts';
import type { Id, Lot, ProjectDoc, Side } from '../model/types.ts';
import { formatArea, formatLength, formatOpening } from '../model/units.ts';
import type { SceneTheme } from '../render/RenderContext.ts';
import type { SheetLayout } from './layout.ts';
import { textWidth } from './measure.ts';
import type { ExportOptions } from './types.ts';

// Paper sizes in mm.
const NAME = 2.8;
const AREA_RATIO = 2.2 / 2.8;
const NAME_MIN = 1.8;
const WALL_DIM = 1.6;
const WALL_DIM_MIN_EDGE = 15;
const OPENING = 1.4;
const OPENING_MIN_WIDTH = 6;
const LOT_DIM = 2.2;
const RULER = 1.8;
const STREET = 2.2;
const NUMBER_R = 1.5;
export const HALO = 0.35;
/** Clear space around every label box, halo included. */
const PAD = HALO / 2 + 0.25;
const ASCENT = 0.74;
const DESCENT = 0.2;

export interface PrintText {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  fill: string;
  vertical: boolean;
  halo: boolean;
}

export interface PrintNumber {
  n: number;
  x: number;
  y: number;
}

export interface PrintRulerPill {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintLabels {
  texts: PrintText[];
  numbers: PrintNumber[];
  pills: PrintRulerPill[];
  /** Areas whose name did not fit: number shown in the room and in the area table. */
  numbered: Map<Id, number>;
}

interface Placer {
  boxes: Rect[];
  bounds: Rect;
}

const inflate = (r: Rect, d: number): Rect => ({
  x0: r.x0 - d,
  y0: r.y0 - d,
  x1: r.x1 + d,
  y1: r.y1 + d,
});

const inside = (r: Rect, b: Rect) => r.x0 >= b.x0 && r.y0 >= b.y0 && r.x1 <= b.x1 && r.y1 <= b.y1;

/** Takes the box when it is inside the visible drawing and clear of every placed label. */
function tryPlace(p: Placer, box: Rect): boolean {
  const padded = inflate(box, PAD);
  if (!inside(box, p.bounds)) return false;
  if (p.boxes.some((b) => rectsOverlap(b, padded))) return false;
  p.boxes.push(padded);
  return true;
}

/** Box of a text by its baseline anchor (middle), horizontal or rotated -90°. */
function textBox(x: number, y: number, w: number, size: number, vertical: boolean): Rect {
  if (!vertical) {
    return { x0: x - w / 2, x1: x + w / 2, y0: y - ASCENT * size, y1: y + DESCENT * size };
  }
  // rotate(-90): local +x runs to world -y, local +y to world +x.
  return { x0: x - ASCENT * size, x1: x + DESCENT * size, y0: y - w / 2, y1: y + w / 2 };
}

const streetSides = (lot: Lot): Side[] =>
  lot.cornerSide ? [lot.frontSide, lot.cornerSide] : [lot.frontSide];

/**
 * Print label layout in paper mm. Priority: room name and area, rulers, lot dimensions, street
 * name, wall dimensions, opening sizes. A label that would touch a placed one, or leave the
 * visible drawing, is dropped; a room name that does not fit becomes a circled number.
 */
export function layoutPrintLabels(
  doc: ProjectDoc,
  scene: Scene,
  layout: SheetLayout,
  opts: ExportOptions,
  theme: SceneTheme,
): PrintLabels {
  const { scale, view, drawing: dr, clip } = layout;
  const px = (wx: number) => dr.x0 + (wx - view.x0) / scale;
  const py = (wy: number) => dr.y0 + (wy - view.y0) / scale;
  const p: Placer = { boxes: [], bounds: inflate(clip, -0.4) };
  const out: PrintLabels = { texts: [], numbers: [], pills: [], numbered: new Map() };
  const add = (t: Omit<PrintText, 'halo'>, halo = true) => out.texts.push({ ...t, halo });

  // 1. Room name and area, inside the largest free rectangle of each area.
  let next = 1;
  for (const a of doc.areas) {
    const d = scene.areas.get(a.id);
    if (!d || d.visible.length === 0) continue;
    const name = a.name.trim() || 'Sem nome';
    const area = formatArea(d.netArea);
    const cx = px(d.label.x);
    const cy = py(d.label.y);
    let placed = false;
    if (d.label.rect) {
      const r = d.label.rect;
      const halfW = Math.min(cx - px(r.x0), px(r.x1) - cx) - 0.6;
      const halfH = Math.min(cy - py(r.y0), py(r.y1) - cy) - 0.6;
      const nameW = textWidth(name, 1, true);
      const areaW = textWidth(area, AREA_RATIO);
      // Block height per unit of name size: name ascent, line gap, area line and descent.
      const blockH = ASCENT + 0.3 + AREA_RATIO * (ASCENT + DESCENT);
      const s = Math.min(NAME, (2 * halfW) / Math.max(nameW, areaW), (2 * halfH) / blockH);
      if (s >= NAME_MIN) {
        const sa = s * AREA_RATIO;
        const top = cy - (blockH * s) / 2;
        const nameY = top + ASCENT * s;
        const areaY = nameY + 0.3 * s + ASCENT * sa;
        const box = {
          x0: cx - (Math.max(nameW, areaW) * s) / 2,
          x1: cx + (Math.max(nameW, areaW) * s) / 2,
          y0: top,
          y1: top + blockH * s,
        };
        if (tryPlace(p, box)) {
          add({
            text: name,
            x: cx,
            y: nameY,
            size: s,
            bold: true,
            fill: theme.label,
            vertical: false,
          });
          add({
            text: area,
            x: cx,
            y: areaY,
            size: sa,
            bold: false,
            fill: theme.labelSub,
            vertical: false,
          });
          placed = true;
        }
      }
    }
    if (!placed) {
      const box = { x0: cx - NUMBER_R, x1: cx + NUMBER_R, y0: cy - NUMBER_R, y1: cy + NUMBER_R };
      if (!inside(box, p.bounds)) continue;
      p.boxes.push(inflate(box, PAD));
      const n = next++;
      out.numbered.set(a.id, n);
      out.numbers.push({ n, x: cx, y: cy });
    }
  }

  // 2. Rulers: a pill at the middle of each valid ruler.
  if (opts.rulers) {
    for (const r of doc.rulers) {
      const d = scene.rulers.get(r.id);
      if (!d?.valid || d.length <= 0) continue;
      const text = formatLength(d.length);
      const w = textWidth(text, RULER, true) + 1.6;
      const h = RULER + 1.2;
      const x = px((d.a.x + d.b.x) / 2);
      const y = py((d.a.y + d.b.y) / 2);
      const box = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
      if (!tryPlace(p, box)) continue;
      out.pills.push({ x: box.x0, y: box.y0, w, h });
      add(
        {
          text,
          x,
          y: y + RULER * 0.36,
          size: RULER,
          bold: true,
          fill: theme.ruler,
          vertical: false,
        },
        false,
      );
    }
  }

  // 3. Lot width and depth outside the lot line, on a side without a street when possible.
  const lot = doc.lot;
  const streets = streetSides(lot);
  if (opts.lotSize) {
    const widthSide: Side = streets.includes('top') ? 'bottom' : 'top';
    const depthSide: Side = streets.includes('left') ? 'right' : 'left';
    const gap = 1.6;
    const wText = formatLength(lot.width);
    const ww = textWidth(wText, LOT_DIM, true);
    const wy = widthSide === 'top' ? py(0) - gap : py(lot.depth) + gap + ASCENT * LOT_DIM;
    const wx = px(lot.width / 2);
    if (tryPlace(p, textBox(wx, wy, ww, LOT_DIM, false))) {
      add({
        text: wText,
        x: wx,
        y: wy,
        size: LOT_DIM,
        bold: true,
        fill: theme.dim,
        vertical: false,
      });
    }
    const dText = formatLength(lot.depth);
    const dw = textWidth(dText, LOT_DIM, true);
    const dx = depthSide === 'left' ? px(0) - gap : px(lot.width) + gap + ASCENT * LOT_DIM;
    const dy = py(lot.depth / 2);
    if (tryPlace(p, textBox(dx, dy, dw, LOT_DIM, true))) {
      add({
        text: dText,
        x: dx,
        y: dy,
        size: LOT_DIM,
        bold: true,
        fill: theme.dim,
        vertical: true,
      });
    }
  }

  // 4. Street name, in the visible street band (or the sidewalk when the street is cut off).
  for (const side of streets) {
    const text = 'RUA';
    const w = textWidth(text, STREET, true);
    const vertical = side === 'left' || side === 'right';
    const s = lot.sidewalkWidth / scale;
    // Lot edge and the outer edge of the visible drawing on that side, in paper mm.
    const edge = { top: py(0), bottom: py(lot.depth), left: px(0), right: px(lot.width) }[side];
    const limit = { top: clip.y0, bottom: clip.y1, left: clip.x0, right: clip.x1 }[side];
    const dir = side === 'top' || side === 'left' ? -1 : 1;
    const room = (limit - edge) * dir;
    if (room < STREET + 1) continue;
    const band = room - s >= STREET + 1.5 ? [s, room] : [0, Math.min(s, room)];
    const mid = edge + dir * ((band[0] ?? 0) + (band[1] ?? 0)) * 0.5;
    const along = vertical ? py(lot.depth / 2) : px(lot.width / 2);
    const x = vertical ? mid + (ASCENT * STREET) / 2 : along;
    const y = vertical ? along : mid + (ASCENT * STREET) / 2;
    if (tryPlace(p, textBox(x, y, w, STREET, vertical))) {
      add({ text, x, y, size: STREET, bold: true, fill: '#9A9A95', vertical }, false);
    }
  }

  // 5. Wall dimensions inside rooms and covered areas.
  if (opts.measures) {
    const gap = 0.9;
    for (const a of doc.areas) {
      if (a.kind === 'outdoor') continue;
      const d = scene.areas.get(a.id);
      if (!d) continue;
      for (const e of d.edges) {
        if (e.length / scale < WALL_DIM_MIN_EDGE) continue;
        const text = formatLength(e.length);
        const w = textWidth(text, WALL_DIM);
        const off = e.inward > 0 ? gap + ASCENT * WALL_DIM : -gap;
        const vertical = e.angle !== 0;
        const x = vertical ? px(e.x) + off : px(e.x);
        const y = vertical ? py(e.y) : py(e.y) + off;
        if (tryPlace(p, textBox(x, y, w, WALL_DIM, vertical))) {
          add({ text, x, y, size: WALL_DIM, bold: false, fill: theme.dim, vertical });
        }
      }
    }
  }

  // 6. Opening sizes, outside the leaf side of each opening.
  if (opts.openingSizes) {
    const gap = 0.7;
    for (const o of doc.openings) {
      const d = scene.openings.get(o.id);
      if (!d?.center || !d.valid || o.width / scale < OPENING_MIN_WIDTH) continue;
      const thickness = d.run?.thickness ?? doc.structure.external;
      const away = -o.side;
      const text = formatOpening(o.width, o.height);
      const w = textWidth(text, OPENING);
      const off = away * (thickness / 2 / scale + gap) + (away > 0 ? ASCENT * OPENING : 0);
      const vertical = o.axis === 'v';
      const x = vertical ? px(d.center.x) + off : px(d.center.x);
      const y = vertical ? py(d.center.y) : py(d.center.y) + off;
      if (tryPlace(p, textBox(x, y, w, OPENING, vertical))) {
        add({ text, x, y, size: OPENING, bold: false, fill: theme.openingLabel, vertical });
      }
    }
  }

  return out;
}

const NUMBER_FILL = '#FFFFFF';

/** Draws the placed labels in paper mm: white halos first, then the texts. */
export function PrintLabelsView({
  labels,
  theme,
}: {
  labels: PrintLabels;
  theme: SceneTheme;
}): ReactElement {
  const attrs = (t: PrintText) => ({
    x: t.vertical ? 0 : t.x,
    y: t.vertical ? 0 : t.y,
    transform: t.vertical ? `translate(${t.x} ${t.y}) rotate(-90)` : undefined,
    fontSize: t.size,
    fontWeight: t.bold ? 'bold' : 'normal',
    textAnchor: 'middle' as const,
  });
  return (
    <g>
      {labels.pills.map((pl) => (
        <rect
          key={`${pl.x},${pl.y}`}
          x={pl.x}
          y={pl.y}
          width={pl.w}
          height={pl.h}
          rx={pl.h / 2}
          fill={theme.halo}
          stroke={theme.ruler}
          strokeWidth={0.2}
        />
      ))}
      {labels.numbers.map((n) => (
        <g key={`n${n.n}`}>
          <circle
            cx={n.x}
            cy={n.y}
            r={NUMBER_R}
            fill={NUMBER_FILL}
            stroke={theme.label}
            strokeWidth={0.2}
          />
          <text
            x={n.x}
            y={n.y + 0.62}
            fontSize={1.7}
            fontWeight="bold"
            textAnchor="middle"
            fill={theme.label}
          >
            {n.n}
          </text>
        </g>
      ))}
      {labels.texts.map((t, i) =>
        t.halo ? (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt as a whole
            key={`h${i}`}
            {...attrs(t)}
            fill={theme.halo}
            stroke={theme.halo}
            strokeWidth={HALO}
            strokeLinejoin="round"
          >
            {t.text}
          </text>
        ) : null,
      )}
      {labels.texts.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt as a whole
        <text key={`t${i}`} {...attrs(t)} fill={t.fill}>
          {t.text}
        </text>
      ))}
    </g>
  );
}
