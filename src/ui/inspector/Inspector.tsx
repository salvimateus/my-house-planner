import { MousePointerClick } from 'lucide-react';
import type { ReactElement } from 'react';
import { useDoc } from '../../store/docStore.ts';
import { type Selection, useUi } from '../../store/uiStore.ts';
import { AreaInspector } from './AreaInspector.tsx';
import { FrontageInspector } from './FrontageInspector.tsx';
import { ItemInspector } from './ItemInspector.tsx';
import { LotInspector } from './LotInspector.tsx';
import { OpeningInspector } from './OpeningInspector.tsx';
import { RulerInspector } from './RulerInspector.tsx';
import { WalkwayInspector } from './WalkwayInspector.tsx';
import { WallInspector } from './WallInspector.tsx';
import './Inspector.css';

export function inspectorTitle(sel: Selection): string {
  switch (sel?.kind) {
    case 'area':
      return 'Cômodo';
    case 'wall':
      return 'Parede';
    case 'lot':
      return 'Terreno';
    case 'opening':
      return sel.ids.length > 1 ? 'Aberturas' : 'Porta ou janela';
    case 'item':
      return sel.ids.length > 1 ? `${sel.ids.length} objetos` : 'Objeto';
    case 'ruler':
      return sel.ids.length > 1 ? 'Réguas' : 'Régua';
    case 'street-tree':
      return 'Árvore da calçada';
    case 'sidewalk-ramp':
      return 'Rampa para carro';
    case 'walkway':
      return 'Caminho no jardim';
    default:
      return 'Seleção';
  }
}

function SelectionBody({ sel }: { sel: Selection }): ReactElement {
  switch (sel?.kind) {
    case 'area':
      return <AreaInspector key={sel.id} />;
    case 'wall':
      return <WallInspector key={sel.segmentId} />;
    case 'lot':
      return <LotInspector />;
    case 'opening':
      return <OpeningInspector />;
    case 'item':
      return <ItemInspector />;
    case 'ruler':
      return <RulerInspector />;
    case 'street-tree':
    case 'sidewalk-ramp':
      return <FrontageInspector key={sel.id} />;
    case 'walkway':
      return <WalkwayInspector key={sel.id} />;
    default:
      return <EmptySelection />;
  }
}

export function EmptySelection(): ReactElement {
  return (
    <div className="inspector-empty">
      <MousePointerClick className="inspector-empty-icon" aria-hidden="true" />
      <p className="inspector-empty-title">Nada selecionado</p>
      <p className="inspector-empty-text">
        Toque num cômodo, numa parede, numa porta ou num objeto para ver e mudar as medidas.
      </p>
    </div>
  );
}

/** Routes the current selection to its inspector. Read-only mode disables every control inside. */
export function Inspector(): ReactElement {
  const sel = useUi((s) => s.selection);
  const readOnly = useDoc((s) => s.readOnly);
  return (
    <fieldset className="inspector" disabled={readOnly}>
      <legend className="sr-only">{inspectorTitle(sel)}</legend>
      <SelectionBody sel={sel} />
    </fieldset>
  );
}
