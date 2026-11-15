import {
  type CSSProperties,
  type ReactElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LayerId, Mm } from '../model/types.ts';
import { formatCm } from '../model/units.ts';
import type { RenderContext, SceneTheme } from '../render/RenderContext.ts';
import { ITEMS } from './registry.ts';
import type { ItemCategory, ItemDef } from './types.ts';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  bathroom: 'Banheiro',
  kitchen: 'Cozinha',
  service: 'Área de serviço',
  living: 'Sala',
  bedroom: 'Quarto',
  office: 'Escritório',
  outdoor: 'Área externa',
  garage: 'Garagem',
  structure: 'Estrutura',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as ItemCategory[];

// The gallery runs without the app theme, so it carries its own hex scene colors.
const GALLERY_THEME: SceneTheme = {
  world: '#EDEAE3',
  street: '#B9BCC1',
  streetLine: '#F4F4F2',
  curb: '#A6A9AE',
  sidewalk: '#DCD8D0',
  sidewalkJoint: '#C8C3B9',
  serviceStrip: '#A9C98F',
  neighborLine: '#B5AFA4',
  neighborHouse: '#E2DDD3',
  neighborRidge: '#CEC7BB',
  lotLine: '#7A746A',
  ground: '#EFE7D2',
  muro: '#8E8678',
  wall: '#3D3A36',
  grid: '#D9D4CA',
  label: '#2E2C29',
  labelSub: '#6B665E',
  halo: '#FFFFFF',
  dim: '#4B6E8C',
  ruler: '#2F7F86',
  door: '#5B544B',
  swingArc: '#A39C91',
  glass: '#7FB6D6',
  openingLabel: '#5B544B',
  invalid: '#D64545',
};
const ALL_LAYERS: Record<LayerId, boolean> = {
  grid: true,
  context: true,
  textures: true,
  items: true,
  openings: true,
  measures: true,
};
const PRINT_SCALE = 100;
const PX_PER_MM = 0.11;
/** Room around the box for chairs tucked outside it and the screen shadow. */
const MARGIN: Mm = 420;
const MAX_NODES = 25;
const HEX = /^#[0-9a-f]{6}$/i;

type Mode = 'screen' | 'print';

const contextFor = (mode: Mode, mono: boolean): RenderContext => ({
  mode,
  theme: GALLERY_THEME,
  print: mode === 'print' ? { scale: PRINT_SCALE, mono } : null,
  layers: ALL_LAYERS,
  reducedMotion: false,
});

const round10 = (v: number): Mm => Math.round(v / 10) * 10;

/** Smallest, default and a large size (the largest variant, or a step toward max). */
function sampleSizes(def: ItemDef): Array<{ w: Mm; d: Mm }> {
  const area = (s: { w: Mm; d: Mm }) => s.w * s.d;
  const largestVariant = (def.variants ?? []).reduce<{ w: Mm; d: Mm } | null>(
    (best, v) => (area(v) > area(best ?? def.size) ? v : best),
    null,
  );
  const large = largestVariant ?? {
    w: round10(def.size.w + (def.max.w - def.size.w) * 0.4),
    d: round10(def.size.d + (def.max.d - def.size.d) * 0.4),
  };
  const out: Array<{ w: Mm; d: Mm }> = [];
  for (const s of [def.min, def.size, large]) {
    if (!out.some((o) => o.w === s.w && o.d === s.d)) out.push({ w: s.w, d: s.d });
  }
  return out;
}

const sizeLabel = (w: Mm, d: Mm): string => `${formatCm(w)} × ${formatCm(d)} cm`;

/** Print-safety audit of a rendered symbol: what svg2pdf would drop or misread. */
function audit(root: SVGGElement, mode: Mode): { nodes: number; issues: string[] } {
  const all = Array.from(root.querySelectorAll('*'));
  const issues = new Set<string>();
  for (const el of all) {
    if (el.hasAttribute('opacity')) issues.add('opacity em grupo');
    if (el.hasAttribute('filter')) issues.add('filtro');
    if (el.hasAttribute('mask')) issues.add('máscara');
    if (el.getAttribute('style')?.includes('var(')) issues.add('variável CSS');
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr);
      if (v && v !== 'none' && !HEX.test(v)) issues.add(`cor não hex (${v})`);
    }
    if (mode === 'print') {
      if (el.hasAttribute('vector-effect')) issues.add('vector-effect');
      if (el.getAttribute('fill') === '#000000' && el.hasAttribute('fill-opacity')) {
        issues.add('sombra na impressão');
      }
    }
  }
  return { nodes: all.length, issues: [...issues] };
}

interface TileProps {
  def: ItemDef;
  w: Mm;
  d: Mm;
  mode: Mode;
  mono: boolean;
  mirrored: boolean;
  color: string;
}

function SymbolTile({ def, w, d, mode, mono, mirrored, color }: TileProps): ReactElement {
  const ref = useRef<SVGGElement>(null);
  const [report, setReport] = useState<{ nodes: number; issues: string[] } | null>(null);
  const ctx = useMemo(() => contextFor(mode, mono), [mode, mono]);
  const Sym = def.Symbol;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-audit whenever the drawn symbol changes.
  useLayoutEffect(() => {
    if (ref.current) setReport(audit(ref.current, mode));
  }, [def, w, d, mode, mono, mirrored, color]);

  const vw = w + MARGIN * 2;
  const vh = d + MARGIN * 2;
  const tooMany = (report?.nodes ?? 0) > MAX_NODES;
  return (
    <figure style={styles.tile}>
      <svg
        viewBox={`${-w / 2 - MARGIN} ${-d / 2 - MARGIN} ${vw} ${vh}`}
        width={Math.round(vw * PX_PER_MM)}
        height={Math.round(vh * PX_PER_MM)}
        style={styles.svg}
        role="img"
        aria-label={`${def.label}, ${sizeLabel(w, d)}`}
      >
        <rect
          x={-w / 2 - MARGIN}
          y={-d / 2 - MARGIN}
          width={vw}
          height={vh}
          fill={mode === 'print' ? '#FFFFFF' : '#F4F1EA'}
        />
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          fill="none"
          stroke="#C2BBAE"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <g ref={ref}>
          <Sym w={w} d={d} color={color} mirrored={mirrored} ctx={ctx} />
        </g>
      </svg>
      <figcaption style={styles.caption}>
        <span>{mode === 'screen' ? 'Tela' : mono ? 'Impressão P&B' : 'Impressão'}</span>
        {report && (
          <span style={tooMany ? styles.bad : styles.muted}>
            {report.nodes} {report.nodes === 1 ? 'nó' : 'nós'}
          </span>
        )}
        {report && report.issues.length > 0 && (
          <span style={styles.bad}>{report.issues.join(', ')}</span>
        )}
      </figcaption>
    </figure>
  );
}

interface CardProps {
  def: ItemDef;
  mono: boolean;
  mirrored: boolean;
  colorIndex: number;
}

function ItemCard({ def, mono, mirrored, colorIndex }: CardProps): ReactElement {
  const palette = def.colorable && def.colors?.length ? def.colors : [def.color];
  const color = palette[colorIndex % palette.length] ?? def.color;
  const flags = [
    def.wallSnap === 'back' ? 'encosta na parede' : 'solto',
    def.layer === 'floor' ? 'piso' : def.layer === 'structure' ? 'estrutura' : 'móvel',
    def.keepAspect ? 'proporção fixa' : null,
    def.rotationStep === 90 ? 'gira 90°' : null,
  ].filter(Boolean);
  return (
    <article style={styles.card}>
      <header style={styles.cardHead}>
        <h3 style={styles.itemTitle}>{def.label}</h3>
        <code style={styles.muted}>{def.type}</code>
      </header>
      <p style={styles.meta}>
        Padrão {sizeLabel(def.size.w, def.size.d)} · mín. {sizeLabel(def.min.w, def.min.d)} · máx.{' '}
        {sizeLabel(def.max.w, def.max.d)} · {flags.join(' · ')}
      </p>
      {def.variants && def.variants.length > 0 && (
        <p style={styles.meta}>
          Variações: {def.variants.map((v) => `${v.label} (${sizeLabel(v.w, v.d)})`).join(' · ')}
        </p>
      )}
      <div style={styles.sizes}>
        {sampleSizes(def).map((s) => (
          <section key={`${s.w}x${s.d}`} style={styles.sizeGroup}>
            <h4 style={styles.sizeTitle}>{sizeLabel(s.w, s.d)}</h4>
            <div style={styles.tiles}>
              {(['screen', 'print'] as const).map((mode) => (
                <SymbolTile
                  key={mode}
                  def={def}
                  w={s.w}
                  d={s.d}
                  mode={mode}
                  mono={mono}
                  mirrored={mirrored}
                  color={color}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export default function DevGallery(): ReactElement {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [mirrored, setMirrored] = useState(false);
  const [mono, setMono] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const defs = [...ITEMS.values()].filter(
      (def) =>
        (category === 'all' || def.category === category) &&
        (!q || normalize([def.label, def.type, ...def.keywords].join(' ')).includes(q)),
    );
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      defs: defs
        .filter((d) => d.category === cat)
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    })).filter((g) => g.defs.length > 0);
  }, [query, category]);

  const total = ITEMS.size;
  return (
    <main style={styles.page}>
      <header style={styles.top}>
        <h1 style={styles.title}>Catálogo de símbolos</h1>
        <p style={styles.muted}>
          {total} {total === 1 ? 'item registrado' : 'itens registrados'}. Cada item aparece no
          menor tamanho, no padrão e num tamanho grande, na tela e na impressão. A linha tracejada é
          a caixa do item.
        </p>
        <div style={styles.controls}>
          <input
            type="search"
            placeholder="Buscar item"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.input}
            aria-label="Buscar item"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ItemCategory | 'all')}
            style={styles.input}
            aria-label="Categoria"
          >
            <option value="all">Todas as categorias</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <label style={styles.check}>
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(e) => setMirrored(e.target.checked)}
            />
            Espelhado
          </label>
          <label style={styles.check}>
            <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
            Impressão P&B
          </label>
          <button type="button" style={styles.button} onClick={() => setColorIndex((i) => i + 1)}>
            Trocar cor
          </button>
        </div>
      </header>
      {groups.length === 0 && <p style={styles.muted}>Nenhum item encontrado.</p>}
      {groups.map((g) => (
        <section key={g.cat} style={styles.category}>
          <h2 style={styles.catTitle}>
            {CATEGORY_LABELS[g.cat]} <span style={styles.muted}>({g.defs.length})</span>
          </h2>
          {g.defs.map((def) => (
            <ItemCard
              key={def.type}
              def={def}
              mono={mono}
              mirrored={mirrored}
              colorIndex={colorIndex}
            />
          ))}
        </section>
      ))}
    </main>
  );
}

const styles = {
  page: {
    fontFamily: 'var(--font-sans)',
    color: 'var(--ink)',
    background: 'var(--paper)',
    minHeight: '100dvh',
    padding: '24px 16px 64px',
    maxWidth: 1400,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  top: { marginBottom: 24 },
  title: { fontSize: 24, margin: '0 0 8px' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 },
  input: {
    font: 'inherit',
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--surface)',
    color: 'inherit',
    minWidth: 0,
  },
  check: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' },
  button: {
    font: 'inherit',
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--surface)',
    color: 'inherit',
    cursor: 'pointer',
  },
  category: { marginTop: 32 },
  catTitle: { fontSize: 20, margin: '0 0 12px' },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    padding: 16,
    marginBottom: 16,
    minWidth: 0,
  },
  cardHead: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' },
  itemTitle: { fontSize: 17, margin: 0 },
  meta: { margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' },
  sizes: { display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  sizeGroup: { minWidth: 0, maxWidth: '100%' },
  sizeTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 6px' },
  tiles: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tile: { margin: 0, minWidth: 0, maxWidth: '100%' },
  svg: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: 8,
    border: '1px solid var(--line)',
  },
  caption: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    marginTop: 4,
    maxWidth: 260,
  },
  muted: { color: 'var(--ink-2)', fontSize: 13 },
  bad: { color: 'var(--danger)', fontSize: 12, fontWeight: 600 },
} satisfies Record<string, CSSProperties>;
