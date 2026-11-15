import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen,
  Eye,
  EyeOff,
  Grid3x3,
  Lock,
  LockOpen,
  Palette,
  Ruler,
  Sofa,
  Trees,
} from 'lucide-react';
import type { ReactElement } from 'react';
import type { LayerId } from '../../model/types.ts';
import { type Selection, uiStore, useUi } from '../../store/uiStore.ts';
import { IconButton } from '../controls/IconButton.tsx';
import './LayersPanel.css';

interface LayerRow {
  id: LayerId;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** Only layers that hold editable things can be locked. */
  lockable: boolean;
}

const ROWS: LayerRow[] = [
  {
    id: 'items',
    label: 'Móveis',
    desc: 'Móveis, carros, plantas e pilares',
    icon: Sofa,
    lockable: true,
  },
  {
    id: 'openings',
    label: 'Portas e janelas',
    desc: 'Aberturas nas paredes',
    icon: DoorOpen,
    lockable: true,
  },
  { id: 'measures', label: 'Medidas', desc: 'Réguas que você criou', icon: Ruler, lockable: true },
  { id: 'grid', label: 'Grade', desc: 'Quadriculado de 1 m', icon: Grid3x3, lockable: false },
  {
    id: 'context',
    label: 'Vizinhança',
    desc: 'Rua, calçada e casas vizinhas',
    icon: Trees,
    lockable: false,
  },
  {
    id: 'textures',
    label: 'Texturas',
    desc: 'Pisos com desenho; sem elas, só a cor',
    icon: Palette,
    lockable: false,
  },
];

const SELECTION_LAYER: Partial<Record<NonNullable<Selection>['kind'], LayerId>> = {
  item: 'items',
  opening: 'openings',
  ruler: 'measures',
};

function toggle(id: LayerId, key: 'visible' | 'locked'): void {
  const ui = uiStore.getState();
  ui.toggleLayer(id, key);
  // A hidden or locked layer cannot keep a selection the user can no longer touch.
  const sel = ui.selection;
  const next = uiStore.getState().layers[id];
  if (sel && SELECTION_LAYER[sel.kind] === id && (!next.visible || next.locked)) ui.select(null);
}

/** Visibility and lock per drawing layer. View settings, so they work in read-only mode too. */
export function LayersPanel(): ReactElement {
  const layers = useUi((s) => s.layers);
  return (
    <ul className="layers" aria-label="Camadas">
      {ROWS.map((row) => {
        const state = layers[row.id];
        const Icon = row.icon;
        return (
          <li key={row.id} className="layers-row" data-hidden={state.visible ? undefined : 'true'}>
            <Icon className="layers-icon" aria-hidden="true" />
            <div className="layers-text">
              <span className="layers-label">{row.label}</span>
              <span className="layers-desc">
                {state.locked && state.visible ? 'Travada: não dá para tocar' : row.desc}
              </span>
            </div>
            {row.lockable ? (
              <IconButton
                label={state.locked ? `Destravar ${row.label}` : `Travar ${row.label}`}
                icon={state.locked ? <Lock /> : <LockOpen />}
                disabled={!state.visible}
                onClick={() => toggle(row.id, 'locked')}
              />
            ) : (
              <span className="layers-spacer" aria-hidden="true" />
            )}
            <IconButton
              label={state.visible ? `Esconder ${row.label}` : `Mostrar ${row.label}`}
              icon={state.visible ? <Eye /> : <EyeOff />}
              onClick={() => toggle(row.id, 'visible')}
            />
          </li>
        );
      })}
    </ul>
  );
}
