import type { LucideIcon } from 'lucide-react';
import {
  Bath,
  BedDouble,
  CircleCheck,
  DoorClosed,
  DoorOpen,
  Droplets,
  House,
  Lightbulb,
  LocateFixed,
  Ruler,
  Sofa,
  Unlink,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { openWallThickness } from '../../education/explainers/WallThickness.tsx';
import { contextTips } from '../../education/tips.ts';
import { MAX_OCCUPANCY, MIN_PERMEABILITY } from '../../geometry/checks.ts';
import { bboxOf, rotatedAabb } from '../../geometry/shape.ts';
import type { Issue, IssueCode, Rect, Scene } from '../../geometry/types.ts';
import { pulseRect } from '../../juice/effects.ts';
import { tuning } from '../../juice/tuning.ts';
import { reducedMotion } from '../../juice/tween.ts';
import type { ProjectDoc } from '../../model/types.ts';
import { camera } from '../../store/cameraStore.ts';
import { docStore, useDoc } from '../../store/docStore.ts';
import { sceneOf, useScene } from '../../store/selectors.ts';
import { uiStore } from '../../store/uiStore.ts';
import { fitClearOfChrome, lotViewBounds } from '../shortcuts.ts';
import './HealthPanel.css';

const ICONS: Record<IssueCode, LucideIcon> = {
  'room-without-door': DoorClosed,
  'bathroom-without-window': Bath,
  'small-bedroom': BedDouble,
  'door-swing-blocked': DoorOpen,
  'orphan-opening': Unlink,
  'item-outside': Sofa,
  'narrow-ruler': Ruler,
  'high-occupancy': House,
  'low-permeability': Droplets,
};

const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

/** Smallest box the camera flies to, so a door does not fill the screen. */
const MIN_VIEW = 4000;
const WIDE_QUERY = '(min-width: 900px)';

const around = (x: number, y: number, r: number): Rect => ({
  x0: x - r,
  y0: y - r,
  x1: x + r,
  y1: y + r,
});

/** What the issue is about, in world mm. */
function targetRect(issue: Issue, doc: ProjectDoc, scene: Scene): Rect {
  const t = issue.target;
  const fallback = around(issue.at.x, issue.at.y, 500);
  switch (t?.kind) {
    case 'area': {
      const a = doc.areas.find((x) => x.id === t.id);
      return a ? bboxOf(a.shape) : fallback;
    }
    case 'opening': {
      const gap = scene.openings.get(t.id)?.gap;
      if (gap) return gap;
      const o = doc.openings.find((x) => x.id === t.id);
      if (!o) return fallback;
      const half = o.width / 2;
      return o.axis === 'h'
        ? { x0: o.at - half, y0: o.line - 100, x1: o.at + half, y1: o.line + 100 }
        : { x0: o.line - 100, y0: o.at - half, x1: o.line + 100, y1: o.at + half };
    }
    case 'item': {
      const it = doc.items.find((x) => x.id === t.id);
      return it ? rotatedAabb(it.x, it.y, it.w, it.d, it.rotation) : fallback;
    }
    case 'ruler': {
      const r = scene.rulers.get(t.id);
      if (!r) return fallback;
      return {
        x0: Math.min(r.a.x, r.b.x),
        y0: Math.min(r.a.y, r.b.y),
        x1: Math.max(r.a.x, r.b.x),
        y1: Math.max(r.a.y, r.b.y),
      };
    }
    case 'lot':
      return { x0: 0, y0: 0, x1: doc.lot.width, y1: doc.lot.depth };
    default:
      return fallback;
  }
}

function grow(r: Rect, min: number): Rect {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const hw = Math.max(r.x1 - r.x0, min) / 2;
  const hh = Math.max(r.y1 - r.y0, min) / 2;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

let pulseTimer = 0;

/** Flies the camera to the issue and pulses what it is about. */
function focusIssue(issue: Issue): void {
  const doc = docStore.getState().doc;
  if (!doc) return;
  const target = targetRect(issue, doc, sceneOf(doc));
  const ui = uiStore.getState();
  if (!matchMedia(WIDE_QUERY).matches && ui.sheet.id === 'health') ui.setSheet('health', 'peek');
  const view = issue.target?.kind === 'lot' ? lotViewBounds(doc.lot) : grow(target, MIN_VIEW);
  camera.fit(fitClearOfChrome(view), 0, true);
  window.clearTimeout(pulseTimer);
  pulseTimer = window.setTimeout(
    () => pulseRect(target),
    reducedMotion() ? 0 : tuning.camera.fitMs + 40,
  );
}

function Meter({
  label,
  value,
  limit,
  over,
  hint,
}: {
  label: string;
  value: number;
  limit: number;
  over: boolean;
  hint: string;
}): ReactElement {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="health-meter" data-over={over}>
      <div className="health-meter-head">
        <span className="health-meter-label">{label}</span>
        <span className="health-meter-value num">{pct.format(value)}</span>
      </div>
      <div className="health-meter-track" aria-hidden="true">
        <span className="health-meter-bar" style={{ transform: `scaleX(${v})` }} />
        <span className="health-meter-limit" style={{ left: `${limit * 100}%` }} />
      </div>
      <p className="health-meter-hint">{hint}</p>
    </div>
  );
}

function issueKey(issue: Issue, i: number): string {
  const t = issue.target;
  const id = t && 'id' in t ? t.id : t?.kind === 'label' ? t.areaId : (t?.kind ?? 'none');
  return `${issue.code}:${id}:${i}`;
}

/** "Saúde da planta": friendly checks with a tap to see each one on the plan, plus rules of thumb. */
export function HealthPanel(): ReactElement {
  const scene = useScene();
  const doc = useDoc((s) => s.doc);
  const issues = [...scene.issues].sort(
    (a, b) => Number(b.severity === 'warning') - Number(a.severity === 'warning'),
  );
  const tips = contextTips(doc);
  const t = scene.totals;
  const hasHouse = doc?.areas.some((a) => a.kind !== 'outdoor') ?? false;

  return (
    <div className="health">
      {hasHouse ? (
        <div className="health-meters">
          <Meter
            label="Ocupação do terreno"
            value={t.occupancy}
            limit={MAX_OCCUPANCY}
            over={t.occupancy > MAX_OCCUPANCY}
            hint="Costuma ir até 70%."
          />
          <Meter
            label="Área permeável"
            value={t.permeability}
            limit={MIN_PERMEABILITY}
            over={t.permeability < MIN_PERMEABILITY}
            hint="Costuma ser 15% ou mais: grama, jardim, terra."
          />
        </div>
      ) : null}

      {issues.length === 0 ? (
        <div className="health-ok">
          <CircleCheck aria-hidden="true" />
          <div>
            <p className="health-ok-title">Tudo certo por aqui</p>
            <p className="health-ok-text">
              {hasHouse
                ? 'Nenhum ponto para revisar agora. As dicas abaixo ajudam a deixar a casa ainda melhor.'
                : 'Desenhe um cômodo e as dicas aparecem aqui.'}
            </p>
          </div>
        </div>
      ) : (
        <section aria-labelledby="health-issues-title">
          <h3 id="health-issues-title" className="health-section-title">
            {issues.length === 1 ? '1 ponto para revisar' : `${issues.length} pontos para revisar`}
          </h3>
          <ul className="health-list">
            {issues.map((issue, i) => {
              const Icon = ICONS[issue.code];
              return (
                <li key={issueKey(issue, i)}>
                  <button
                    type="button"
                    className="health-issue"
                    data-severity={issue.severity}
                    onClick={() => focusIssue(issue)}
                  >
                    <span className="health-issue-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="health-issue-text">{issue.message}</span>
                    <span className="health-issue-go" aria-hidden="true">
                      <LocateFixed />
                    </span>
                    <span className="sr-only">Mostrar na planta</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tips.length > 0 ? (
        <section aria-labelledby="health-tips-title">
          <h3 id="health-tips-title" className="health-section-title">
            Boas ideias
          </h3>
          <ul className="health-tips">
            {tips.map((tip) => (
              <li key={tip.id} className="health-tip">
                <span className="health-tip-icon" aria-hidden="true">
                  <Lightbulb />
                </span>
                <span className="health-tip-body">
                  <strong>{tip.title}.</strong> {tip.text}
                  {tip.explainer === 'wall-thickness' ? (
                    <button type="button" className="health-tip-more" onClick={openWallThickness}>
                      Ver explicação
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
