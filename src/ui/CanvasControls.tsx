import { Expand, Grid3x3, Magnet, Minus, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { useDoc } from '../store/docStore.ts';
import { useUi } from '../store/uiStore.ts';
import { IconButton } from './controls/IconButton.tsx';
import { ZoomLabel } from './StatusBar.tsx';
import { commands } from './shortcuts.ts';
import './CanvasControls.css';

const ZOOM_STEP = 1.25;

/** Floating view controls over the canvas. */
export function CanvasControls({ compact }: { compact: boolean }): ReactElement {
  const grid = useUi((s) => s.layers.grid.visible);
  const snap = useUi((s) => s.snapEnabled);
  const hasDoc = useDoc((s) => s.doc !== null);

  return (
    <div className="canvas-controls" data-compact={compact ? 'true' : undefined}>
      {compact ? null : (
        <div className="canvas-zoom">
          <IconButton
            label="Afastar"
            icon={<Minus />}
            onClick={() => commands.zoomBy(1 / ZOOM_STEP)}
          />
          <span className="canvas-zoom-value">
            <ZoomLabel />
          </span>
          <IconButton
            label="Aproximar"
            icon={<Plus />}
            onClick={() => commands.zoomBy(ZOOM_STEP)}
          />
        </div>
      )}
      <IconButton
        variant="floating"
        label="Ver o terreno inteiro"
        icon={<Expand />}
        disabled={!hasDoc}
        onClick={() => commands.fitView()}
      />
      <IconButton
        variant="floating"
        label={grid ? 'Esconder a grade (G)' : 'Mostrar a grade (G)'}
        icon={<Grid3x3 />}
        pressed={grid}
        onClick={commands.toggleGrid}
      />
      <IconButton
        variant="floating"
        label={snap ? 'Desligar o ímã' : 'Ligar o ímã'}
        icon={<Magnet />}
        pressed={snap}
        onClick={commands.toggleSnap}
      />
    </div>
  );
}
