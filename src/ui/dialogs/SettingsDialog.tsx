import { Fence, House } from 'lucide-react';
import type { ReactElement } from 'react';
import { WALL_PRESET_NOTE } from '../../catalog/wallPresets.ts';
import { useDoc } from '../../store/docStore.ts';
import { type UiState, uiStore, useUi } from '../../store/uiStore.ts';
import { Dialog } from '../controls/Dialog.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { Switch } from '../controls/Switch.tsx';
import { commitWallThickness, WallThicknessPicker } from '../controls/WallThicknessPicker.tsx';
import { commands } from '../shortcuts.ts';
import { type EffectiveTheme, useEffectiveTheme } from '../useEffectiveTheme.ts';
import './SettingsDialog.css';
import { track } from '../../analytics/track.ts';

const MOTION_OPTIONS: { value: UiState['prefs']['motion']; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'reduced', label: 'Reduzido' },
  { value: 'full', label: 'Completo' },
];

const THEME_OPTIONS: { value: EffectiveTheme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

const SNAP_OPTIONS: { value: string; label: string }[] = [
  { value: '500', label: '0,5 m' },
  { value: '250', label: '0,25 m' },
  { value: '100', label: '0,1 m' },
];

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

  const presets = structure.wallPresets;
  return (
    <div className="settings-walls">
      <div className="settings-wall-group">
        <p className="settings-scope">
          <House aria-hidden="true" />
          Muda a casa
        </p>
        <WallThicknessPicker
          kind="internal"
          label="Paredes internas da casa"
          hint="As paredes entre um cômodo e outro."
          value={structure.internal}
          presetId={presets?.internal}
          showNote={false}
          disabled={readOnly}
          onChange={(mm, id) => commitWallThickness('internal', mm, id)}
        />
        <WallThicknessPicker
          kind="external"
          label="Paredes externas da casa"
          hint="As paredes entre a casa e o lado de fora."
          value={structure.external}
          presetId={presets?.external}
          showNote={false}
          disabled={readOnly}
          onChange={(mm, id) => commitWallThickness('external', mm, id)}
        />
      </div>
      <div className="settings-wall-group">
        <p className="settings-scope">
          <Fence aria-hidden="true" />
          Muda só o terreno
        </p>
        <WallThicknessPicker
          kind="boundary"
          label="Muro do terreno"
          hint="O muro nas divisas do lote. Não muda as paredes da casa."
          value={structure.boundary}
          presetId={presets?.boundary}
          showNote={false}
          disabled={readOnly}
          onChange={(mm, id) => commitWallThickness('boundary', mm, id)}
        />
      </div>
      <p className="settings-note">{WALL_PRESET_NOTE}</p>
    </div>
  );
}

export function SettingsDialog(): ReactElement {
  const open = useUi((s) => s.dialog === 'settings');
  const prefs = useUi((s) => s.prefs);
  const theme = useEffectiveTheme();
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

        <section className="settings-section" aria-labelledby="settings-theme">
          <h3 id="settings-theme" className="settings-h3">
            Aparência
          </h3>
          <Segmented
            label="Tema"
            showLabel
            options={THEME_OPTIONS}
            value={theme}
            onChange={(next) => {
              ui.setPrefs({ theme: next });
              track('theme_change', { theme: next });
            }}
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
