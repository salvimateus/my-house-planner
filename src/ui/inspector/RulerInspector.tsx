import { Link2Off, RotateCw, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { releaseRuler, rotateRuler } from '../../editor/select/ruler.ts';
import { formatLength } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { commands } from '../shortcuts.ts';
import './RulerInspector.css';

/** Length of the selected ruler, with turn, release (fit rulers) and delete. */
export function RulerInspector(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const rulers = useDoc((s) => s.doc?.rulers ?? null);
  const scene = useScene();
  if (sel?.kind !== 'ruler' || !rulers) return null;

  const remove = (
    <Button variant="danger" icon={<Trash2 />} onClick={() => commands.deleteSelection()} block>
      Excluir
    </Button>
  );

  if (sel.ids.length !== 1) {
    return (
      <div className="ruler-inspector">
        <p className="ruler-note">{sel.ids.length} réguas selecionadas.</p>
        {remove}
      </div>
    );
  }

  const id = sel.ids[0]!;
  const r = rulers.find((x) => x.id === id);
  const d = scene.rulers.get(id);
  if (!r || !d) return null;
  const fit = r.mode === 'fit';
  const valid = d.valid && d.length > 0;

  return (
    <div className="ruler-inspector">
      <div className="ruler-readout">
        <span className="ruler-length num" data-invalid={!valid}>
          {valid ? formatLength(d.length) : '?'}
        </span>
        <span className="ruler-kind">{fit ? 'De parede a parede' : 'Régua livre'}</span>
      </div>
      <p className="ruler-note">
        {!valid
          ? 'A régua está dentro de uma parede. Arraste para um espaço livre.'
          : fit
            ? 'Mede o vão livre, sem a espessura das paredes e do muro. Se as paredes mudarem, a medida muda sozinha.'
            : 'Mede entre dois pontos. Arraste as pontas para ajustar.'}
      </p>
      <div className="ruler-actions">
        <Button icon={<RotateCw />} onClick={() => rotateRuler(id)}>
          Girar 90°
        </Button>
        {fit ? (
          <Button icon={<Link2Off />} disabled={!valid} onClick={() => releaseRuler(id)}>
            Soltar
          </Button>
        ) : null}
      </div>
      {remove}
    </div>
  );
}
