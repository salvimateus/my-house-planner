import { FlipHorizontal2, FlipVertical2, RotateCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import type { Handle } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { camera } from '../../store/cameraStore.ts';
import { useDoc } from '../../store/docStore.ts';
import { useUi } from '../../store/uiStore.ts';
import { toolContext } from '../toolContext.ts';
import { handlerForSelection } from '../tools/select.ts';

const COARSE = '(pointer: coarse)';

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = matchMedia(COARSE);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => matchMedia(COARSE).matches,
  );
}

const ICON_TOUCH_PX = 36;
const ICON_GLYPH_TOUCH_PX = 20;

const ICONS = { rotate: RotateCw, 'flip-hinge': FlipHorizontal2, 'flip-side': FlipVertical2 };

const sameIds = (a: Handle[], b: Handle[]) =>
  a.length === b.length && a.every((h, i) => h.id === b[i]?.id && h.shape === b[i]?.shape);

/**
 * Handles of the current selection (`SelectHandler.getHandles`, screen px). A camera move updates
 * their positions on the DOM directly; React renders again only when the handle set changes.
 */
export function Handles(): ReactElement | null {
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const doc = useDoc((s) => s.doc);
  const coarse = useCoarsePointer();
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const nodes = useRef(new Map<string, SVGGElement>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: doc and tick are the recompute triggers
  const handles = useMemo<Handle[]>(() => {
    if (tool !== 'select' && tool !== 'item') return [];
    return handlerForSelection(selection)?.getHandles?.(toolContext) ?? [];
  }, [selection, tool, doc, tick]);

  const current = useRef(handles);
  current.current = handles;

  useLayoutEffect(() => {
    if (handles.length === 0) return;
    return camera.subscribe(() => {
      const next =
        tool === 'select' || tool === 'item'
          ? (handlerForSelection(selection)?.getHandles?.(toolContext) ?? [])
          : [];
      if (!sameIds(next, current.current)) {
        bump();
        return;
      }
      for (const h of next) {
        nodes.current.get(h.id)?.setAttribute('transform', `translate(${h.x} ${h.y})`);
      }
    });
  }, [handles.length, selection, tool]);

  if (handles.length === 0) return null;
  const size = coarse ? tuning.touch.handlePx : tuning.touch.mouseHandlePx;
  const half = size / 2;
  // Icon handles: 36 px on touch, the mouse size plus a ring on desktop.
  const iconR = coarse ? ICON_TOUCH_PX / 2 : half + 4;
  const glyph = coarse ? ICON_GLYPH_TOUCH_PX : size * 0.75;

  return (
    <g className="overlay-handles">
      {handles.map((h) => {
        const Icon = h.shape === 'icon' && h.icon ? ICONS[h.icon] : null;
        return (
          <g
            key={h.id}
            ref={(el) => {
              if (el) nodes.current.set(h.id, el);
              else nodes.current.delete(h.id);
            }}
            className="overlay-handle"
            data-shape={h.shape}
            transform={`translate(${h.x} ${h.y})`}
          >
            {h.shape === 'square' ? (
              <rect x={-half} y={-half} width={size} height={size} rx={3} />
            ) : (
              <circle r={Icon ? iconR : half} />
            )}
            {Icon ? (
              <Icon
                x={-glyph / 2}
                y={-glyph / 2}
                width={glyph}
                height={glyph}
                className="overlay-handle-icon"
                aria-hidden="true"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
