import { Grid2x2, Palette } from 'lucide-react';
import type { CSSProperties, ReactElement, RefObject } from 'react';
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { PALETTE } from '../../catalog/palette.ts';
import { MATERIALS, materialDef } from '../../catalog/registry.ts';
import type { MaterialDef } from '../../catalog/types.ts';
import type { Fill } from '../../model/types.ts';
import type { RenderContext } from '../../render/RenderContext.ts';
import { SCENE_THEME } from '../../render/theme.ts';
import { cx } from './cx.ts';
import { Segmented } from './Segmented.tsx';
import { Swatch } from './Swatch.tsx';
import './FillPicker.css';

export type FillPickerProps = {
  value: Fill;
  onChange(fill: Fill): void;
  group: 'indoor' | 'outdoor' | 'all';
};

type Tab = 'colors' | 'floors';
type Angle = Fill['angle'];

const COLOR_NAMES: Record<string, string> = {
  '#f4f1ea': 'Branco gelo',
  '#eadfc8': 'Areia',
  '#f2c9b6': 'Pêssego',
  '#f7dcc6': 'Damasco',
  '#f6ecc0': 'Baunilha',
  '#dce8d2': 'Verde chá',
  '#cfede3': 'Menta',
  '#d6e6f5': 'Azul céu',
  '#e4ddf2': 'Lavanda',
  '#f3d9e1': 'Rosa claro',
  '#e3e4e6': 'Cinza claro',
  '#b8bcc3': 'Cinza médio',
};

/** Picker order: the floors people ask for first. Unknown materials go last. */
const ORDER = [
  'porcelain-60',
  'porcelain-90',
  'ceramic-45',
  'wood-planks',
  'wood-herringbone',
  'burnt-cement',
  'marble',
  'hydraulic-tile',
  'carpet',
  'grass',
  'deck',
  'stone',
  'concrete',
  'gravel',
  'earth',
  'water',
];

const rank = (id: string): number => {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
};

const FLOORS: readonly MaterialDef[] = [...MATERIALS.values()]
  .filter((m) => m.id !== 'solid')
  .sort((a, b) => rank(a.id) - rank(b.id));

const SECTIONS = [
  { group: 'indoor', title: 'Dentro de casa' },
  { group: 'outdoor', title: 'Área externa' },
] as const;

const ANGLES: readonly { value: `${Angle}`; label: string }[] = [
  { value: '0', label: '0°' },
  { value: '45', label: '45°' },
  { value: '90', label: '90°' },
];

const SCALE = { min: 0.5, max: 2, step: 0.25 } as const;

const PREVIEW_CTX: RenderContext = {
  mode: 'screen',
  theme: SCENE_THEME,
  print: null,
  layers: {
    grid: true,
    context: true,
    textures: true,
    items: true,
    openings: true,
    measures: true,
  },
  reducedMotion: false,
};

const sameHex = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const inputHex = (c: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#000000');
const formatScale = (s: number): string =>
  `${s.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`;

const defaultFills = new Map<string, Fill>();
/** One stable object per material, so the memoized previews skip re-rendering. */
function defaultFillOf(def: MaterialDef): Fill {
  let f = defaultFills.get(def.id);
  if (!f) {
    f = { color: def.defaultColor, material: def.id, scale: 1, angle: 0 };
    defaultFills.set(def.id, f);
  }
  return f;
}

/** World mm shown by a card: about two tiles at scale 1, so the scale slider reads as size. */
const previewSpan = (def: MaterialDef): number =>
  Math.min(2600, Math.max(1000, Math.max(def.tile.w, def.tile.h) * 2.2));

export function FillPicker({ value, onChange, group }: FillPickerProps): ReactElement {
  const def = materialDef(value.material);
  const solid = def.id === 'solid';
  const [tab, setTab] = useState<Tab>(solid ? 'colors' : 'floors');
  const [shownSolid, setShownSolid] = useState(solid);
  // An outside change of the fill kind (eyedropper, undo, another selection) follows its tab.
  if (solid !== shownSolid) {
    setShownSolid(solid);
    setTab(solid ? 'colors' : 'floors');
  }

  return (
    <div className="fill-picker">
      <Segmented<Tab>
        label="Tipo de acabamento"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'colors', label: 'Cores', icon: <Palette /> },
          { value: 'floors', label: 'Pisos', icon: <Grid2x2 /> },
        ]}
      />
      {tab === 'colors' ? (
        <ColorTab value={value} solid={solid} onChange={onChange} />
      ) : (
        <FloorTab value={value} def={def} group={group} onChange={onChange} />
      )}
    </div>
  );
}

function ColorTab({
  value,
  solid,
  onChange,
}: {
  value: Fill;
  solid: boolean;
  onChange(fill: Fill): void;
}): ReactElement {
  const inPalette = PALETTE.some((c) => sameHex(c, value.color));
  const pick = (color: string) => {
    if (solid && sameHex(color, value.color)) return;
    onChange({ ...value, material: 'solid', color });
  };
  return (
    <fieldset className="fill-group">
      <legend className="sr-only">Cores</legend>
      <div className="fill-swatches">
        {PALETTE.map((c) => (
          <Swatch
            key={c}
            color={c}
            label={COLOR_NAMES[c.toLowerCase()] ?? c}
            selected={solid && sameHex(c, value.color)}
            onClick={() => pick(c)}
          />
        ))}
        <ColorInput
          label="Outra cor"
          value={value.color}
          selected={solid && !inPalette}
          onCommit={pick}
        />
      </div>
    </fieldset>
  );
}

function FloorTab({
  value,
  def,
  group,
  onChange,
}: {
  value: Fill;
  def: MaterialDef;
  group: FillPickerProps['group'];
  onChange(fill: Fill): void;
}): ReactElement {
  const solid = def.id === 'solid';
  const pick = (m: MaterialDef) => {
    if (m.id === value.material) return;
    onChange({ ...defaultFillOf(m) });
  };
  const sections = SECTIONS.filter((s) => group === 'all' || s.group === group);

  return (
    <div className="fill-floors">
      {sections.map((s) => (
        <section key={s.group} className="fill-section" aria-label={s.title}>
          {group === 'all' ? <h3 className="fill-section-title">{s.title}</h3> : null}
          <div className="fill-cards">
            {FLOORS.filter((m) => m.group === s.group).map((m) => {
              const selected = m.id === value.material;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="fill-card"
                  aria-pressed={selected}
                  onClick={() => pick(m)}
                >
                  <MaterialPreview def={m} fill={selected ? value : defaultFillOf(m)} />
                  <span className="fill-card-label">{m.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {solid ? null : (
        <div className="fill-tune">
          <fieldset className="fill-group">
            <legend className="fill-row-label is-legend">Tom</legend>
            <div className="fill-tones">
              <Swatch
                color={def.defaultColor}
                label="Tom original"
                selected={sameHex(value.color, def.defaultColor)}
                onClick={() => {
                  if (!sameHex(value.color, def.defaultColor))
                    onChange({ ...value, color: def.defaultColor });
                }}
              />
              <ColorInput
                label="Outro tom"
                value={value.color}
                selected={!sameHex(value.color, def.defaultColor)}
                onCommit={(color) => {
                  if (!sameHex(color, value.color)) onChange({ ...value, color });
                }}
              />
            </div>
          </fieldset>
          <ScaleSlider
            value={value.scale}
            onCommit={(scale) => {
              if (scale !== value.scale) onChange({ ...value, scale });
            }}
          />
          <Segmented<`${Angle}`>
            label="Ângulo"
            showLabel
            options={ANGLES}
            value={`${value.angle}`}
            onChange={(a) => onChange({ ...value, angle: Number(a) as Angle })}
          />
        </div>
      )}
    </div>
  );
}

/** The real pattern at true proportions. It mounts only while the card is on screen. */
const MaterialPreview = memo(function MaterialPreview({
  def,
  fill,
}: {
  def: MaterialDef;
  fill: Fill;
}): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const id = `fp${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const span = previewSpan(def);
  const { Pattern } = def;
  return (
    <span
      ref={ref}
      className="fill-card-preview"
      style={{ background: def.flatColor(fill.color) }}
      aria-hidden="true"
    >
      {inView ? (
        <svg
          viewBox={`0 0 ${span} ${span}`}
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
          aria-hidden="true"
        >
          <defs>
            <Pattern
              id={id}
              color={fill.color}
              scale={fill.scale}
              angle={fill.angle}
              ctx={PREVIEW_CTX}
            />
          </defs>
          <rect width={span} height={span} fill={`url(#${id})`} />
        </svg>
      ) : null}
    </span>
  );
});

/**
 * A native color input. It previews while the system picker is open and calls `onCommit` once,
 * on the native `change`, so an editor commit makes a single history entry.
 */
function ColorInput({
  label,
  value,
  selected,
  onCommit,
}: {
  label: string;
  value: string;
  selected: boolean;
  onCommit(color: string): void;
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = useLatest(onCommit);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = () => {
      setDraft(null);
      commit.current(el.value);
    };
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [commit]);

  const shown = draft ?? (selected ? value : null);
  return (
    <label
      className={cx('fill-custom', selected && 'is-selected')}
      title={label}
      style={shown ? ({ '--swatch-color': shown } as CSSProperties) : undefined}
    >
      <input
        ref={ref}
        type="color"
        className="fill-custom-input"
        aria-label={label}
        value={inputHex(draft ?? value)}
        onChange={(e) => setDraft(e.target.value)}
      />
      <span className={cx('fill-custom-dot', shown && 'has-color')} aria-hidden="true" />
    </label>
  );
}

/** Range from 0,5× to 2×; commits on release, like `ColorInput`. */
function ScaleSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit(scale: number): void;
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const commit = useLatest(onCommit);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = () => {
      setDraft(null);
      commit.current(Number(el.value));
    };
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [commit]);

  const shown = draft ?? value;
  return (
    <div className="fill-scale">
      <div className="fill-scale-head">
        <label className="fill-row-label" htmlFor={id}>
          Tamanho
        </label>
        <output className="fill-scale-value" htmlFor={id}>
          {formatScale(shown)}
        </output>
      </div>
      <input
        ref={ref}
        id={id}
        type="range"
        className="fill-range"
        min={SCALE.min}
        max={SCALE.max}
        step={SCALE.step}
        value={shown}
        aria-valuetext={formatScale(shown)}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
    </div>
  );
}

function useLatest<T>(v: T): RefObject<T> {
  const ref = useRef(v);
  useLayoutEffect(() => {
    ref.current = v;
  });
  return ref;
}

type InViewFn = (visible: boolean) => void;
const inViewFns = new Map<Element, InViewFn>();
let observer: IntersectionObserver | null = null;

function watchInView(el: Element, fn: InViewFn): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) inViewFns.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: '96px' },
  );
  inViewFns.set(el, fn);
  observer.observe(el);
  return () => {
    inViewFns.delete(el);
    observer?.unobserve(el);
  };
}

function useInView(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    return watchInView(el, setVisible);
  }, [ref]);
  return visible;
}
