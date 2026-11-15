import { PenLine, Search, X } from 'lucide-react';
import type { DragEvent as ReactDragEvent, ReactElement } from 'react';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ITEMS } from '../../catalog/registry.ts';
import type { ItemCategory, ItemDef } from '../../catalog/types.ts';
import {
  clearPlacementGhost,
  placeItem,
  placeItemAtViewCenter,
  showPlacementGhost,
} from '../../editor/tools/item.ts';
import type { LayerId, Mm, Vec } from '../../model/types.ts';
import { formatCm } from '../../model/units.ts';
import { WalkwayPreview } from '../../render/layers/WalkwaysLayer.tsx';
import type { RenderContext } from '../../render/RenderContext.ts';
import { SCENE_THEME } from '../../render/theme.ts';
import { camera } from '../../store/cameraStore.ts';
import { uiStore } from '../../store/uiStore.ts';
import { Chip } from '../controls/Chip.tsx';
import { toast } from '../controls/Toast.tsx';
import { commands } from '../shortcuts.ts';
import './CatalogPanel.css';

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  bedroom: 'Quarto',
  living: 'Sala',
  kitchen: 'Cozinha',
  bathroom: 'Banheiro',
  service: 'Serviço',
  office: 'Escritório',
  outdoor: 'Área externa',
  garage: 'Garagem',
  structure: 'Estrutura',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as ItemCategory[];

const ALL_LAYERS: Record<LayerId, boolean> = {
  grid: true,
  context: true,
  textures: true,
  items: true,
  openings: true,
  measures: true,
};

const PREVIEW_CTX: RenderContext = {
  mode: 'screen',
  theme: SCENE_THEME,
  print: null,
  layers: ALL_LAYERS,
  reducedMotion: true,
};

/** Lowercase without accents, so "sofa" finds "Sofá". */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const sizeText = (w: Mm, d: Mm): string => `${formatCm(w)}×${formatCm(d)}`;

/** A catalog symbol fitted in a small `<svg>`, for cards and the inspector. */
export const ItemPreview = memo(function ItemPreview({
  def,
  w,
  d,
  color,
  mirrored = false,
  className,
}: {
  def: ItemDef;
  w: Mm;
  d: Mm;
  color?: string | null;
  mirrored?: boolean;
  className?: string;
}): ReactElement {
  const pad = Math.max(w, d) * 0.08;
  return (
    <svg
      className={className}
      viewBox={`${-w / 2 - pad} ${-d / 2 - pad} ${w + 2 * pad} ${d + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <def.Symbol w={w} d={d} color={color ?? def.color} mirrored={mirrored} ctx={PREVIEW_CTX} />
    </svg>
  );
});

const SORTED: ItemDef[] = [...ITEMS.values()].sort(
  (a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    a.label.localeCompare(b.label, 'pt-BR'),
);

const SEARCH_TEXT = new Map(
  SORTED.map((def) => [
    def.type,
    fold([def.label, CATEGORY_LABEL[def.category], ...def.keywords].join(' ')),
  ]),
);

const CATEGORIES = CATEGORY_ORDER.filter((c) => SORTED.some((d) => d.category === c));

const WALKWAY_SEARCH = fold(
  'Caminho no jardim trilha pisante pisantes passarela calçada pedrisco área externa jardim',
);

/** The walkway card switches to the drawing tool instead of placing an item. */
function startWalkway(): void {
  const ui = uiStore.getState();
  const layer = ui.layers.items;
  if (layer.locked) {
    toast('A camada Objetos está travada. Destrave em Camadas para desenhar o caminho.');
    return;
  }
  if (!layer.visible) ui.toggleLayer('items', 'visible');
  if (ui.pendingItem) ui.setPending({ item: null });
  commands.activateTool('walkway');
}

const WalkwayCard = memo(function WalkwayCard(): ReactElement {
  return (
    <li className="catalog-cell">
      <button
        type="button"
        className="catalog-card catalog-card-walkway"
        aria-label="Caminho no jardim: toque na planta para marcar os pontos"
        title="Desenhe um caminho com curvas tocando na planta"
        onClick={startWalkway}
      >
        <span className="catalog-thumb">
          <WalkwayPreview className="catalog-preview" />
        </span>
        <span className="catalog-label">Caminho no jardim</span>
        <span className="catalog-size catalog-draw" aria-hidden="true">
          <PenLine />
          Desenhar
        </span>
      </button>
    </li>
  );
});

// The panel remounts on every sheet switch; the last search and category stay for the session.
let lastQuery = '';
let lastCategory: ItemCategory | null = null;

function matches(def: ItemDef, words: string[]): boolean {
  const text = SEARCH_TEXT.get(def.type) ?? '';
  return words.every((w) => text.includes(w));
}

/** World point under a drag over the canvas, or null outside it. */
function canvasWorldAt(e: DragEvent): Vec | null {
  const svg = document.querySelector<SVGSVGElement>('.canvas-svg');
  const host = svg?.closest('.canvas');
  if (!svg || !host || !(e.target instanceof Node) || !host.contains(e.target)) return null;
  const box = svg.getBoundingClientRect();
  return camera.screenToWorld({ x: e.clientX - box.left, y: e.clientY - box.top });
}

/**
 * Desktop drag of a card onto the canvas: a snapped ghost follows the pointer and the drop places
 * the item there. Returns the clean-up.
 */
function startCanvasDrag(def: ItemDef): () => void {
  let frame = 0;
  let next: { at: Vec; snap: boolean } | null = null;
  const over = (e: DragEvent) => {
    const at = canvasWorldAt(e);
    if (!at) {
      next = null;
      clearPlacementGhost();
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    next = { at, snap: !e.altKey };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (next) showPlacementGhost(def.type, null, next.at, next.snap);
    });
  };
  const drop = (e: DragEvent) => {
    const at = canvasWorldAt(e);
    if (!at) return;
    e.preventDefault();
    next = null;
    placeItem(def.type, null, at, { snap: !e.altKey });
  };
  document.addEventListener('dragover', over);
  document.addEventListener('drop', drop);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('dragover', over);
    document.removeEventListener('drop', drop);
    clearPlacementGhost();
  };
}

const CatalogCard = memo(function CatalogCard({
  def,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  def: ItemDef;
  draggable: boolean;
  onDragStart(def: ItemDef, e: ReactDragEvent<HTMLButtonElement>): void;
  onDragEnd(): void;
}): ReactElement {
  const size = sizeText(def.size.w, def.size.d);
  return (
    <li className="catalog-cell">
      <button
        type="button"
        className="catalog-card"
        draggable={draggable}
        aria-label={`${def.label}, ${size} centímetros`}
        title={draggable ? 'Clique para colocar no centro, ou arraste para a planta' : undefined}
        onClick={() => placeItemAtViewCenter(def.type, null)}
        onDragStart={(e) => onDragStart(def, e)}
        onDragEnd={onDragEnd}
      >
        <span className="catalog-thumb">
          <ItemPreview def={def} w={def.size.w} d={def.size.d} className="catalog-preview" />
        </span>
        <span className="catalog-label">{def.label}</span>
        <span className="catalog-size num" aria-hidden="true">
          {size}
        </span>
      </button>
    </li>
  );
});

function useFinePointer(): boolean {
  const [fine, setFine] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches,
  );
  useEffect(() => {
    const mql = matchMedia('(pointer: fine)');
    const update = () => setFine(mql.matches);
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return fine;
}

/** Furniture catalog: search, category chips and a card grid. A tap places the item. */
export function CatalogPanel(): ReactElement {
  const [query, setQuery] = useState(lastQuery);
  const [category, setCategory] = useState<ItemCategory | null>(lastCategory);
  const deferred = useDeferredValue(query);
  const fine = useFinePointer();
  const stopDrag = useRef<(() => void) | null>(null);

  useEffect(() => {
    lastQuery = query;
    lastCategory = category;
  }, [query, category]);

  useEffect(() => () => stopDrag.current?.(), []);

  const words = useMemo(() => fold(deferred).split(/\s+/).filter(Boolean), [deferred]);
  // A search looks in every category.
  const list = useMemo(
    () =>
      SORTED.filter((def) =>
        words.length > 0 ? matches(def, words) : category === null || def.category === category,
      ),
    [words, category],
  );

  const showWalkway =
    words.length > 0
      ? words.every((w) => WALKWAY_SEARCH.includes(w))
      : category === null || category === 'outdoor';

  const onDragStart = useRef((def: ItemDef, e: ReactDragEvent<HTMLButtonElement>) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', def.label);
    const thumb = e.currentTarget.querySelector('.catalog-thumb');
    if (thumb) e.dataTransfer.setDragImage(thumb, thumb.clientWidth / 2, thumb.clientHeight / 2);
    stopDrag.current?.();
    stopDrag.current = startCanvasDrag(def);
  }).current;
  const onDragEnd = useRef(() => {
    stopDrag.current?.();
    stopDrag.current = null;
  }).current;

  return (
    <div className="catalog">
      <div className="catalog-search">
        <Search className="catalog-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="catalog-search-input"
          aria-label="Buscar objeto"
          placeholder="Buscar: cama, sofá, pia…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="catalog-search-clear"
            aria-label="Limpar busca"
            onClick={() => setQuery('')}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <fieldset className="catalog-chips">
        <legend className="sr-only">Categorias</legend>
        <Chip selected={category === null} onClick={() => setCategory(null)}>
          Todos
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </fieldset>

      {list.length > 0 || showWalkway ? (
        <ul className="catalog-grid" aria-label="Objetos">
          {showWalkway ? <WalkwayCard /> : null}
          {list.map((def) => (
            <CatalogCard
              key={def.type}
              def={def}
              draggable={fine}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      ) : (
        <p className="catalog-empty" role="status">
          Nenhum objeto encontrado. Tente outra palavra, como “mesa” ou “planta”.
        </p>
      )}
    </div>
  );
}
