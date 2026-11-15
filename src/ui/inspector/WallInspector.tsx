import { AppWindow, BrickWall, DoorOpen, Unplug } from 'lucide-react';
import type { ReactElement } from 'react';
import { findSegment, lastWallTap, openWallFor, setWallOpen } from '../../editor/select/wall.ts';
import { placeOpeningAt } from '../../editor/tools/opening.ts';
import type { WallSegment } from '../../geometry/types.ts';
import type { OpeningType, Vec } from '../../model/types.ts';
import { formatCm, formatLength } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { toast } from '../controls/Toast.tsx';
import { commitWallThickness, WallThicknessPicker } from '../controls/WallThicknessPicker.tsx';
import './WallInspector.css';

const KIND_LABEL: Record<WallSegment['kind'], string> = {
  internal: 'Parede interna',
  external: 'Parede externa',
  boundary: 'Muro',
};

const SCOPE_NOTE: Record<WallSegment['kind'], string> = {
  internal: 'Vale para todas as paredes internas da casa.',
  external: 'Vale para todas as paredes externas da casa.',
  boundary: 'Vale para todo o muro do terreno.',
};

const center = (seg: { axis: 'h' | 'v'; line: number; start: number; end: number }): Vec => {
  const mid = Math.round((seg.start + seg.end) / 2);
  return seg.axis === 'h' ? { x: mid, y: seg.line } : { x: seg.line, y: mid };
};

/** The tap point when it lies on this segment, else the segment center. */
function placementPoint(seg: WallSegment): Vec {
  const tap = lastWallTap();
  if (tap) {
    const along = seg.axis === 'h' ? tap.x : tap.y;
    if (along >= seg.start && along <= seg.end) {
      return seg.axis === 'h'
        ? { x: Math.round(tap.x), y: seg.line }
        : { x: seg.line, y: Math.round(tap.y) };
    }
  }
  return center(seg);
}

function addOpening(type: OpeningType, at: Vec): void {
  if (!placeOpeningAt(type, at)) {
    toast('Não deu para colocar aqui. Use a ferramenta Portas e janelas e toque na parede.');
  }
}

/** Inspector of a wall segment: kind, length and thickness of its kind; remove or put back; add door or window. */
export function WallInspector(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const segmentId = sel?.kind === 'wall' ? sel.segmentId : null;
  const doc = useDoc((s) => s.doc);
  const readOnly = useDoc((s) => s.readOnly);
  const scene = useScene();
  if (!doc || !segmentId) return null;

  const nameOf = (id: string | null) =>
    id ? (doc.areas.find((a) => a.id === id)?.name ?? null) : null;
  const seg = findSegment(scene, segmentId);

  if (!seg) {
    const open = openWallFor(doc, segmentId);
    if (!open) {
      return (
        <div className="wall-inspector">
          <p className="wall-note">Esta parede mudou. Toque nela de novo na planta.</p>
        </div>
      );
    }
    return (
      <div className="wall-inspector">
        <div className="wall-summary">
          <p className="wall-title">Parede removida</p>
          <p className="wall-meta num">{formatLength(open.end - open.start)}</p>
        </div>
        <p className="wall-note">
          {nameOf(open.a) ?? 'Um cômodo'} e {nameOf(open.b) ?? 'outro'} estão integrados, sem parede
          entre eles. A linha tracejada mostra onde ela ficava.
        </p>
        <Button icon={<BrickWall />} block onClick={() => setWallOpen(open.a, open.b, false)}>
          Recolocar parede
        </Button>
      </div>
    );
  }

  const plus = nameOf(seg.plus);
  const minus = nameOf(seg.minus);
  const between =
    plus && minus ? `Entre ${minus} e ${plus}.` : `${plus ?? minus ?? 'Cômodo'} e o lado de fora.`;
  const canOpen =
    seg.kind === 'internal' &&
    seg.plus !== null &&
    seg.minus !== null &&
    doc.areas.find((a) => a.id === seg.plus)?.kind === 'room' &&
    doc.areas.find((a) => a.id === seg.minus)?.kind === 'room';
  const at = placementPoint(seg);

  return (
    <div className="wall-inspector">
      <div className="wall-summary">
        <p className="wall-title">
          {KIND_LABEL[seg.kind]} · <span className="num">{formatCm(seg.thickness)} cm</span> ·{' '}
          <span className="num">{formatLength(seg.end - seg.start)}</span>
        </p>
        <p className="wall-meta">{between}</p>
      </div>

      <div className="wall-actions">
        <Button icon={<DoorOpen />} onClick={() => addOpening('door', at)}>
          + Porta
        </Button>
        <Button icon={<AppWindow />} onClick={() => addOpening('window-sliding', at)}>
          + Janela
        </Button>
      </div>

      {canOpen && seg.plus && seg.minus ? (
        <Button icon={<Unplug />} block onClick={() => setWallOpen(seg.plus!, seg.minus!, true)}>
          Remover parede (integrar cômodos)
        </Button>
      ) : null}

      <WallThicknessPicker
        kind={seg.kind}
        label={`Espessura · ${KIND_LABEL[seg.kind]}`}
        hint={SCOPE_NOTE[seg.kind]}
        value={doc.structure[seg.kind]}
        presetId={doc.structure.wallPresets?.[seg.kind]}
        disabled={readOnly}
        onChange={(mm, id) => commitWallThickness(seg.kind, mm, id)}
      />

      <p className="wall-note">Arraste a parede na planta para mudar o tamanho dos cômodos.</p>
    </div>
  );
}
