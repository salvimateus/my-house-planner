import { ArrowLeft, ArrowRight, LoaderCircle, RotateCw } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useId, useState } from 'react';
import type { Mm, NewProjectInput, Side } from '../../model/types.ts';
import { formatArea, formatLength, toMm } from '../../model/units.ts';
import { newProject } from '../../persistence/repository.ts';
import { uiStore } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { Switch } from '../controls/Switch.tsx';
import { toast } from '../controls/Toast.tsx';
import { errorMessage } from '../Menu.tsx';
import './LotWizard.css';

const FRONT_MIN = toMm(3);
const FRONT_MAX = toMm(100);
const DEPTH_MIN = toMm(3);
const DEPTH_MAX = toMm(200);
const NAME_MAX = 80;

const PRESETS: readonly [number, number][] = [
  [5, 25],
  [8, 25],
  [10, 25],
  [10, 30],
  [12, 30],
  [15, 30],
  [20, 40],
];

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const SIDE_WHERE: Record<Side, string> = {
  top: 'em cima',
  right: 'à direita',
  bottom: 'embaixo',
  left: 'à esquerda',
};
const SIDE_SHORT: Record<Side, string> = {
  top: 'Em cima',
  right: 'À direita',
  bottom: 'Embaixo',
  left: 'À esquerda',
};

const turnCw = (s: Side): Side => SIDES[(SIDES.indexOf(s) + 1) % 4]!;
const adjacent = (s: Side): [Side, Side] => {
  const i = SIDES.indexOf(s);
  return [SIDES[(i + 3) % 4]!, SIDES[(i + 1) % 4]!];
};
const isHorizontal = (s: Side) => s === 'top' || s === 'bottom';

/** Lot extents in world axes: "frente" always runs along the street side. */
function lotSize(front: Mm, depth: Mm, side: Side): { width: Mm; depth: Mm } {
  return isHorizontal(side) ? { width: front, depth } : { width: depth, depth: front };
}

const BOX = 240;
const FIT = 150;
const STREET = 24;
const WALK = 9;

type Band = { x: number; y: number; w: number; h: number };

function bandFor(side: Side, lot: Band, offset: number, thick: number): Band {
  switch (side) {
    case 'top':
      return { x: 0, y: lot.y - offset - thick, w: BOX, h: thick };
    case 'bottom':
      return { x: 0, y: lot.y + lot.h + offset, w: BOX, h: thick };
    case 'left':
      return { x: lot.x - offset - thick, y: 0, w: thick, h: BOX };
    case 'right':
      return { x: lot.x + lot.w + offset, y: 0, w: thick, h: BOX };
  }
}

const boxStyle = (b: Band): CSSProperties => ({
  transform: `translate(${b.x}px, ${b.y}px) scale(${Math.max(b.w, 0.001)}, ${Math.max(b.h, 0.001)})`,
});

function labelPos(side: Side, b: Band): { x: number; y: number; rot: number } {
  if (side === 'top' || side === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h / 2, rot: 0 };
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, rot: -90 };
}

function LotPreview({
  front,
  depth,
  side,
  cornerSide,
  walled,
}: {
  front: Mm;
  depth: Mm;
  side: Side;
  cornerSide: Side | null;
  walled: boolean;
}): ReactElement {
  const size = lotSize(front, depth, side);
  const k = FIT / Math.max(size.width, size.depth);
  const w = size.width * k;
  const h = size.depth * k;
  const lot: Band = { x: (BOX - w) / 2, y: (BOX - h) / 2, w, h };
  const walk = bandFor(side, lot, 0, WALK);
  const street = bandFor(side, lot, WALK, STREET);
  const cornerWalk = cornerSide ? bandFor(cornerSide, lot, 0, WALK) : null;
  const cornerStreet = cornerSide ? bandFor(cornerSide, lot, WALK, STREET) : null;
  const streetLabel = labelPos(side, street);
  const frontLabel = labelPos(side, bandFor(side, lot, -16, 0));
  const depthSide = adjacent(side)[0];
  const depthLabel = labelPos(depthSide, bandFor(depthSide, lot, -16, 0));

  return (
    <svg
      className="lot-preview"
      viewBox={`0 0 ${BOX} ${BOX}`}
      role="img"
      aria-label={`Terreno de ${formatLength(front)} de frente por ${formatLength(depth)} de fundo, com a rua ${SIDE_WHERE[side]}${cornerSide ? ` e também ${SIDE_WHERE[cornerSide]}` : ''}.`}
    >
      <rect className="lp-world" width={BOX} height={BOX} rx="20" />
      {cornerStreet && cornerWalk ? (
        <g className="lp-corner">
          <rect
            className="lp-shape lp-street"
            width="1"
            height="1"
            style={boxStyle(cornerStreet)}
          />
          <rect className="lp-shape lp-walk" width="1" height="1" style={boxStyle(cornerWalk)} />
        </g>
      ) : null}
      <rect className="lp-shape lp-street" width="1" height="1" style={boxStyle(street)} />
      <rect className="lp-shape lp-walk" width="1" height="1" style={boxStyle(walk)} />
      <rect
        className="lp-shape lp-lot"
        data-walled={walled ? 'true' : undefined}
        width="1"
        height="1"
        style={boxStyle(lot)}
        vectorEffect="non-scaling-stroke"
      />
      <text
        className="lp-text lp-street-text"
        style={{
          transform: `translate(${streetLabel.x}px, ${streetLabel.y}px) rotate(${streetLabel.rot}deg)`,
        }}
      >
        RUA
      </text>
      <text
        className="lp-text lp-dim"
        style={{
          transform: `translate(${frontLabel.x}px, ${frontLabel.y}px) rotate(${frontLabel.rot}deg)`,
        }}
      >
        {formatLength(front)}
      </text>
      <text
        className="lp-text lp-dim"
        style={{
          transform: `translate(${depthLabel.x}px, ${depthLabel.y}px) rotate(${depthLabel.rot}deg)`,
        }}
      >
        {formatLength(depth)}
      </text>
    </svg>
  );
}

export function LotWizard(): ReactElement {
  const [step, setStep] = useState<1 | 2>(1);
  const [front, setFront] = useState<Mm>(toMm(10));
  const [depth, setDepth] = useState<Mm>(toMm(25));
  const [frontDraft, setFrontDraft] = useState<Mm | null>(toMm(10));
  const [depthDraft, setDepthDraft] = useState<Mm | null>(toMm(25));
  const [side, setSide] = useState<Side>('bottom');
  const [corner, setCorner] = useState(false);
  const [cornerSide, setCornerSide] = useState<Side>('left');
  const [walled, setWalled] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const titleId = useId();

  const sizeValid = frontDraft !== null && depthDraft !== null;
  const shownFront = frontDraft ?? front;
  const shownDepth = depthDraft ?? depth;

  const applyPreset = (f: number, d: number) => {
    setFront(toMm(f));
    setDepth(toMm(d));
    setFrontDraft(toMm(f));
    setDepthDraft(toMm(d));
  };

  const rotate = () => {
    setSide(turnCw(side));
    setCornerSide(turnCw(cornerSide));
  };

  const toggleCorner = (on: boolean) => {
    setCorner(on);
    if (on && !adjacent(side).includes(cornerSide)) setCornerSide(adjacent(side)[0]);
  };

  const back = () => {
    if (step === 2) setStep(1);
    else uiStore.getState().setScreen('start');
  };

  const create = async () => {
    if (!sizeValid || busy) return;
    const size = lotSize(frontDraft, depthDraft, side);
    const input: NewProjectInput = {
      name: name.trim().slice(0, NAME_MAX),
      width: size.width,
      depth: size.depth,
      frontSide: side,
      cornerSide: corner ? cornerSide : null,
      walled,
    };
    setBusy(true);
    try {
      await newProject(input);
    } catch (err) {
      toast(errorMessage(err, 'Não foi possível criar a planta. Tente de novo.'), {
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const [adjA, adjB] = adjacent(side);

  return (
    <main className="wizard" aria-labelledby={titleId}>
      <header className="wizard-top">
        <Button variant="ghost" icon={<ArrowLeft />} onClick={back}>
          Voltar
        </Button>
        <p className="wizard-steps">
          <span className="sr-only">Passo {step} de 2</span>
          <span className="wizard-dot" data-on="true" aria-hidden="true" />
          <span
            className="wizard-dot"
            data-on={step === 2 ? 'true' : undefined}
            aria-hidden="true"
          />
        </p>
      </header>

      <div className="wizard-body">
        <div className="wizard-preview">
          <LotPreview
            front={shownFront}
            depth={shownDepth}
            side={side}
            cornerSide={corner ? cornerSide : null}
            walled={walled}
          />
          <p className="wizard-area num" aria-live="polite">
            Área do terreno: <strong>{formatArea(shownFront * shownDepth)}</strong>
          </p>
        </div>

        {step === 1 ? (
          <section key="s1" className="wizard-step">
            <h1 id={titleId} className="wizard-title">
              Qual o tamanho do terreno?
            </h1>
            <p className="wizard-lead">
              Use as medidas da escritura ou do IPTU. Dá para mudar depois.
            </p>
            <div className="wizard-fields">
              <MeasureInput
                label="Frente"
                value={front}
                min={FRONT_MIN}
                max={FRONT_MAX}
                step={500}
                hint="Lado da rua"
                onDraft={setFrontDraft}
                onCommit={setFront}
              />
              <MeasureInput
                label="Fundo"
                value={depth}
                min={DEPTH_MIN}
                max={DEPTH_MAX}
                step={500}
                hint="Da rua até o fundo"
                onDraft={setDepthDraft}
                onCommit={setDepth}
              />
            </div>
            <div className="wizard-presets">
              <p className="wizard-label">Tamanhos comuns</p>
              <ul className="wizard-chips">
                {PRESETS.map(([f, d]) => (
                  <li key={`${f}x${d}`}>
                    <Chip
                      selected={frontDraft === toMm(f) && depthDraft === toMm(d)}
                      onClick={() => applyPreset(f, d)}
                      aria-label={`${f} por ${d} metros`}
                    >
                      {f} × {d}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section key="s2" className="wizard-step">
            <h1 id={titleId} className="wizard-title">
              Onde fica a rua?
            </h1>
            <p className="wizard-lead">
              Gire até a rua ficar do lado certo. A rua está <strong>{SIDE_WHERE[side]}</strong>.
            </p>
            <Button variant="secondary" icon={<RotateCw />} onClick={rotate} block>
              Girar a rua
            </Button>
            <div className="wizard-switches">
              <Switch
                label="Terreno de esquina"
                description="Tem rua em dois lados."
                checked={corner}
                onChange={toggleCorner}
              />
              {corner ? (
                <Segmented<Side>
                  label="Lado da segunda rua"
                  showLabel
                  options={[
                    { value: adjA, label: SIDE_SHORT[adjA] },
                    { value: adjB, label: SIDE_SHORT[adjB] },
                  ]}
                  value={cornerSide}
                  onChange={setCornerSide}
                />
              ) : null}
              <Switch
                label="Terreno murado"
                description="Muro de 15 cm nas divisas com os vizinhos."
                checked={walled}
                onChange={setWalled}
              />
            </div>
            <div className="wizard-name">
              <label htmlFor={nameId} className="wizard-label">
                Nome da planta
              </label>
              <input
                id={nameId}
                className="wizard-input"
                value={name}
                placeholder="Minha casa"
                maxLength={NAME_MAX}
                enterKeyHint="done"
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
                }}
              />
            </div>
          </section>
        )}
      </div>

      <footer className="wizard-foot">
        {step === 1 ? (
          <Button
            variant="primary"
            size="lg"
            block
            icon={<ArrowRight />}
            disabled={!sizeValid}
            onClick={() => {
              if (frontDraft !== null) setFront(frontDraft);
              if (depthDraft !== null) setDepth(depthDraft);
              setStep(2);
            }}
          >
            Continuar
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!sizeValid || busy}
            icon={busy ? <LoaderCircle className="spin" /> : undefined}
            onClick={() => void create()}
          >
            Desenhar terreno
          </Button>
        )}
      </footer>
    </main>
  );
}
