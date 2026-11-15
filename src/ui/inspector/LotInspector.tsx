import { Compass, RotateCw } from 'lucide-react';
import type { KeyboardEvent, PointerEvent, ReactElement } from 'react';
import { useRef } from 'react';
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
import type { Lot, Side } from '../../model/types.ts';
import { formatArea } from '../../model/units.ts';
import { docStore, useDoc } from '../../store/docStore.ts';
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
const NORTH_STEP = 15;

/** Lot inspector: size, street side, corner, lot walls, north and ground. */
export function LotInspector(): ReactElement | null {
  const lot = useDoc((s) => s.doc?.lot ?? null);
  if (!lot) return null;
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
