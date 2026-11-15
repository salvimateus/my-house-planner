import { Magnet } from 'lucide-react';
import type { ReactElement } from 'react';
import { memo, useState } from 'react';
import { OPENING_SPECS, type OpeningSpec } from '../../catalog/openingSpecs.ts';
import { openingDef } from '../../catalog/registry.ts';
import { DoorSwingHost } from '../../education/explainers/DoorSwing.tsx';
import type { LayerId, Mm, OpeningType } from '../../model/types.ts';
import { formatOpening } from '../../model/units.ts';
import type { RenderContext } from '../../render/RenderContext.ts';
import { SCENE_THEME } from '../../render/theme.ts';
import { uiStore, useUi } from '../../store/uiStore.ts';
import { Segmented } from '../controls/Segmented.tsx';
import './OpeningsPanel.css';

type Group = OpeningSpec['group'];

const GROUPS: { value: Group; label: string }[] = [
  { value: 'door', label: 'Portas' },
  { value: 'window', label: 'Janelas' },
  { value: 'gate', label: 'Portões' },
];

const TYPES = Object.keys(OPENING_SPECS) as OpeningType[];
export const typesOf = (group: Group): OpeningType[] =>
  TYPES.filter((t) => OPENING_SPECS[t].group === group);

const HOST_TEXT: Record<Group, string> = {
  door: 'Toque numa parede da casa. O ímã encaixa a porta e abre o vão sozinho.',
  window: 'Janela vai em parede externa. Toque numa parede de fora da casa.',
  gate: 'Portão vai no muro. Toque no muro do terreno.',
};

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

const PREVIEW_WALL: Mm = 150;

/** How far each model reaches out of the wall plane, as a share of its width (preview framing). */
function reachOf(type: OpeningType): number {
  switch (type) {
    case 'door':
    case 'gate-pedestrian':
      return 1;
    case 'door-double':
      return 0.5;
    case 'window-tilt':
      return 0.4;
    case 'window-maxim':
    case 'gate-tilt':
      return 0.32;
    default:
      return 0.12;
  }
}

/** An opening symbol in a short piece of wall, fitted in a small `<svg>`, for cards and the inspector. */
export const OpeningPreview = memo(function OpeningPreview({
  type,
  width,
  hinge = 'start',
  side = 1,
  className,
}: {
  type: OpeningType;
  width?: Mm;
  hinge?: 'start' | 'end';
  side?: 1 | -1;
  className?: string;
}): ReactElement {
  const def = openingDef(type);
  const spec = OPENING_SPECS[type];
  const w = width ?? spec.defaultWidth;
  const t = spec.group === 'gate' ? 180 : PREVIEW_WALL;
  const stub = Math.max(w * 0.22, 220);
  const park = type === 'gate-sliding' ? w * 0.6 : 0;
  const reach = Math.max(w * reachOf(type), 260);
  const pad = Math.max(w * 0.06, 60);
  const x0 = -w / 2 - stub - (hinge === 'start' ? park : 0);
  const x1 = w / 2 + stub + (hinge === 'end' ? park : 0);
  const near = t / 2 + pad;
  const far = t / 2 + reach + pad;
  const y0 = side === 1 ? -near : -far;
  const y1 = side === 1 ? far : near;
  const wall = spec.group === 'gate' ? SCENE_THEME.muro : SCENE_THEME.wall;
  return (
    <svg
      className={className}
      viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={`M${x0} ${-t / 2}H${-w / 2}V${t / 2}H${x0}Z M${w / 2} ${-t / 2}H${x1}V${t / 2}H${w / 2}Z`}
        fill={wall}
      />
      {def ? (
        <def.Symbol width={w} thickness={t} hinge={hinge} side={side} swing={1} ctx={PREVIEW_CTX} />
      ) : null}
    </svg>
  );
});

/**
 * Doors, windows and gates: one tab per group and a card per model. Picking a card arms the
 * opening tool; the magnet places it on the wall the user taps.
 */
export function OpeningsPanel(): ReactElement {
  const pending = useUi((s) => s.pendingOpening);
  const tool = useUi((s) => s.tool);
  const [group, setGroup] = useState<Group>(() =>
    pending ? OPENING_SPECS[pending].group : 'door',
  );
  const armed = tool === 'opening' ? pending : null;

  const pick = (type: OpeningType) => {
    const ui = uiStore.getState();
    ui.setPending({ opening: type });
    if (ui.tool !== 'opening') ui.setTool('opening');
    // Phones: lower the sheet so the walls show.
    ui.setSheet('openings', 'peek');
  };

  const current = armed && OPENING_SPECS[armed].group === group ? armed : null;
  const tip = current ? openingDef(current)?.tip : null;

  return (
    <div className="openings-panel">
      <Segmented<Group>
        label="Tipo de abertura"
        options={GROUPS}
        value={group}
        onChange={setGroup}
        className="openings-tabs"
      />
      <ul className="openings-grid">
        {typesOf(group).map((type) => {
          const spec = OPENING_SPECS[type];
          const def = openingDef(type);
          return (
            <li key={type} className="openings-cell">
              <button
                type="button"
                className="openings-card"
                aria-pressed={armed === type}
                onClick={() => pick(type)}
              >
                <span className="openings-thumb">
                  <OpeningPreview type={type} className="openings-preview" />
                </span>
                <span className="openings-label">{def?.label ?? type}</span>
                <span className="openings-size num">
                  {formatOpening(spec.defaultWidth, spec.height)} cm
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="openings-hint">
        <Magnet className="openings-hint-icon" aria-hidden="true" />
        <span>
          {tip ? `${tip} ` : ''}
          {HOST_TEXT[group]}
        </span>
      </p>
      <DoorSwingHost />
    </div>
  );
}
