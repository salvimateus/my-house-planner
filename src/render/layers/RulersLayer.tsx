import type { ReactElement, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import type { RulerDerived } from '../../geometry/types.ts';
import { on } from '../../juice/events.ts';
import { tuning } from '../../juice/tuning.ts';
import { animateEl, tween } from '../../juice/tween.ts';
import type { Id, Ruler } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { printSize, type RenderContext, strokeProps, useRenderContext } from '../RenderContext.ts';
import { useSceneData } from '../SceneSvg.tsx';
import './RulersLayer.css';

/** Label geometry in screen px (screen) or in px-sized units scaled to paper (print). */
const FONT = 12;
const PILL_H = 19;
const PILL_PAD = 7;
const TICK = 6;
const DOT_R = 8;
/** Paper mm per label unit in print: 12 units → 3 mm text. */
const PRINT_UNIT_MM = 0.25;

/** Inter semibold advance widths in em, tabular digits. */
function textWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += 0.62;
    else if (ch === ',' || ch === '.') em += 0.28;
    else if (ch === ' ') em += 0.27;
    else if (ch === 'm') em += 0.9;
    else em += 0.62;
  }
  return em * FONT;
}

// Rulers made by a tap zip open once; the tool emits before React draws the new doc.
const pendingZip = new Set<Id>();
on('ruler-created', (e) => {
  pendingZip.add(e.rulerId);
});

/**
 * Teal rulers with end ticks and a white label pill of constant screen size. Screen: the label
 * group scales by `--mmpp` in CSS, so zoom needs no re-render. Print: explicit sizes on paper.
 */
export function RulersLayer(): ReactElement | null {
  const ctx = useRenderContext();
  const { doc, scene } = useSceneData();
  const ref = useRef<SVGGElement>(null);
  const screen = ctx.mode === 'screen';

  useLayoutEffect(() => {
    if (!screen || pendingZip.size === 0) return;
    const root = ref.current;
    for (const id of [...pendingZip]) {
      const r = doc.rulers.find((x) => x.id === id);
      if (!r) continue;
      pendingZip.delete(id);
      const el = root?.querySelector<SVGGElement>(`[data-ruler="${CSS.escape(id)}"]`);
      if (el && r.mode === 'fit' && scene.rulers.get(id)?.valid) zip(el, r);
    }
  }, [doc, scene, screen]);

  if (ctx.mode === 'thumb' || !ctx.layers.measures || doc.rulers.length === 0) return null;

  return (
    <g ref={ref} className="scene-layer layer-rulers" pointerEvents="none">
      {doc.rulers.map((r) => {
        const d = scene.rulers.get(r.id);
        if (!d) return null;
        return d.valid && d.length > 0 ? (
          <RulerMark key={r.id} id={r.id} d={d} ctx={ctx} />
        ) : (
          <InvalidMark key={r.id} id={r.id} d={d} ctx={ctx} />
        );
      })}
    </g>
  );
}

/** Content in label units at a world point: CSS `--mmpp` on screen, an explicit scale in print. */
function Fixed({
  ctx,
  transform,
  className,
  children,
}: {
  ctx: RenderContext;
  transform: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  if (ctx.mode === 'screen') {
    return (
      <g transform={transform}>
        <g className="ruler-fixed">
          <g className={className}>{children}</g>
        </g>
      </g>
    );
  }
  return (
    <g transform={`${transform} scale(${printSize(ctx, PRINT_UNIT_MM)})`}>
      <g className={className}>{children}</g>
    </g>
  );
}

function LabelText({ ctx, text, fill }: { ctx: RenderContext; text: string; fill: string }) {
  const screen = ctx.mode === 'screen';
  return (
    <text
      className={screen ? 'scene-text ruler-text' : undefined}
      y={FONT * 0.36}
      textAnchor="middle"
      fill={fill}
      fontSize={screen ? undefined : FONT}
      fontWeight={screen ? undefined : 600}
      fontFamily={screen ? undefined : 'Inter, sans-serif'}
    >
      {text}
    </text>
  );
}

function RulerMark({ id, d, ctx }: { id: Id; d: RulerDerived; ctx: RenderContext }): ReactElement {
  const { theme } = ctx;
  const text = formatLength(d.length);
  const w = textWidth(text) + PILL_PAD * 2;
  const angle = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
  const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
  const unitStroke = ctx.mode === 'screen' ? 1.5 : 1.2;
  const tick = (x: number, y: number) => (
    <Fixed ctx={ctx} transform={`translate(${x} ${y}) rotate(${angle})`}>
      <line
        x1={0}
        y1={-TICK}
        x2={0}
        y2={TICK}
        stroke={theme.ruler}
        strokeWidth={unitStroke}
        strokeLinecap="round"
      />
    </Fixed>
  );

  return (
    <g data-ruler={id}>
      <g className="ruler-body">
        <line
          x1={d.a.x}
          y1={d.a.y}
          x2={d.b.x}
          y2={d.b.y}
          stroke={theme.ruler}
          strokeLinecap="round"
          {...strokeProps(ctx, 1.5, 0.3)}
        />
        {tick(d.a.x, d.a.y)}
        {tick(d.b.x, d.b.y)}
      </g>
      <Fixed ctx={ctx} transform={`translate(${mid.x} ${mid.y})`} className="ruler-label">
        <rect
          x={-w / 2}
          y={-PILL_H / 2}
          width={w}
          height={PILL_H}
          rx={PILL_H / 2}
          fill={theme.halo}
          stroke={theme.ruler}
          strokeWidth={1}
        />
        <LabelText ctx={ctx} text={text} fill={theme.ruler} />
      </Fixed>
    </g>
  );
}

/** A fit ruler whose origin sits inside a wall: a red dot with "?". */
function InvalidMark({ id, d, ctx }: { id: Id; d: RulerDerived; ctx: RenderContext }) {
  const { theme } = ctx;
  return (
    <g data-ruler={id}>
      <Fixed ctx={ctx} transform={`translate(${d.a.x} ${d.a.y})`}>
        <circle r={DOT_R} fill={theme.invalid} stroke={theme.halo} strokeWidth={1.5} />
        <LabelText ctx={ctx} text="?" fill={theme.halo} />
      </Fixed>
    </g>
  );
}

/** The line grows from the tap point to both wall faces, then the label pops. */
function zip(el: SVGGElement, r: Extract<Ruler, { mode: 'fit' }>): void {
  const body = el.querySelector<SVGGElement>('.ruler-body');
  const label = el.querySelector<SVGGElement>('.ruler-label');
  if (!body || !label) return;
  const { x, y } = r.origin;
  const ms = tuning.rulerZip.ms;
  label.style.opacity = '0';
  body.setAttribute(
    'transform',
    `translate(${x} ${y}) scale(${r.axis === 'h' ? '0 1' : '1 0'}) translate(${-x} ${-y})`,
  );
  const grow = tween(ms, (t) => {
    const s = r.axis === 'h' ? `${t} 1` : `1 ${t}`;
    body.setAttribute('transform', `translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`);
  });
  grow.finished.then(() => {
    body.removeAttribute('transform');
    label.style.opacity = '';
    animateEl(
      label,
      [
        { transform: 'scale(0.4)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: ms * 0.6, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  });
}
