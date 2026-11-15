import { Copy, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import {
  duplicateWalkway,
  findWalkway,
  setWalkwayColor,
  setWalkwayStyle,
  setWalkwayWidth,
} from '../../editor/select/walkway.ts';
import { walkwayLength } from '../../geometry/walkway.ts';
import { feedback } from '../../juice/feedback.ts';
import { WALKWAY_COLORS, WALKWAY_WIDTH } from '../../model/factories.ts';
import type { WalkwayStyle } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Swatch } from '../controls/Swatch.tsx';
import { commands } from '../shortcuts.ts';
import './WalkwayInspector.css';

const STYLES: { id: WalkwayStyle; label: string; note: string }[] = [
  { id: 'stepping', label: 'Pisantes', note: 'Placas de concreto soltas, com grama entre elas.' },
  { id: 'solid', label: 'Contínuo', note: 'Calçada de cimento inteira, com juntas.' },
  { id: 'gravel', label: 'Pedrisco', note: 'Faixa de pedrinhas com borda fina.' },
];

const COLOR_NAMES: Record<WalkwayStyle, readonly string[]> = {
  stepping: ['Concreto', 'Concreto claro', 'Areia', 'Terroso', 'Grafite'],
  solid: ['Cimento', 'Cimento claro', 'Cinza médio', 'Ocre', 'Grafite'],
  gravel: ['Pedrisco bege', 'Branco', 'Areia', 'Cinza', 'Grafite'],
};

function StyleIcon({ style }: { style: WalkwayStyle }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="walkway-style-icon" aria-hidden="true">
      {style === 'stepping' ? (
        <>
          <rect x="3" y="8" width="5" height="8" rx="1.5" />
          <rect x="10" y="8" width="5" height="8" rx="1.5" />
          <rect x="17" y="8" width="4" height="8" rx="1.5" />
        </>
      ) : style === 'solid' ? (
        <rect x="2" y="8" width="20" height="8" rx="3" />
      ) : (
        <>
          <rect x="2" y="7" width="20" height="10" rx="3" className="walkway-style-gravel" />
          <circle cx="6" cy="11" r="1.2" />
          <circle cx="10" cy="14" r="1" />
          <circle cx="13" cy="10.5" r="1.1" />
          <circle cx="17" cy="13.5" r="1.2" />
          <circle cx="19" cy="10" r="0.9" />
        </>
      )}
    </svg>
  );
}

/** Style, width, color and length of the selected garden walkway. */
export function WalkwayInspector(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const doc = useDoc((s) => s.doc);
  if (sel?.kind !== 'walkway') return null;
  const w = findWalkway(doc, sel.id);
  if (!w) return null;

  const style = STYLES.find((s) => s.id === w.style) ?? STYLES[0]!;
  const palette = WALKWAY_COLORS[w.style];
  const names = COLOR_NAMES[w.style];

  return (
    <div className="walkway-inspector">
      <div className="walkway-readout">
        <span className="walkway-length num">
          <span className="walkway-length-label">Comprimento</span>{' '}
          {formatLength(walkwayLength(w.points))}
        </span>
        <span className="walkway-sub">
          {w.points.length} pontos · {style.note}
        </span>
      </div>

      <fieldset className="walkway-field">
        <legend className="walkway-label">Tipo</legend>
        <div className="walkway-chips">
          {STYLES.map((s) => (
            <Chip
              key={s.id}
              selected={s.id === w.style}
              icon={<StyleIcon style={s.id} />}
              onClick={() => {
                if (s.id !== w.style) {
                  setWalkwayStyle(w.id, s.id);
                  feedback.tick();
                }
              }}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <MeasureInput
        label="Largura"
        unit="cm"
        value={w.width}
        min={WALKWAY_WIDTH.min}
        max={WALKWAY_WIDTH.max}
        step={50}
        onCommit={(v) => setWalkwayWidth(w.id, v)}
        hint="Entre 50 e 120 cm. Para uma pessoa, 60 cm basta."
      />

      <fieldset className="walkway-field">
        <legend className="walkway-label">Cor</legend>
        <div className="walkway-swatches">
          {palette.map((c, i) => (
            <Swatch
              key={c}
              color={c}
              label={names[i] ?? c}
              selected={c.toLowerCase() === w.color.toLowerCase()}
              onClick={() => {
                if (c !== w.color) setWalkwayColor(w.id, c);
              }}
            />
          ))}
        </div>
      </fieldset>

      <p className="walkway-note">
        Arraste os pontos para curvar. Toque no “+” para criar um ponto. Para apagar um ponto, toque
        duas vezes nele ou segure o dedo.
      </p>

      <div className="walkway-actions">
        <Button
          icon={<Copy />}
          onClick={() => {
            if (duplicateWalkway(w.id)) feedback.place();
          }}
        >
          Duplicar
        </Button>
        <Button variant="danger" icon={<Trash2 />} onClick={() => commands.deleteSelection()}>
          Excluir
        </Button>
      </div>
    </div>
  );
}
