import { HeartPulse, Layers } from 'lucide-react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import { formatArea } from '../model/units.ts';
import { cameraStore } from '../store/cameraStore.ts';
import { useScene } from '../store/selectors.ts';
import { uiStore } from '../store/uiStore.ts';
import { IconButton } from './controls/IconButton.tsx';
import './StatusBar.css';

/** Zoom shown as 100% when 1 m spans 50 screen px. */
const ZOOM_100 = 0.05;

const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const short = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "85,2 m²": one decimal, rounded on integer hundredths first. */
export const formatAreaShort = (mm2: number): string =>
  `${short.format(Math.round(Math.round(mm2 / 10_000) / 10) / 10)} m²`;

function useTips(): number {
  const scene = useScene();
  return scene.issues.length;
}

function tipsLabel(n: number): string {
  if (n === 0) return 'Tudo certo';
  return n === 1 ? '1 dica' : `${n} dicas`;
}

export function ZoomLabel(): ReactElement {
  const zoom = useStore(cameraStore, (s) => s.committed.zoom);
  return <output className="num">{pct.format(zoom / ZOOM_100)}</output>;
}

/** Desktop status bar with plan totals. */
export function StatusBar(): ReactElement {
  const { totals } = useScene();
  const tips = useTips();
  const openSheet = (id: 'health' | 'layers') => uiStore.getState().setSheet(id);

  return (
    <footer className="statusbar">
      <dl className="status-totals">
        <div className="status-item">
          <dt>Terreno</dt>
          <dd className="num">{formatArea(totals.lotArea)}</dd>
        </div>
        <div className="status-item">
          <dt>Construída</dt>
          <dd className="num">{formatArea(totals.builtArea)}</dd>
        </div>
        <div className="status-item">
          <dt>Útil</dt>
          <dd className="num">{formatArea(totals.netArea)}</dd>
        </div>
        <div className="status-item">
          <dt>Ocupação</dt>
          <dd className="num">{pct.format(totals.occupancy)}</dd>
        </div>
        <div className="status-item">
          <dt>Permeável</dt>
          <dd className="num">{pct.format(totals.permeability)}</dd>
        </div>
      </dl>
      <div className="status-tools">
        <button type="button" className="status-tips" onClick={() => openSheet('health')}>
          <HeartPulse aria-hidden="true" />
          {tipsLabel(tips)}
        </button>
        <IconButton label="Camadas" icon={<Layers />} onClick={() => openSheet('layers')} />
      </div>
    </footer>
  );
}

/** Compact totals chip over the canvas on phones. */
export function StatusChip(): ReactElement {
  const { totals } = useScene();
  const tips = useTips();
  return (
    <button
      type="button"
      className="status-chip"
      onClick={() => uiStore.getState().setSheet('health', 'half')}
      aria-label={`Área útil ${formatArea(totals.netArea)}. ${tipsLabel(tips)}. Abrir saúde da planta.`}
    >
      <span className="num">Útil {formatAreaShort(totals.netArea)}</span>
      <span className="status-chip-sep" aria-hidden="true">
        ·
      </span>
      <span className={tips > 0 ? 'status-chip-tips' : undefined}>{tipsLabel(tips)}</span>
    </button>
  );
}
