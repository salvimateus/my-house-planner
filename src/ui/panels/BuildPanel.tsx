import type { ReactElement } from 'react';
import { presetsOfKind } from '../../catalog/roomPresets.ts';
import { formatLength } from '../../model/units.ts';
import { type BuildMode, uiStore, useUi } from '../../store/uiStore.ts';
import { Chip } from '../controls/Chip.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { chipLabel, PresetIcon, RoomTypePicker } from './RoomTypePicker.tsx';
import './BuildPanel.css';

const MODES: { value: BuildMode; label: string }[] = [
  { value: 'room', label: 'Cômodo' },
  { value: 'covered', label: 'Coberta' },
  { value: 'outdoor', label: 'Externa' },
  { value: 'split', label: 'Dividir' },
];

const OUTDOOR = presetsOfKind('outdoor');

function modeHint(mode: BuildMode, step: string): string {
  switch (mode) {
    case 'room':
      return `Arraste no terreno. O ímã prende a cada ${step} e as paredes aparecem sozinhas.`;
    case 'covered':
      return 'Garagem, varanda ou área gourmet: tem teto, mas não fecha com parede para fora.';
    case 'outdoor':
      return 'Escolha o tipo e arraste. Área externa fica por baixo da casa e não tem parede.';
    case 'split':
      return 'Arraste uma linha dentro de um cômodo, de parede a parede, para dividir em dois.';
  }
}

/** Build panel: drawing mode, outdoor presets and the room type picker of the new room. */
export function BuildPanel(): ReactElement {
  const mode = useUi((s) => s.buildMode);
  const outdoorPreset = useUi((s) => s.outdoorPreset);
  const step = useUi((s) => s.snapStep);
  const ui = uiStore.getState();

  return (
    <div className="build-panel">
      <Segmented<BuildMode>
        label="O que desenhar"
        options={MODES}
        value={mode}
        onChange={(m) => ui.setBuildMode(m)}
        className="build-modes"
      />
      {mode === 'outdoor' ? (
        <fieldset className="build-presets">
          <legend className="sr-only">Tipo de área externa</legend>
          {OUTDOOR.map((p) => (
            <Chip
              key={p.id}
              selected={outdoorPreset === p.id}
              icon={<PresetIcon preset={p} />}
              onClick={() => ui.setOutdoorPreset(p.id)}
            >
              {chipLabel(p)}
            </Chip>
          ))}
        </fieldset>
      ) : null}
      <p className="build-hint">{modeHint(mode, formatLength(step))}</p>
      <RoomTypePicker />
    </div>
  );
}
