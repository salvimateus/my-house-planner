import type { ReactElement, ReactNode } from 'react';
import { toGray601 } from '../catalog/color.ts';
import type { Rect, Scene } from '../geometry/types.ts';
import type { AreaKind, Id, ProjectDoc } from '../model/types.ts';
import { formatArea, formatLengthShort } from '../model/units.ts';
import type { RenderContext } from '../render/RenderContext.ts';
import { SceneLayers } from '../render/SceneSvg.tsx';
import type { SheetLayout } from './layout.ts';
import { fitText, textWidth, wrapLines } from './measure.ts';
import { PrintStreet } from './PrintStreet.tsx';
import { layoutPrintLabels, PrintLabelsView } from './printLabels.tsx';
import type { ExportOptions } from './types.ts';

export const SHEET_SUBTITLE = 'Estudo preliminar de planta baixa';
export const SHEET_DISCLAIMER =
  'Estudo feito no app Minha Casinha, uma ferramenta não profissional. Medidas e áreas são aproximadas: valide o projeto com um(a) arquiteto(a) ou engenheiro(a).';

const BRAND = '#1A3263';
const BRAND_ACCENT = '#FAB95B';
const BRAND_LIGHT = '#FFF8EE';
const RULE = '#C9CCD2';
const FRAME = '#8C8F86';

const pctFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

interface Colors {
  ink: string;
  sub: string;
  rule: string;
  brand: string;
  brandLight: string;
  brandAccent: string;
  frame: string;
}

function colorsOf(ctx: RenderContext): Colors {
  const mono = ctx.print?.mono ?? false;
  const c = (hex: string) => (mono ? toGray601(hex) : hex);
  return {
    ink: ctx.theme.label,
    sub: ctx.theme.labelSub,
    rule: RULE,
    brand: c(BRAND),
    brandLight: BRAND_LIGHT,
    brandAccent: c(BRAND_ACCENT),
    frame: FRAME,
  };
}

function Txt({
  x,
  y,
  size,
  fill,
  bold = false,
  anchor = 'start',
  children,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  bold?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  children: ReactNode;
}): ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={bold ? 'bold' : 'normal'}
      textAnchor={anchor}
      fill={fill}
    >
      {children}
    </text>
  );
}

function Rule({ x0, x1, y, c }: { x0: number; x1: number; y: number; c: Colors }): ReactElement {
  return <path d={`M${x0} ${y}H${x1}`} stroke={c.rule} strokeWidth={0.2} fill="none" />;
}

function LogoMark({ x, y, size, c }: { x: number; y: number; size: number; c: Colors }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 64})`}>
      <rect x={2} y={2} width={60} height={60} rx={18} fill={c.brand} />
      <path
        d="M14 30.5 32 16l18 14.5V48a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2Z"
        fill={c.brandLight}
        stroke={c.brandAccent}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d="M19 33v13h12V36M31 46h14V33M31 36h-5M38 33v6"
        fill="none"
        stroke={c.brand}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

const HEADER_H = 13;

function Header({ doc, box, c }: { doc: ProjectDoc; box: Rect; c: Colors }): ReactElement {
  const { x0, y0, x1 } = box;
  const tx = x0 + 13.5;
  const name = doc.name.trim() || 'Planta sem nome';
  return (
    <g>
      <LogoMark x={x0} y={y0} size={11} c={c} />
      <Txt x={tx} y={y0 + 3} size={2.6} fill={c.brand} bold>
        Minha Casinha
      </Txt>
      <Txt x={tx} y={y0 + 7.4} size={4} fill={c.ink} bold>
        {fitText(name, x1 - tx, 4, true)}
      </Txt>
      <Txt x={tx} y={y0 + 10.8} size={2.3} fill={c.sub}>
        {SHEET_SUBTITLE}
      </Txt>
    </g>
  );
}

const FACT_H = 3.7;

function Facts({
  rows,
  box,
  c,
}: {
  rows: Array<[string, string]>;
  box: Rect;
  c: Colors;
}): ReactElement {
  return (
    <g>
      {rows.map(([label, value], i) => {
        const y = box.y0 + 2.6 + i * FACT_H;
        return (
          <g key={label}>
            <Txt x={box.x0} y={y} size={2.3} fill={c.sub}>
              {label}
            </Txt>
            <Txt x={box.x1} y={y} size={2.3} fill={c.ink} bold anchor="end">
              {value}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

const fmtMeters = (m: number) => new Intl.NumberFormat('pt-BR').format(m);

/** Ticks in meters for the graphic scale: 0-1-2-5 m, shorter when 5 m does not fit. */
function barTicks(scale: number, width: number): number[] {
  for (const ticks of [
    [0, 1, 2, 5],
    [0, 1, 2],
    [0, 0.5, 1],
  ]) {
    const last = ticks[ticks.length - 1] ?? 1;
    if ((last * 1000) / scale <= width) return ticks;
  }
  return [0, 0.5, 1];
}

const BAR_H = 13;

function ScaleAndNorth({
  scale,
  northDeg,
  box,
  c,
}: {
  scale: number;
  northDeg: number;
  box: Rect;
  c: Colors;
}): ReactElement {
  const barW = box.x1 - box.x0 - 16;
  const ticks = barTicks(scale, barW);
  const xOf = (m: number) => box.x0 + 1 + (m * 1000) / scale;
  const by = box.y0 + 6.5;
  const nx = box.x1 - 5.5;
  const ny = box.y0 + 6.8;
  const rad = (northDeg * Math.PI) / 180;
  const lx = nx + Math.sin(rad) * 6;
  const ly = ny - Math.cos(rad) * 6;
  return (
    <g>
      <Txt x={box.x0} y={box.y0 + 2.4} size={2.1} fill={c.sub}>
        Escala gráfica
      </Txt>
      {ticks.slice(1).map((m, i) => {
        const prev = ticks[i] ?? 0;
        return (
          <rect
            key={m}
            x={xOf(prev)}
            y={by}
            width={xOf(m) - xOf(prev)}
            height={1.4}
            fill={i % 2 === 0 ? c.ink : '#FFFFFF'}
            stroke={c.ink}
            strokeWidth={0.18}
          />
        );
      })}
      {ticks.map((m, i) => (
        <Txt key={m} x={xOf(m)} y={by + 4.2} size={2} fill={c.ink} anchor="middle">
          {i === ticks.length - 1 ? `${fmtMeters(m)} m` : fmtMeters(m)}
        </Txt>
      ))}
      <circle cx={nx} cy={ny} r={4.2} fill="none" stroke={c.sub} strokeWidth={0.2} />
      <path
        d="M0 -3.6L1.9 2.8L0 1.5L-1.9 2.8Z"
        transform={`translate(${nx} ${ny}) rotate(${northDeg})`}
        fill={c.ink}
      />
      <Txt x={lx} y={ly + 0.85} size={2.4} fill={c.ink} bold anchor="middle">
        N
      </Txt>
    </g>
  );
}

type TableEntry =
  | { kind: 'group'; label: string }
  | { kind: 'row'; name: string; area: string; n: number | null };

const GROUPS: Array<[AreaKind, string]> = [
  ['room', 'Ambientes'],
  ['covered', 'Áreas cobertas'],
  ['outdoor', 'Áreas externas'],
];

function tableEntries(doc: ProjectDoc, scene: Scene, numbered: Map<Id, number>): TableEntry[] {
  const out: TableEntry[] = [];
  for (const [kind, label] of GROUPS) {
    const areas = doc.areas.filter((a) => a.kind === kind);
    if (areas.length === 0) continue;
    out.push({ kind: 'group', label });
    for (const a of areas) {
      const net = scene.areas.get(a.id)?.netArea ?? 0;
      out.push({
        kind: 'row',
        name: a.name.trim() || 'Sem nome',
        area: formatArea(net),
        n: numbered.get(a.id) ?? null,
      });
    }
  }
  return out;
}

const ROW_H = 3.3;

function AreaTable({
  entries,
  box,
  c,
}: {
  entries: TableEntry[];
  box: Rect;
  c: Colors;
}): ReactElement {
  const capacity = Math.max(0, Math.floor((box.y1 - box.y0 - 4.4) / ROW_H));
  let shown = entries;
  let hidden = 0;
  // Overflow: drop the group headings first, then unnumbered rows; numbered rows always stay,
  // because the drawing points to them.
  if (shown.length > capacity) shown = entries.filter((e) => e.kind === 'row');
  if (shown.length > capacity) {
    const rows = shown;
    const numbered = rows.filter((e) => e.kind === 'row' && e.n !== null).length;
    let others = Math.max(0, capacity - 1 - numbered);
    shown = rows.filter((e) => {
      if (e.kind === 'row' && e.n !== null) return true;
      others -= 1;
      return others >= 0;
    });
    hidden = rows.length - shown.length;
  }
  const hasNumbers = entries.some((e) => e.kind === 'row' && e.n !== null);
  const nameX = box.x0 + (hasNumbers ? 5 : 1.5);
  return (
    <g>
      <Txt x={box.x0} y={box.y0 + 2.6} size={2.6} fill={c.ink} bold>
        Quadro de áreas (área útil)
      </Txt>
      {hasNumbers ? (
        <Txt x={box.x1} y={box.y0 + 2.6} size={1.9} fill={c.sub} anchor="end">
          Nº = número no desenho
        </Txt>
      ) : null}
      {shown.map((e, i) => {
        const y = box.y0 + 4.4 + (i + 1) * ROW_H - 0.9;
        return e.kind === 'group' ? (
          <Txt key={`g:${e.label}`} x={box.x0} y={y} size={2.1} fill={c.sub} bold>
            {e.label}
          </Txt>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: names repeat; the list is rebuilt as a whole
          <g key={i}>
            {e.n !== null ? (
              <Txt x={box.x0 + 2} y={y} size={2.1} fill={c.ink} bold anchor="middle">
                {e.n}
              </Txt>
            ) : null}
            <Txt x={nameX} y={y} size={2.2} fill={c.ink}>
              {fitText(e.name, box.x1 - nameX - textWidth(e.area, 2.2) - 2, 2.2)}
            </Txt>
            <Txt x={box.x1} y={y} size={2.2} fill={c.ink} anchor="end">
              {e.area}
            </Txt>
          </g>
        );
      })}
      {hidden > 0 ? (
        <Txt x={nameX} y={box.y0 + 4.4 + (shown.length + 1) * ROW_H - 0.9} size={2.1} fill={c.sub}>
          {hidden === 1 ? '+ 1 área não listada' : `+ ${hidden} áreas não listadas`}
        </Txt>
      ) : null}
    </g>
  );
}

const DISC_SIZE = 2;
const DISC_LINE = 2.7;

function disclaimerHeight(width: number): number {
  return wrapLines(SHEET_DISCLAIMER, width, DISC_SIZE).length * DISC_LINE + 2.4;
}

function Disclaimer({ box, c }: { box: Rect; c: Colors }): ReactElement {
  const lines = wrapLines(SHEET_DISCLAIMER, box.x1 - box.x0, DISC_SIZE);
  return (
    <g>
      <Rule x0={box.x0} x1={box.x1} y={box.y0} c={c} />
      {lines.map((l, i) => (
        <Txt
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are rebuilt as a whole
          key={i}
          x={box.x0}
          y={box.y0 + 2.4 + i * DISC_LINE + 0.6}
          size={DISC_SIZE}
          fill={c.sub}
        >
          {l}
        </Txt>
      ))}
    </g>
  );
}

function factRows(scene: Scene, doc: ProjectDoc, scale: number, date: string) {
  const t = scene.totals;
  const lot = `${formatLengthShort(doc.lot.width)} × ${formatLengthShort(doc.lot.depth)} m`;
  return [
    ['Terreno', lot],
    ['Área do terreno', formatArea(t.lotArea)],
    ['Área construída', formatArea(t.builtArea)],
    ['Área útil', formatArea(t.netArea)],
    ['Taxa de ocupação', pctFormat.format(t.occupancy)],
    ['Área permeável', `${formatArea(t.permeableArea)} (${pctFormat.format(t.permeability)})`],
    ['Data', date],
    ['Escala', `1:${scale}`],
  ] as Array<[string, string]>;
}

function Panel({
  doc,
  scene,
  layout,
  date,
  numbered,
  c,
}: {
  doc: ProjectDoc;
  scene: Scene;
  layout: SheetLayout;
  date: string;
  numbered: Map<Id, number>;
  c: Colors;
}): ReactElement {
  const p = layout.panel;
  const facts = factRows(scene, doc, layout.scale, date);
  const entries = tableEntries(doc, scene, numbered);
  const factsH = facts.length * FACT_H + 1;

  if (layout.panelColumns === 1) {
    let y = p.y0;
    const header = { x0: p.x0, y0: y, x1: p.x1, y1: y + HEADER_H };
    y += HEADER_H + 1.5;
    const rule1 = y;
    y += 1;
    const factsBox = { x0: p.x0, y0: y, x1: p.x1, y1: y + factsH };
    y += factsH + 0.5;
    const rule2 = y;
    y += 1.5;
    const barBox = { x0: p.x0, y0: y, x1: p.x1, y1: y + BAR_H };
    y += BAR_H + 0.5;
    const rule3 = y;
    y += 1.5;
    const discTop = p.y1 - disclaimerHeight(p.x1 - p.x0);
    return (
      <g>
        <Header doc={doc} box={header} c={c} />
        <Rule x0={p.x0} x1={p.x1} y={rule1} c={c} />
        <Facts rows={facts} box={factsBox} c={c} />
        <Rule x0={p.x0} x1={p.x1} y={rule2} c={c} />
        <ScaleAndNorth scale={layout.scale} northDeg={doc.lot.northDeg} box={barBox} c={c} />
        <Rule x0={p.x0} x1={p.x1} y={rule3} c={c} />
        <AreaTable entries={entries} box={{ x0: p.x0, y0: y, x1: p.x1, y1: discTop - 1 }} c={c} />
        <Disclaimer box={{ x0: p.x0, y0: discTop, x1: p.x1, y1: p.y1 }} c={c} />
      </g>
    );
  }

  const mid = (p.x0 + p.x1) / 2;
  const a = { x0: p.x0, x1: mid - 3 };
  const b = { x0: mid + 3, x1: p.x1 };
  let y = p.y0;
  const header = { ...a, y0: y, y1: y + HEADER_H };
  y += HEADER_H + 1.5;
  const rule1 = y;
  y += 1;
  const factsBox = { ...a, y0: y, y1: y + factsH };
  y += factsH + 0.5;
  const rule2 = y;
  y += 1.5;
  const barBox = { ...a, y0: y, y1: y + BAR_H };
  const discTop = p.y1 - disclaimerHeight(b.x1 - b.x0);
  return (
    <g>
      <Header doc={doc} box={header} c={c} />
      <Rule {...a} y={rule1} c={c} />
      <Facts rows={facts} box={factsBox} c={c} />
      <Rule {...a} y={rule2} c={c} />
      <ScaleAndNorth scale={layout.scale} northDeg={doc.lot.northDeg} box={barBox} c={c} />
      <path d={`M${mid} ${p.y0}V${p.y1}`} stroke={c.rule} strokeWidth={0.2} fill="none" />
      <AreaTable entries={entries} box={{ ...b, y0: p.y0, y1: discTop - 1 }} c={c} />
      <Disclaimer box={{ ...b, y0: discTop, y1: p.y1 }} c={c} />
    </g>
  );
}

let sheetSeq = 0;

/**
 * One paper sheet in mm: the scene in print mode inside the drawing box (world mm scaled by
 * 1/scale), the title block, the area table and the disclaimer. Attributes only, hex colors,
 * Inter normal and bold: svg2pdf reads it as is.
 */
export function PrintSheet({
  doc,
  scene,
  layout,
  ctx,
  opts,
  date,
}: {
  doc: ProjectDoc;
  scene: Scene;
  layout: SheetLayout;
  ctx: RenderContext;
  opts: ExportOptions;
  date: string;
}): ReactElement {
  sheetSeq += 1;
  const clipId = `sheet-clip-${sheetSeq}`;
  const { drawing: dr, clip: cl, view, scale, w, h } = layout;
  const c = colorsOf(ctx);
  const labels = layoutPrintLabels(doc, scene, layout, opts, ctx.theme);
  const tx = dr.x0 - view.x0 / scale;
  const ty = dr.y0 - view.y0 / scale;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fontFamily="Inter"
      fontWeight="normal"
    >
      <title>{doc.name}</title>
      <rect x={0} y={0} width={w} height={h} fill="#FFFFFF" />
      <defs>
        <clipPath id={clipId}>
          <rect x={cl.x0} y={cl.y0} width={cl.x1 - cl.x0} height={cl.y1 - cl.y0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${tx} ${ty}) scale(${1 / scale})`}>
          <PrintStreet lot={doc.lot} scale={scale} neighbors={opts.context} />
          <SceneLayers data={{ doc, scene, live: false }} ctx={ctx} />
        </g>
      </g>
      <PrintLabelsView labels={labels} theme={ctx.theme} />
      <rect
        x={dr.x0}
        y={dr.y0}
        width={dr.x1 - dr.x0}
        height={dr.y1 - dr.y0}
        fill="none"
        stroke={c.frame}
        strokeWidth={0.25}
      />
      <Panel doc={doc} scene={scene} layout={layout} date={date} numbered={labels.numbered} c={c} />
    </svg>
  );
}
