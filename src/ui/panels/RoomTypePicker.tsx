import {
  Armchair,
  Bath,
  BedDouble,
  BedSingle,
  Car,
  CarFront,
  CookingPot,
  Ellipsis,
  Fence,
  Flower2,
  Footprints,
  Laptop,
  type LucideIcon,
  Package,
  Rows3,
  Shirt,
  Sofa,
  Sprout,
  Square,
  Toilet,
  UtensilsCrossed,
  WashingMachine,
  WavesLadder,
  X,
} from 'lucide-react';
import type { KeyboardEvent, ReactElement } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { presetFor, presetsOfKind } from '../../catalog/roomPresets.ts';
import type { RoomPreset } from '../../catalog/types.ts';
import { applyPreset } from '../../editor/select/area.ts';
import { closeRoomPicker, roomPickerStore, sceneSvg } from '../../editor/tools/build.ts';
import { bboxOf } from '../../geometry/shape.ts';
import type { Area, RoomPresetId } from '../../model/types.ts';
import { camera } from '../../store/cameraStore.ts';
import { useDoc } from '../../store/docStore.ts';
import './RoomTypePicker.css';

const ICONS: Record<string, LucideIcon> = {
  Sofa,
  CookingPot,
  BedSingle,
  BedDouble,
  Bath,
  Toilet,
  WashingMachine,
  Laptop,
  Shirt,
  Footprints,
  Package,
  Square,
  UtensilsCrossed,
  Armchair,
  Car,
  Sprout,
  Flower2,
  Fence,
  CarFront,
  WavesLadder,
  Rows3,
};

export function PresetIcon({ preset }: { preset: RoomPreset }): ReactElement {
  const Icon = ICONS[preset.icon] ?? Square;
  return <Icon aria-hidden="true" />;
}

/** Short chip labels where the preset label is long. */
export const SHORT_LABEL: Record<RoomPresetId, string> = {
  laundry: 'Serviço',
  gourmet: 'Gourmet',
  parking: 'Vaga',
};

export const chipLabel = (p: RoomPreset): string => SHORT_LABEL[p.id] ?? p.label;

const MAIN: RoomPresetId[] = [
  'living',
  'bedroom',
  'suite',
  'bathroom',
  'kitchen',
  'laundry',
  'office',
  'garage',
];

const MORE: RoomPreset[] = [...presetsOfKind('room'), ...presetsOfKind('covered')].filter(
  (p) => !MAIN.includes(p.id),
);

const GAP = 10;
const GUTTER = 12;

/** Places the popover next to the area on screen: below, else above, else inside the view. */
function place(el: HTMLElement, area: Area): void {
  const svg = sceneSvg();
  if (!svg) return;
  const host = svg.getBoundingClientRect();
  const b = bboxOf(area.shape);
  const a = camera.worldToScreen({ x: b.x0, y: b.y0 });
  const c = camera.worldToScreen({ x: b.x1, y: b.y1 });
  const room = {
    left: host.left + a.x,
    top: host.top + a.y,
    right: host.left + c.x,
    bottom: host.top + c.y,
  };
  const vw = document.documentElement.clientWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const minTop = Math.max(GUTTER, host.top + 4);
  const maxTop = Math.min(vh, host.bottom) - h - GUTTER;
  let top: number;
  if (room.bottom + GAP <= maxTop) top = room.bottom + GAP;
  else if (room.top - GAP - h >= minTop) top = room.top - GAP - h;
  else top = maxTop;
  top = Math.max(minTop, Math.min(maxTop, top));
  const center = (room.left + room.right) / 2;
  const left = Math.max(GUTTER, Math.min(vw - w - GUTTER, center - w / 2));
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

/**
 * Popover next to a new room: eight big type chips plus "Mais". A choice sets the preset, the
 * name ("Quarto 2" when the name repeats), the fill and the kind, with a paint ripple.
 */
export function RoomTypePicker(): ReactElement | null {
  const areaId = useStore(roomPickerStore, (s) => s.areaId);
  const area = useDoc((s) => (areaId ? (s.doc?.areas.find((a) => a.id === areaId) ?? null) : null));
  const readOnly = useDoc((s) => s.readOnly);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const areaRef = useRef(area);
  areaRef.current = area;
  const open = area !== null && !readOnly;

  useLayoutEffect(() => {
    if (!open) setMore(false);
  }, [open]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    if (!el.matches(':popover-open')) el.showPopover();
    const reposition = () => {
      if (areaRef.current) place(el, areaRef.current);
    };
    reposition();
    const unsubscribe = camera.subscribe(reposition);
    window.addEventListener('resize', reposition);
    return () => {
      unsubscribe();
      window.removeEventListener('resize', reposition);
      if (el.matches(':popover-open')) el.hidePopover();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && ref.current && area) place(ref.current, area);
  });

  if (!open || !area) return null;

  const choose = (id: RoomPresetId) => {
    applyPreset(area.id, id);
    closeRoomPicker();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeRoomPicker();
  };
  const list = more ? MORE : MAIN.map(presetFor);

  return (
    <div
      ref={ref}
      popover="manual"
      className="room-picker"
      role="dialog"
      aria-label="Tipo do cômodo"
      onKeyDown={onKeyDown}
    >
      <div className="room-picker-head">
        <p className="room-picker-title">Que cômodo é este?</p>
        <button
          type="button"
          className="room-picker-close"
          aria-label="Escolher depois"
          title="Escolher depois"
          onClick={closeRoomPicker}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="room-picker-grid">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            className="room-picker-chip"
            aria-pressed={area.preset === p.id}
            onClick={() => choose(p.id)}
          >
            <PresetIcon preset={p} />
            <span>{chipLabel(p)}</span>
          </button>
        ))}
        <button
          type="button"
          className="room-picker-chip room-picker-more"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <Ellipsis aria-hidden="true" />
          <span>{more ? 'Voltar' : 'Mais'}</span>
        </button>
      </div>
    </div>
  );
}
