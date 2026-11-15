import { CircleHelp, FlipHorizontal2, FlipVertical2, Trash2, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { OPENING_SPECS } from '../../catalog/openingSpecs.ts';
import { openingDef } from '../../catalog/registry.ts';
import {
  canFlipHinge,
  canFlipSide,
  flipHinge,
  flipSide,
  setOpeningHeight,
  setOpeningSill,
  setOpeningType,
  setOpeningWidth,
  swingCaption,
  widthProblem,
} from '../../editor/select/opening.ts';
import { DoorSwingHost, openDoorSwing } from '../../education/explainers/DoorSwing.tsx';
import type { WallKind } from '../../geometry/types.ts';
import type { Opening } from '../../model/types.ts';
import { formatCm } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { toast } from '../controls/Toast.tsx';
import { OpeningPreview, typesOf } from '../panels/OpeningsPanel.tsx';
import { commands } from '../shortcuts.ts';
import './OpeningInspector.css';

const EMPTY: Opening[] = [];

const HOST_LABEL: Record<WallKind, string> = {
  internal: 'Parede interna',
  external: 'Parede externa',
  boundary: 'Muro',
};

const SLIDING = new Set(['door-sliding', 'door-balcony', 'gate-sliding']);

function useSelectedOpenings(): Opening[] {
  const ids = useUi((s) => (s.selection?.kind === 'opening' ? s.selection.ids : null));
  const openings = useDoc((s) => s.doc?.openings ?? EMPTY);
  return useMemo(() => {
    if (!ids) return EMPTY;
    const set = new Set(ids);
    return openings.filter((o) => set.has(o.id));
  }, [ids, openings]);
}

const report = (problem: string | null) => {
  if (problem) toast(problem, { tone: 'error' });
};

function SingleOpening({ o }: { o: Opening }): ReactElement {
  const doc = useDoc((s) => s.doc);
  const scene = useScene();
  const spec = OPENING_SPECS[o.type];
  const def = openingDef(o.type);
  const derived = scene.openings.get(o.id);
  const host = derived?.run?.kind ?? null;
  const caption = doc ? swingCaption(o, doc, scene) : null;
  const hingeFlip = canFlipHinge(o.type);
  const sideFlip = canFlipSide(o.type);
  const isWindow = spec.group === 'window';

  return (
    <div className="opening-inspector">
      <div className="opening-identity">
        <span className="opening-identity-thumb">
          <OpeningPreview
            type={o.type}
            width={o.width}
            hinge={o.hinge}
            side={o.side}
            className="opening-identity-preview"
          />
        </span>
        <span className="opening-identity-text">
          <span className="opening-identity-name">{def?.label ?? 'Abertura'}</span>
          <span className="opening-identity-sub">
            {host ? `${HOST_LABEL[host]} · ` : ''}
            <span className="num">
              {formatCm(o.width)} × {formatCm(o.height)} cm
            </span>
          </span>
        </span>
      </div>

      {derived && !derived.valid ? (
        <p className="opening-warning" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>Ficou fora de uma parede. Arraste até uma parede ou exclua.</span>
        </p>
      ) : null}

      <section className="opening-section" aria-label="Modelo">
        <h3 className="opening-section-title">Modelo</h3>
        <div className="opening-chips">
          {typesOf(spec.group).map((type) => {
            const fits = host === null || OPENING_SPECS[type].hosts.includes(host);
            return (
              <Chip
                key={type}
                selected={type === o.type}
                disabled={!fits}
                title={fits ? undefined : 'Não vai neste tipo de parede'}
                onClick={() => report(setOpeningType(o.id, type))}
              >
                {openingDef(type)?.label ?? type}
              </Chip>
            );
          })}
        </div>
      </section>

      <section className="opening-section" aria-label="Medidas">
        <h3 className="opening-section-title">Medidas</h3>
        <div className="opening-field">
          <span className="opening-field-label">Largura</span>
          <div className="opening-chips">
            {spec.widths.map((w) => (
              <Chip
                key={w}
                selected={w === o.width}
                onClick={() => report(setOpeningWidth(o.id, w))}
              >
                <span className="num">{formatCm(w)} cm</span>
              </Chip>
            ))}
          </div>
          <MeasureInput
            label="Largura"
            hideLabel
            unit="cm"
            value={o.width}
            min={spec.minWidth}
            max={spec.maxWidth}
            step={50}
            validate={(w) => widthProblem(o.id, w)}
            onCommit={(w) => report(setOpeningWidth(o.id, w))}
          />
        </div>
        <div className="opening-measures">
          <MeasureInput
            label="Altura"
            unit="cm"
            value={o.height}
            min={300}
            max={3500}
            step={50}
            onCommit={(h) => setOpeningHeight(o.id, h)}
          />
          {isWindow ? (
            <MeasureInput
              label="Peitoril"
              unit="cm"
              value={o.sill}
              min={0}
              max={2400}
              step={50}
              hint="Do chão até a janela."
              onCommit={(v) => setOpeningSill(o.id, v)}
            />
          ) : null}
        </div>
      </section>

      {hingeFlip || sideFlip ? (
        <section className="opening-section" aria-label="Abertura">
          <h3 className="opening-section-title">Abertura</h3>
          {caption ? (
            <p className="opening-caption">
              <span>{caption}.</span>
              {spec.group === 'door' ? (
                <button type="button" className="opening-why" onClick={openDoorSwing}>
                  <CircleHelp aria-hidden="true" />
                  Por quê?
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="opening-flips">
            {hingeFlip ? (
              <Button icon={<FlipHorizontal2 />} onClick={() => flipHinge(o.id)}>
                {SLIDING.has(o.type) ? 'Correr para o outro lado' : 'Trocar lado da dobradiça'}
              </Button>
            ) : null}
            {sideFlip ? (
              <Button icon={<FlipVertical2 />} onClick={() => flipSide(o.id)}>
                Abrir para o outro lado
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <Button variant="danger" icon={<Trash2 />} block onClick={() => commands.deleteSelection()}>
        Excluir
      </Button>
      <DoorSwingHost />
    </div>
  );
}

/** Inspector of the selected doors, windows and gates. */
export function OpeningInspector(): ReactElement | null {
  const openings = useSelectedOpenings();
  if (openings.length === 0) return null;
  if (openings.length === 1) return <SingleOpening key={openings[0]!.id} o={openings[0]!} />;
  return (
    <div className="opening-inspector">
      <p className="opening-identity-name">{openings.length} aberturas selecionadas</p>
      <p className="opening-note">
        Para mudar medidas ou o lado de abrir, selecione uma de cada vez.
      </p>
      <Button variant="danger" icon={<Trash2 />} block onClick={() => commands.deleteSelection()}>
        Excluir {openings.length} aberturas
      </Button>
    </div>
  );
}
