import { Car, Compass, DoorOpen, RotateCw, Trees, Warehouse } from 'lucide-react';
import type { KeyboardEvent, PointerEvent, ReactElement } from 'react';
import { useRef } from 'react';
import { OPENING_SPECS } from '../../catalog/openingSpecs.ts';
import { addRamp, addTree } from '../../editor/select/frontage.ts';
import {
  cornerChoices,
  frontAndDepth,
  LOT_LIMITS,
  normalizeDeg,
  resizeLot,
  rotateFront,
  setBoundaryWall,
  setCornerSide,
  setGround,
  setNorth,
  sideRole,
} from '../../editor/select/lot.ts';
import { placeOpeningAt } from '../../editor/tools/opening.ts';
import {
  frontagePoint,
  gateSide,
  isVehicleGate,
  parkingHinge,
  sideLength,
  slidingGateSpots,
} from '../../geometry/frontage.ts';
import { feedback } from '../../juice/feedback.ts';
import type { Lot, Opening, OpeningType, Side } from '../../model/types.ts';
import { formatArea } from '../../model/units.ts';
import { docStore, useDoc } from '../../store/docStore.ts';
import { sceneOf } from '../../store/selectors.ts';
import { uiStore } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { FillPicker } from '../controls/FillPicker.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { Switch } from '../controls/Switch.tsx';
import { toast } from '../controls/Toast.tsx';
import { commands } from '../shortcuts.ts';
import './LotInspector.css';

const ROLE_LABEL = {
  front: 'Frente',
  back: 'Fundos',
  left: 'Lateral esquerda',
  right: 'Lateral direita',
} as const;

const SIDE_ORDER: Side[] = ['top', 'right', 'bottom', 'left'];
const EMPTY_OPENINGS: Opening[] = [];

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Tries a few spots along the front lot wall; the vehicle gate prefers one side, the social gate the middle. */
function addFrontGate(type: OpeningType): void {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc || ds.readOnly) return;
  const lot = doc.lot;
  const side = lot.frontSide;
  if (!lot.boundaryWalls[side]) {
    feedback.invalid();
    toast('O terreno está sem muro na frente. Ligue o muro da frente para colocar um portão.');
    return;
  }
  const len = sideLength(lot, side);
  // A point just inside the wall axis makes the gate leaves open into the lot.
  const inside = -doc.structure.boundary / 2 - 60;
  if (type === 'gate-sliding') {
    addSlidingGate(len, inside);
    return;
  }
  const spots = isVehicleGate(type) ? [0.3, 0.7, 0.5, 0.15, 0.85] : [0.5, 0.75, 0.25, 0.9, 0.1];
  for (const f of spots) {
    if (placeOpeningAt(type, frontagePoint(lot, side, Math.round(len * f), inside))) return;
  }
  feedback.invalid();
  toast('Não coube o portão no muro da frente. Libere espaço no muro ou diminua outro portão.');
}

/**
 * The sliding gate needs its own width of free wall on the side it parks, inside the lot. It goes where
 * it fits closed and parked, and its slide direction points to the free wall.
 */
function addSlidingGate(len: number, inside: number): void {
  const doc = docStore.getState().doc;
  if (!doc) return;
  const lot = doc.lot;
  const side = lot.frontSide;
  const runs = sceneOf(doc).runs;
  const spec = OPENING_SPECS['gate-sliding'];
  const widths = [spec.defaultWidth, ...spec.widths.filter((w) => w < spec.defaultWidth).reverse()];
  for (const width of widths) {
    for (const spot of slidingGateSpots(doc, runs, side, width, len * 0.3)) {
      if (!placeOpeningAt('gate-sliding', frontagePoint(lot, side, spot.at, inside))) continue;
      fitPlacedGate(width, spot.hinge);
      return;
    }
  }
  feedback.invalid();
  toast(
    'Não coube o portão eletrônico no muro da frente: ele precisa de muro livre do tamanho dele para correr. Libere espaço no muro.',
  );
}

/** Sets the width and the slide direction of the gate just placed, inside the same undo step. */
function fitPlacedGate(width: number, hinge: 'start' | 'end'): void {
  const ds = docStore.getState();
  const sel = uiStore.getState().selection;
  const doc = ds.doc;
  if (!doc || sel?.kind !== 'opening' || sel.ids.length !== 1) return;
  const id = sel.ids[0];
  const placed = doc.openings.find((o) => o.id === id);
  if (!placed) return;
  const sized = { ...placed, width, hinge };
  const fixed = { ...sized, hinge: parkingHinge(doc, sceneOf(doc).runs, sized) ?? hinge };
  if (fixed.width === placed.width && fixed.hinge === placed.hinge) return;
  docStore.setState({
    doc: { ...doc, openings: doc.openings.map((o) => (o.id === id ? fixed : o)) },
  });
}

function addFrontageItem(kind: 'ramp' | 'tree'): void {
  const id = kind === 'ramp' ? addRamp() : addTree();
  if (!id) {
    feedback.invalid();
    toast(
      kind === 'ramp'
        ? 'Não há espaço livre na calçada da frente para outra rampa.'
        : 'Não há espaço livre na calçada para outra árvore. Árvores ficam longe das rampas e dos portões.',
    );
    return;
  }
  feedback.place();
  uiStore.getState().select({ kind: kind === 'ramp' ? 'sidewalk-ramp' : 'street-tree', id });
}
const NORTH_STEP = 15;

/** Lot inspector: size, street side, corner, lot walls, north and ground. */
export function LotInspector(): ReactElement | null {
  const lot = useDoc((s) => s.doc?.lot ?? null);
  const openings = useDoc((s) => s.doc?.openings ?? EMPTY_OPENINGS);
  if (!lot) return null;
  const frontGates = openings.filter((o) => gateSide(o, lot) === lot.frontSide);
  const vehicleGates = frontGates.filter((o) => isVehicleGate(o.type)).length;
  const socialGates = frontGates.length - vehicleGates;
  const { front, depth } = frontAndDepth(lot);

  const commitSize = (f: number, d: number) => {
    const before = docStore.getState().doc;
    const messages = resizeLot(f, d);
    if (messages.length) toast(messages.join(' '), { undo: true });
    if (docStore.getState().doc !== before) commands.fitView();
  };

  const roles = SIDE_ORDER.map((side) => ({ side, role: sideRole(lot, side) })).sort(
    (a, b) => roleRank(a.role) - roleRank(b.role),
  );
  const [cornerLeft, cornerRight] = cornerChoices(lot);

  return (
    <div className="lot-inspector">
      <section className="lot-section" aria-labelledby="lot-size-title">
        <h3 id="lot-size-title" className="lot-section-title">
          Medidas
        </h3>
        <div className="lot-size">
          <MeasureInput
            label="Frente"
            value={front}
            min={LOT_LIMITS.front.min}
            max={LOT_LIMITS.front.max}
            onCommit={(v) => commitSize(v, depth)}
          />
          <MeasureInput
            label="Fundo"
            value={depth}
            min={LOT_LIMITS.depth.min}
            max={LOT_LIMITS.depth.max}
            onCommit={(v) => commitSize(front, v)}
          />
        </div>
        <p className="lot-note">
          Área do terreno: <strong className="num">{formatArea(lot.width * lot.depth)}</strong>
        </p>
      </section>

      <section className="lot-section" aria-labelledby="lot-street-title">
        <h3 id="lot-street-title" className="lot-section-title">
          Rua
        </h3>
        <Button
          icon={<RotateCw />}
          onClick={() => {
            rotateFront();
            commands.fitView();
          }}
          block
        >
          Girar frente
        </Button>
        <Switch
          label="Terreno de esquina"
          description="Mais uma rua ao lado do terreno."
          checked={lot.cornerSide !== null}
          onChange={(on) => setCornerSide(on ? cornerLeft : null)}
        />
        {lot.cornerSide ? (
          <Segmented<Side>
            label="Lado da esquina"
            showLabel
            options={[
              { value: cornerLeft, label: 'Esquerda' },
              { value: cornerRight, label: 'Direita' },
            ]}
            value={lot.cornerSide}
            onChange={setCornerSide}
          />
        ) : null}
      </section>

      <section className="lot-section" aria-labelledby="lot-sidewalk-title">
        <h3 id="lot-sidewalk-title" className="lot-section-title">
          Calçada
        </h3>
        <p className="lot-note">
          {count(lot.frontage.trees.length, 'árvore', 'árvores')} e{' '}
          {count(lot.frontage.ramps.length, 'rampa para carro', 'rampas para carro')}. Toque numa
          árvore ou numa rampa para mudar ou arrastar.
        </p>
        <div className="lot-actions">
          <Button icon={<Car />} onClick={() => addFrontageItem('ramp')}>
            + Rampa para carro
          </Button>
          <Button icon={<Trees />} onClick={() => addFrontageItem('tree')}>
            + Árvore
          </Button>
        </div>
      </section>

      <section className="lot-section" aria-labelledby="lot-gates-title">
        <h3 id="lot-gates-title" className="lot-section-title">
          Portões no muro da frente
        </h3>
        <p className="lot-note">
          {frontGates.length === 0
            ? 'Nenhum portão ainda. O portão eletrônico ganha uma rampa na calçada.'
            : `${count(vehicleGates, 'portão eletrônico', 'portões eletrônicos')} e ${count(socialGates, 'portão social', 'portões sociais')}.`}
        </p>
        <div className="lot-actions">
          <Button icon={<Warehouse />} onClick={() => addFrontGate('gate-sliding')}>
            + Portão eletrônico
          </Button>
          <Button icon={<DoorOpen />} onClick={() => addFrontGate('gate-pedestrian')}>
            + Portão social
          </Button>
        </div>
      </section>

      <section className="lot-section" aria-labelledby="lot-walls-title">
        <h3 id="lot-walls-title" className="lot-section-title">
          Muro
        </h3>
        <div className="lot-walls">
          {roles.map(({ side, role }) => (
            <Switch
              key={side}
              label={ROLE_LABEL[role]}
              description={side === lot.cornerSide ? 'Lado da rua da esquina' : undefined}
              checked={lot.boundaryWalls[side]}
              onChange={(on) => setBoundaryWall(side, on)}
            />
          ))}
        </div>
      </section>

      <section className="lot-section" aria-labelledby="lot-north-title">
        <h3 id="lot-north-title" className="lot-section-title">
          Norte
        </h3>
        <NorthDial lot={lot} />
      </section>

      <section className="lot-section" aria-labelledby="lot-ground-title">
        <h3 id="lot-ground-title" className="lot-section-title">
          Piso do terreno
        </h3>
        <FillPicker value={lot.ground} group="outdoor" onChange={setGround} />
      </section>
    </div>
  );
}

function roleRank(role: keyof typeof ROLE_LABEL): number {
  return role === 'front' ? 0 : role === 'left' ? 1 : role === 'right' ? 2 : 3;
}

/** Drag the needle or use the arrow keys; one undo step per drag. */
function NorthDial({ lot }: { lot: Lot }): ReactElement {
  const dragging = useRef(false);
  const deg = lot.northDeg;

  const angleAt = (e: PointerEvent<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    return normalizeDeg(Math.round((a * 180) / Math.PI / NORTH_STEP) * NORTH_STEP);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const ds = docStore.getState();
    if (ds.readOnly || !ds.doc) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    ds.beginGesture('Direção do norte');
    const next = angleAt(e);
    ds.updateGesture((d) => {
      d.lot.northDeg = next;
    });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = angleAt(e);
    if (next === docStore.getState().doc?.lot.northDeg) return;
    docStore.getState().updateGesture((d) => {
      d.lot.northDeg = next;
    });
  };
  const onPointerEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    docStore.getState().endGesture();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? NORTH_STEP
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -NORTH_STEP
          : 0;
    if (!step) return;
    e.preventDefault();
    setNorth(deg + step);
  };

  return (
    <div className="lot-north">
      <div
        className="lot-north-dial"
        role="slider"
        tabIndex={0}
        aria-label="Direção do norte"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={deg}
        aria-valuetext={`${deg}°`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="-32 -32 64 64" aria-hidden="true" focusable="false">
          <circle className="lot-north-ring" r={29} />
          <g transform={`rotate(${deg})`}>
            <path className="lot-north-needle" d="M0 -17 L5 2 L0 -2 L-5 2 Z" />
            <path className="lot-north-tail" d="M0 20 L4 4 L0 7 L-4 4 Z" />
            <text className="lot-north-letter" x={0} y={-20} textAnchor="middle">
              N
            </text>
          </g>
        </svg>
      </div>
      <div className="lot-north-info">
        <span className="lot-north-value num">
          <Compass aria-hidden="true" />
          {deg}°
        </span>
        <span className="lot-note">Arraste a agulha para onde fica o norte.</span>
      </div>
    </div>
  );
}
