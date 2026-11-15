import type { ReactElement } from 'react';
import { useUi } from '../../store/uiStore.ts';
import { FillPicker } from '../controls/FillPicker.tsx';
import './PaintPanel.css';

export function PaintPanel(): ReactElement {
  const fill = useUi((s) => s.paintFill);
  const setPaintFill = useUi((s) => s.setPaintFill);
  return (
    <div className="paint-panel">
      <FillPicker value={fill} onChange={setPaintFill} group="all" />
      <p className="paint-tip">
        Para copiar o piso de um cômodo, segure o dedo nele. No computador, use Alt + clique.
      </p>
    </div>
  );
}
