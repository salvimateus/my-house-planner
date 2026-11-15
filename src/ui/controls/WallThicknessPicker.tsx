import type { ReactElement } from 'react';
import { useId } from 'react';
import {
  resolveWallChoice,
  WALL_CUSTOM_RANGE,
  WALL_PRESET_NOTE,
  type WallChoice,
  wallPresetsFor,
} from '../../catalog/wallPresets.ts';
import type { WallKind } from '../../geometry/types.ts';
import { STRUCTURE_PRESETS } from '../../model/defaults.ts';
import type { Mm, Structure } from '../../model/types.ts';
import { formatCm } from '../../model/units.ts';
import { docStore } from '../../store/docStore.ts';
import { MeasureInput } from './MeasureInput.tsx';
import './WallThicknessPicker.css';

export type WallThicknessPickerProps = {
  kind: WallKind;
  /** Current thickness in mm. */
  value: Mm;
  onChange(mm: Mm, presetId: WallChoice): void;
  /** Stored choice for this kind; tells apart presets with the same thickness. */
  presetId?: string | null | undefined;
  /** Group name, shown above the options. */
  label: string;
  hint?: string;
  /** Show the plaster and São Paulo note under the options. */
  showNote?: boolean;
  disabled?: boolean;
};

const UNDO_LABEL: Record<WallKind, string> = {
  internal: 'Espessura das paredes internas',
  external: 'Espessura das paredes externas',
  boundary: 'Espessura do muro',
};

function structurePreset(internal: Mm, external: Mm): Structure['preset'] {
  for (const [id, p] of Object.entries(STRUCTURE_PRESETS)) {
    if (p.internal === internal && p.external === external) return id as Structure['preset'];
  }
  return 'custom';
}

/** Sets the thickness of every wall of one kind, in one undo step. */
export function commitWallThickness(kind: WallKind, mm: Mm, choice: WallChoice): void {
  const thickness = Math.round(mm / 10) * 10;
  docStore.getState().commit(UNDO_LABEL[kind], (d) => {
    const s = d.structure;
    s[kind] = thickness;
    s.wallPresets = {
      internal: s.wallPresets?.internal ?? null,
      external: s.wallPresets?.external ?? null,
      boundary: s.wallPresets?.boundary ?? null,
      [kind]: choice,
    };
    s.preset = structurePreset(s.internal, s.external);
  });
}

const wholeCm = (v: Mm): string | null =>
  v % 10 === 0 ? null : 'Use centímetros inteiros, por exemplo 15.';

/** Common Brazilian wall builds as cards, plus a custom thickness in cm. */
export function WallThicknessPicker({
  kind,
  value,
  onChange,
  presetId,
  label,
  hint,
  showNote = true,
  disabled,
}: WallThicknessPickerProps): ReactElement {
  const id = useId();
  const choice = resolveWallChoice(kind, value, presetId);
  const presets = wallPresetsFor(kind);

  return (
    <fieldset
      className="wall-picker"
      disabled={disabled}
      aria-describedby={hint ? `${id}-hint` : undefined}
    >
      <legend className="wall-picker-legend">{label}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="wall-picker-hint">
          {hint}
        </p>
      ) : null}
      <div className="wall-picker-list">
        {presets.map((p) => {
          const [size, name] = p.label.split(' · ');
          return (
            <label key={p.id} className="wall-picker-option">
              <input
                type="radio"
                className="wall-picker-radio"
                name={id}
                checked={choice === p.id}
                onChange={() => onChange(p.thickness, p.id)}
              />
              <span className="wall-picker-size num">{size}</span>
              <span className="wall-picker-text">
                <span className="wall-picker-name">{name ?? p.label}</span>
                <span className="wall-picker-desc">{p.explanation}</span>
              </span>
            </label>
          );
        })}
        <label className="wall-picker-option">
          <input
            type="radio"
            className="wall-picker-radio"
            name={id}
            checked={choice === 'custom'}
            onChange={() => onChange(value, 'custom')}
          />
          <span className="wall-picker-size num">
            {choice === 'custom' ? `${formatCm(value)} cm` : 'cm'}
          </span>
          <span className="wall-picker-text">
            <span className="wall-picker-name">Personalizado</span>
            <span className="wall-picker-desc">Digite a espessura em centímetros inteiros.</span>
          </span>
        </label>
      </div>
      {choice === 'custom' ? (
        <MeasureInput
          className="wall-picker-custom"
          label="Espessura personalizada"
          unit="cm"
          value={value}
          min={WALL_CUSTOM_RANGE.min}
          max={WALL_CUSTOM_RANGE.max}
          validate={wholeCm}
          disabled={disabled}
          onCommit={(v) => onChange(v, 'custom')}
        />
      ) : null}
      {showNote ? <p className="wall-picker-note">{WALL_PRESET_NOTE}</p> : null}
    </fieldset>
  );
}
