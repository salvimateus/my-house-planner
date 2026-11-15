import type { ReactElement } from 'react';
import { itemDef, openingDef } from '../../catalog/registry.ts';
import type { Ghost as GhostShape } from '../../geometry/types.ts';
import { useRenderContext } from '../../render/RenderContext.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';

/** Placement preview from `uiStore.transient.ghost`, in world space (the overlay world group). */
export function Ghost(): ReactElement | null {
  const ghost = useUi((s) => s.transient.ghost);
  if (!ghost) return null;
  switch (ghost.kind) {
    case 'area':
      return <AreaGhost ghost={ghost} />;
    case 'opening':
      return <OpeningGhost ghost={ghost} />;
    default:
      return <ItemGhost ghost={ghost} />;
  }
}

function AreaGhost({ ghost }: { ghost: Extract<GhostShape, { kind: 'area' }> }): ReactElement {
  const r = ghost.rect;
  return (
    <g className="overlay-ghost" data-invalid={ghost.valid ? undefined : 'true'}>
      {ghost.carve.map((c) => (
        <rect
          key={`${c.x0},${c.y0},${c.x1},${c.y1}`}
          className="ghost-carve"
          x={c.x0}
          y={c.y0}
          width={c.x1 - c.x0}
          height={c.y1 - c.y0}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <rect
        className="ghost-area"
        x={r.x0}
        y={r.y0}
        width={r.x1 - r.x0}
        height={r.y1 - r.y0}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function OpeningGhost({
  ghost,
}: {
  ghost: Extract<GhostShape, { kind: 'opening' }>;
}): ReactElement {
  const ctx = useRenderContext();
  const fallback = useDoc((s) => s.doc?.structure.external ?? 200);
  const { runs } = useScene();
  // The snapped run gives the real thickness: internal walls and the muro are thinner.
  const run = ghost.snapped
    ? runs.find(
        (r) =>
          r.axis === ghost.axis &&
          (r.line + r.offset === ghost.line || r.line === ghost.line) &&
          ghost.at >= r.start &&
          ghost.at <= r.end,
      )
    : undefined;
  const thickness = run?.thickness ?? fallback;
  const c = ghost.snapped
    ? ghost.axis === 'h'
      ? { x: ghost.at, y: ghost.line }
      : { x: ghost.line, y: ghost.at }
    : ghost.world;
  // Local x runs along the wall, local +y toward `side`; for a vertical wall both axes swap.
  const frame = ghost.axis === 'h' ? `translate(${c.x} ${c.y})` : `matrix(0 1 1 0 ${c.x} ${c.y})`;
  const def = openingDef(ghost.type);
  return (
    <g
      className="overlay-ghost"
      data-invalid={ghost.snapped ? undefined : 'true'}
      transform={frame}
    >
      <rect
        className="ghost-opening"
        x={-ghost.width / 2}
        y={-thickness / 2}
        width={ghost.width}
        height={thickness}
        vectorEffect="non-scaling-stroke"
      />
      {def ? (
        <def.Symbol
          width={ghost.width}
          thickness={thickness}
          hinge={ghost.hinge}
          side={ghost.side}
          swing={1}
          ctx={ctx}
        />
      ) : null}
    </g>
  );
}

function ItemGhost({ ghost }: { ghost: Extract<GhostShape, { kind: 'item' }> }): ReactElement {
  const ctx = useRenderContext();
  const { item } = ghost;
  const def = itemDef(item.type);
  const transform = `translate(${item.x} ${item.y}) rotate(${item.rotation})${
    item.mirrored ? ' scale(-1 1)' : ''
  }`;
  return (
    <g
      className="overlay-ghost ghost-item"
      data-invalid={ghost.valid ? undefined : 'true'}
      transform={transform}
    >
      <def.Symbol
        w={item.w}
        d={item.d}
        color={item.color ?? def.color}
        mirrored={item.mirrored}
        ctx={ctx}
      />
      <rect
        className="ghost-item-box"
        x={-item.w / 2}
        y={-item.d / 2}
        width={item.w}
        height={item.d}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
