import { type CSSProperties, type ReactElement, useMemo, useState } from 'react';
import type { Fill } from '../model/types.ts';
import { fillPaint, isFlatFill, PatternDefs } from '../render/PatternDefs.tsx';
import {
  type RenderContext,
  RenderContextProvider,
  type SceneTheme,
} from '../render/RenderContext.ts';
import { MATERIALS } from './registry.ts';
import type { MaterialDef } from './types.ts';

const ORDER = [
  'solid',
  'wood-planks',
  'wood-herringbone',
  'porcelain-60',
  'porcelain-90',
  'ceramic-45',
  'hydraulic-tile',
  'burnt-cement',
  'marble',
  'carpet',
  'deck',
  'stone',
  'grass',
  'concrete',
  'gravel',
  'water',
  'earth',
];

const THEME: SceneTheme = {
  world: '#EEF0EC',
  street: '#A9ADB1',
  streetLine: '#F4F4F2',
  curb: '#C9CCCF',
  sidewalk: '#DADBD8',
  sidewalkJoint: '#C4C5C1',
  serviceStrip: '#B9D3A3',
  neighborLine: '#B5B8BC',
  neighborHouse: '#E1E2E0',
  neighborRidge: '#C9CBC8',
  lotLine: '#5F6670',
  ground: '#E9E6DC',
  muro: '#8E949B',
  wall: '#2F343B',
  grid: '#D9DCD6',
  label: '#2A2F36',
  labelSub: '#5C636C',
  halo: '#FFFFFF',
  dim: '#4A6E8A',
  ruler: '#2C7A84',
  door: '#3A4048',
  swingArc: '#8A939C',
  glass: '#7FB6D8',
  openingLabel: '#4A525B',
  invalid: '#D2483F',
};

const ZOOMS: Array<{ pxPerMm: number; label: string }> = [
  { pxPerMm: 0.03, label: 'Lote' },
  { pxPerMm: 0.12, label: 'Cômodo' },
  { pxPerMm: 0.5, label: 'Detalhe' },
];

const SW_W = 220;
const SW_H = 140;

const fmtMeters = (mm: number): string =>
  `${(Math.round(mm / 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`;

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    padding: '16px',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px 20px',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: { fontSize: '20px', fontWeight: 600, margin: 0 },
  control: { display: 'flex', gap: '6px', alignItems: 'center' },
  list: { display: 'grid', gap: '16px' },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    padding: '12px',
  },
  cardHead: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '10px',
  },
  name: { fontWeight: 600 },
  meta: { color: 'var(--ink-2)', fontSize: '12px' },
  chip: {
    width: '18px',
    height: '18px',
    borderRadius: '5px',
    border: '1px solid var(--line)',
    display: 'inline-block',
  },
  swatches: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
  fig: { margin: 0, maxWidth: '100%' },
  svg: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '8px',
    border: '1px solid var(--line)',
  },
  caption: { color: 'var(--ink-2)', fontSize: '12px', marginTop: '4px' },
};

function fillFor(
  def: MaterialDef,
  color: string | null,
  scale: number,
  angle: Fill['angle'],
): Fill {
  return { material: def.id, color: color ?? def.defaultColor, scale, angle };
}

export default function DevMaterials(): ReactElement {
  const [angle, setAngle] = useState<Fill['angle']>(0);
  const [scale, setScale] = useState(1);
  const [custom, setCustom] = useState(false);
  const [color, setColor] = useState('#E6DBC8');
  const [mono, setMono] = useState(false);

  const ctx = useMemo<RenderContext>(
    () => ({
      mode: 'screen',
      theme: THEME,
      print: mono ? { scale: 100, mono: true } : null,
      layers: {
        grid: true,
        context: true,
        textures: true,
        items: true,
        openings: true,
        measures: true,
      },
      reducedMotion: false,
    }),
    [mono],
  );

  const defs = useMemo(() => {
    const known = ORDER.map((id) => MATERIALS.get(id)).filter((d): d is MaterialDef => !!d);
    const extra = [...MATERIALS.values()].filter((d) => !ORDER.includes(d.id));
    return [...known, ...extra];
  }, []);

  const fills = defs.map((d) => fillFor(d, custom ? color : null, scale, angle));

  return (
    <RenderContextProvider value={ctx}>
      <main style={s.page}>
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <PatternDefs fills={fills} />
          </defs>
        </svg>
        <header style={s.head}>
          <h1 style={s.title}>Materiais ({defs.length})</h1>
          <label style={s.control}>
            Ângulo
            <select
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value) as Fill['angle'])}
            >
              <option value={0}>0°</option>
              <option value={45}>45°</option>
              <option value={90}>90°</option>
            </select>
          </label>
          <label style={s.control}>
            Escala
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[0.5, 0.75, 1, 1.5, 2].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString('pt-BR')}×
                </option>
              ))}
            </select>
          </label>
          <label style={s.control}>
            <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            Mesma cor em todos
          </label>
          <input
            type="color"
            value={color}
            disabled={!custom}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Cor"
          />
          <label style={s.control}>
            <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
            Impressão P&amp;B
          </label>
        </header>
        <div style={s.list}>
          {defs.map((def, i) => {
            const fill = fills[i]!;
            const flat = fillPaint(fill, { ...ctx, mode: 'thumb' });
            return (
              <section key={def.id} style={s.card}>
                <div style={s.cardHead}>
                  <span style={s.name}>{def.label}</span>
                  <code style={s.meta}>{def.id}</code>
                  <span style={s.meta}>
                    {def.group === 'indoor' ? 'interno' : 'externo'}
                    {def.permeable ? ' · permeável' : ''} · peça {def.tile.w}×{def.tile.h} mm
                  </span>
                  <span style={{ ...s.chip, background: flat }} title={`Cor média ${flat}`} />
                </div>
                <div style={s.swatches}>
                  {ZOOMS.map((z) => {
                    const vw = SW_W / z.pxPerMm;
                    const vh = SW_H / z.pxPerMm;
                    const lod = isFlatFill(fill, ctx, z.pxPerMm) && def.id !== 'solid';
                    return (
                      <figure key={z.pxPerMm} style={s.fig}>
                        <svg
                          width={SW_W}
                          height={SW_H}
                          viewBox={`0 0 ${vw} ${vh}`}
                          style={s.svg}
                          role="img"
                          aria-label={`${def.label}, ${z.label}`}
                        >
                          <rect
                            x={0}
                            y={0}
                            width={vw}
                            height={vh}
                            fill={fillPaint(fill, ctx, z.pxPerMm)}
                          />
                        </svg>
                        <figcaption style={s.caption}>
                          {z.label} · {fmtMeters(vw)} de largura{lod ? ' · cor plana (LOD)' : ''}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </RenderContextProvider>
  );
}
