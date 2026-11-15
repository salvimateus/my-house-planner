import type { ReactElement } from 'react';
import { STRUCTURE_PRESETS } from '../../model/defaults.ts';
import type { Mm, Structure } from '../../model/types.ts';
import { docStore, useDoc } from '../../store/docStore.ts';
import { type UiState, uiStore, useUi } from '../../store/uiStore.ts';
import { Dialog } from '../controls/Dialog.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { Switch } from '../controls/Switch.tsx';
import { commands } from '../shortcuts.ts';
import './SettingsDialog.css';

const WALL_MIN: Mm = 50;
const WALL_MAX: Mm = 400;

type Preset = Structure['preset'];

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: 'masonry', label: 'Alvenaria' },
  { value: 'slim-masonry', label: 'Bloco fino' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'custom', label: 'Outra' },
];

const PRESET_NOTE: Record<Preset, string> = {
  masonry: 'Tijolo ou bloco comum com reboco: 15 cm por dentro, 20 cm nas paredes de fora.',
  'slim-masonry': 'Bloco mais fino: 12 cm por dentro, 15 cm nas paredes de fora.',
  drywall: 'Placas de gesso por dentro (10 cm) e alvenaria de 20 cm por fora.',
  custom: 'Escolha a espessura das paredes em centímetros.',
};

const MOTION_OPTIONS: { value: UiState['prefs']['motion']; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'reduced', label: 'Reduzido' },
  { value: 'full', label: 'Completo' },
];

const SNAP_OPTIONS: { value: string; label: string }[] = [
  { value: '500', label: '0,5 m' },
  { value: '250', label: '0,25 m' },
  { value: '100', label: '0,1 m' },
];

/** Wall thickness stays a multiple of 10 mm, so half thickness is integer. */
const toWall = (mm: Mm): Mm => Math.round(mm / 10) * 10;

function commitStructure(label: string, patch: Partial<Structure>): void {
  docStore.getState().commit(label, (d) => {
    Object.assign(d.structure, patch);
  });
}

function WallSettings(): ReactElement {
  const structure = useDoc((s) => s.doc?.structure ?? null);
  const readOnly = useDoc((s) => s.readOnly);

  if (!structure) {
    return (
      <p className="settings-note">
        Abra uma planta para escolher a espessura das paredes e do muro.
      </p>
    );
  }

  const setPreset = (preset: Preset) => {
    if (preset === 'custom') commitStructure('Tipo de parede', { preset });
    else commitStructure('Tipo de parede', { preset, ...STRUCTURE_PRESETS[preset] });
  };

  return (
    <fieldset className="settings-fieldset" disabled={readOnly}>
      <legend className="sr-only">Paredes e muro</legend>
      <Segmented
        label="Tipo de parede"
        options={PRESET_OPTIONS}
        value={structure.preset}
        onChange={setPreset}
        disabled={readOnly}
      />
      <p className="settings-note">{PRESET_NOTE[structure.preset]}</p>
      {structure.preset === 'custom' ? (
        <div className="settings-pair">
          <MeasureInput
            label="Parede interna"
            unit="cm"
            value={structure.internal}
            min={WALL_MIN}
            max={WALL_MAX}
            disabled={readOnly}
            onCommit={(v) =>
              commitStructure('Espessura da parede interna', { internal: toWall(v) })
            }
          />
          <MeasureInput
            label="Parede externa"
            unit="cm"
            value={structure.external}
            min={WALL_MIN}
            max={WALL_MAX}
            disabled={readOnly}
            onCommit={(v) =>
              commitStructure('Espessura da parede externa', { external: toWall(v) })
            }
          />
        </div>
      ) : null}
      <MeasureInput
        label="Muro"
        unit="cm"
        value={structure.boundary}
        min={WALL_MIN}
        max={WALL_MAX}
        disabled={readOnly}
        hint="Espessura do muro nas divisas do terreno."
        onCommit={(v) => commitStructure('Espessura do muro', { boundary: toWall(v) })}
      />
    </fieldset>
  );
}

export function SettingsDialog(): ReactElement {
  const open = useUi((s) => s.dialog === 'settings');
  const prefs = useUi((s) => s.prefs);
  const snapStep = useUi((s) => s.snapStep);
  const snapEnabled = useUi((s) => s.snapEnabled);
  const ui = uiStore.getState();
  const stepValue = SNAP_OPTIONS.some((o) => o.value === String(snapStep))
    ? String(snapStep)
    : '500';

  return (
    <Dialog open={open} onClose={ui.closeDialog} title="Configurações">
      <div className="settings">
        <section className="settings-section" aria-labelledby="settings-feel">
          <h3 id="settings-feel" className="settings-h3">
            Sons e movimento
          </h3>
          <Switch
            label="Sons"
            description="Pequenos sons ao encaixar e soltar."
            checked={prefs.sound}
            onChange={(sound) => ui.setPrefs({ sound })}
          />
          <Switch
            label="Vibração"
            description="No celular, um toque leve ao encaixar."
            checked={prefs.haptics}
            onChange={(haptics) => ui.setPrefs({ haptics })}
          />
          <Segmented
            label="Animações"
            showLabel
            options={MOTION_OPTIONS}
            value={prefs.motion}
            onChange={(motion) => ui.setPrefs({ motion })}
          />
        </section>

        <section className="settings-section" aria-labelledby="settings-snap">
          <h3 id="settings-snap" className="settings-h3">
            Ímã da grade
          </h3>
          <Segmented
            label="Passo do ímã"
            options={SNAP_OPTIONS}
            value={stepValue}
            onChange={(v) => commands.setSnapStep(Number(v))}
          />
          <p className="settings-note">
            {snapEnabled
              ? 'Os cômodos e objetos encaixam nesse passo.'
              : 'O ímã está desligado. Escolher um passo liga de novo.'}
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-walls">
          <h3 id="settings-walls" className="settings-h3">
            Paredes e muro
          </h3>
          <WallSettings />
        </section>
      </div>
    </Dialog>
  );
}
