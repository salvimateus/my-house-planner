import type { ReactElement } from 'react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { createStore, useStore } from 'zustand';
import { itemDef } from '../../catalog/registry.ts';
import { tuning } from '../../juice/tuning.ts';
import type { Id, Item } from '../../model/types.ts';
import { type RenderContext, useRenderContext } from '../RenderContext.ts';
import { useSceneData } from '../SceneSvg.tsx';
import './ItemsLayer.css';

const EMPTY: ReadonlySet<Id> = new Set();

/** Items lifted by a drag on the editor canvas. Print and thumbnail trees ignore it. */
export const itemLiftStore = createStore<{ ids: ReadonlySet<Id> }>()(() => ({ ids: EMPTY }));

export function liftItems(ids: Iterable<Id>): void {
  itemLiftStore.setState({ ids: new Set(ids) });
}

export function dropItems(): void {
  if (itemLiftStore.getState().ids.size > 0) itemLiftStore.setState({ ids: EMPTY });
}

const placed = new Set<Id>();

/** The next mount of these items plays the drop-in animation. */
export function markPlaced(ids: Iterable<Id>): void {
  for (const id of ids) placed.add(id);
}

const LAYER_RANK = { floor: 0, furniture: 1, structure: 2 } as const;

const SHADOW_FILL = '#1C2026';
const ENTER = 'cubic-bezier(0, 0, 0.2, 1)';
const STATE = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** Paint order: floor items (rugs), then furniture, then structure (pillars); doc order inside each. */
function paintOrder(items: Item[]): Item[] {
  return items
    .map((item, i) => ({ item, i, rank: LAYER_RANK[itemDef(item.type).layer] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((e) => e.item);
}

const ItemNode = memo(function ItemNode({
  item,
  ctx,
  lifted,
}: {
  item: Item;
  ctx: RenderContext;
  lifted: boolean;
}): ReactElement {
  const def = itemDef(item.type);
  const bodyRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<SVGRectElement>(null);
  const wasLifted = useRef(lifted);
  const anim = useRef<Animation | null>(null);
  const animated = ctx.mode === 'screen' && !ctx.reducedMotion;
  const { scale, shadowMm, dropMs } = tuning.itemLift;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !animated || !placed.delete(item.id)) return;
    anim.current = el.animate(
      [
        { transform: `scale(${scale * 1.12})`, opacity: 0 },
        { transform: 'scale(0.97)', opacity: 1, offset: 0.62 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: dropMs * 1.4, easing: STATE },
    );
  }, [item.id, animated, scale, dropMs]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (lifted === wasLifted.current) return;
    wasLifted.current = lifted;
    if (!el || !animated) return;
    anim.current?.cancel();
    if (lifted) {
      anim.current = el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }], {
        duration: dropMs * 0.6,
        easing: ENTER,
        fill: 'forwards',
      });
      shadowRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dropMs * 0.6,
        easing: ENTER,
      });
    } else {
      anim.current = el.animate(
        [
          { transform: `scale(${scale})` },
          { transform: `scale(${2 - scale * 1.01})`, offset: 0.55 },
          { transform: 'scale(1)' },
        ],
        { duration: dropMs, easing: STATE },
      );
    }
  }, [lifted, animated, scale, dropMs]);

  const r = Math.min(item.w, item.d) * 0.08;
  return (
    <g data-item-id={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
      {lifted && ctx.mode === 'screen' ? (
        <rect
          ref={shadowRef}
          className="item-lift-shadow"
          x={-item.w / 2 + shadowMm * 0.4}
          y={-item.d / 2 + shadowMm}
          width={item.w}
          height={item.d}
          rx={r}
          fill={SHADOW_FILL}
          fillOpacity={0.18}
        />
      ) : null}
      <g ref={bodyRef} className="item-body">
        <def.Symbol
          w={item.w}
          d={item.d}
          color={item.color ?? def.color}
          mirrored={item.mirrored}
          ctx={ctx}
        />
      </g>
    </g>
  );
});

/** Catalog symbols of `doc.items`, one memoized group per item. */
export function ItemsLayer(): ReactElement | null {
  const { doc } = useSceneData();
  const ctx = useRenderContext();
  const liftedIds = useStore(itemLiftStore, (s) => s.ids);
  const screen = ctx.mode === 'screen';
  const items = useMemo(() => {
    const order = paintOrder(doc.items);
    if (!screen || liftedIds.size === 0) return order;
    // A lifted item floats above its neighbors until it drops.
    return [
      ...order.filter((i) => !liftedIds.has(i.id)),
      ...order.filter((i) => liftedIds.has(i.id)),
    ];
  }, [doc.items, screen, liftedIds]);
  if (!ctx.layers.items || items.length === 0) return null;
  return (
    <g className="scene-layer layer-items">
      {items.map((item) => (
        <ItemNode key={item.id} item={item} ctx={ctx} lifted={screen && liftedIds.has(item.id)} />
      ))}
    </g>
  );
}
