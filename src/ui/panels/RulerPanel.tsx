import { Lock, MoveHorizontal, Pointer } from 'lucide-react';
import type { ReactElement } from 'react';
import { uiStore, useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import './RulerPanel.css';

/** How to use the ruler tool, and a way back when the measures layer is hidden or locked. */
export function RulerPanel(): ReactElement {
  const measures = useUi((s) => s.layers.measures);
  const toggle = uiStore.getState().toggleLayer;

  return (
    <div className="ruler-panel">
      <ul className="ruler-panel-list">
        <li className="ruler-panel-item">
          <Pointer className="ruler-panel-icon" aria-hidden="true" />
          <div>
            <p className="ruler-panel-title">Toque num espaço para medir de parede a parede</p>
            <p className="ruler-panel-text">
              Mostra o vão livre de um corredor ou cômodo, sem as paredes e o muro.
            </p>
          </div>
        </li>
        <li className="ruler-panel-item">
          <MoveHorizontal className="ruler-panel-icon" aria-hidden="true" />
          <div>
            <p className="ruler-panel-title">Ou arraste para medir livre</p>
            <p className="ruler-panel-text">As pontas grudam nas paredes e nos móveis.</p>
          </div>
        </li>
      </ul>
      {measures.locked ? (
        <div className="ruler-panel-notice">
          <p>
            <Lock className="ruler-panel-notice-icon" aria-hidden="true" /> A camada de medidas está
            travada.
          </p>
          <Button size="sm" onClick={() => toggle('measures', 'locked')}>
            Destravar
          </Button>
        </div>
      ) : !measures.visible ? (
        <div className="ruler-panel-notice">
          <p>As medidas estão escondidas.</p>
          <Button size="sm" onClick={() => toggle('measures', 'visible')}>
            Mostrar medidas
          </Button>
        </div>
      ) : null}
    </div>
  );
}
