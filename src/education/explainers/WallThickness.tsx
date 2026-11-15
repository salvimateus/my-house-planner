import { BrickWall, Fence, Ruler, Scaling } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { createStore, useStore } from 'zustand';
import { DEFAULT_STRUCTURE } from '../../model/defaults.ts';
import type { Mm, Structure } from '../../model/types.ts';
import { useDoc } from '../../store/docStore.ts';
import { Button } from '../../ui/controls/Button.tsx';
import { Dialog } from '../../ui/controls/Dialog.tsx';
import { Segmented } from '../../ui/controls/Segmented.tsx';
import './WallThickness.css';

const explainerStore = createStore<{ open: boolean }>()(() => ({ open: false }));

/** Opens the wall thickness explainer (net area lesson, health tips). */
export function openWallThickness(): void {
  explainerStore.setState({ open: true });
}

const close = () => explainerStore.setState({ open: false });

type Kind = 'internal' | 'external';

const PLASTER: Mm = 25;
const cm = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const toCm = (mm: Mm) => `${cm.format(mm / 10)} cm`;

/** Masonry walls use standard ceramic blocks; other presets show what is left after plaster. */
function blockOf(kind: Kind, structure: Structure): Mm {
  if (structure.preset === 'masonry') return kind === 'internal' ? 90 : 140;
  return Math.max(10, structure[kind] - 2 * PLASTER);
}

const TIPS: { icon: ReactNode; text: ReactNode }[] = [
  {
    icon: <Ruler />,
    text: (
      <>
        <strong>A linha que você desenha é o meio da parede.</strong> Metade da espessura fica de
        cada lado.
      </>
    ),
  },
  {
    icon: <Scaling />,
    text: (
      <>
        <strong>Por isso a área útil é menor que a desenhada:</strong> as paredes ocupam um pouco do
        cômodo em toda a volta.
      </>
    ),
  },
  {
    icon: <BrickWall />,
    text: (
      <>
        <strong>Paredes internas costumam ter 15 cm</strong> e as externas 20 cm, que protegem
        melhor do sol, do frio e da chuva.
      </>
    ),
  },
  {
    icon: <Fence />,
    text: (
      <>
        <strong>O muro de divisa costuma ter 15 cm</strong> e fica todo dentro do seu terreno.
      </>
    ),
  },
];

/** Animated wall section: the drawn line, the block growing from it, then plaster on both faces. */
function Section({ kind, structure }: { kind: Kind; structure: Structure }): ReactElement {
  const thickness = structure[kind];
  const block = blockOf(kind, structure);
  // 0,4 px per mm keeps a 20 cm wall at 80 px inside a 300 px drawing.
  const k = 0.4;
  const mid = 150;
  const wall = thickness * k;
  const blockW = Math.min(wall, block * k);
  const plasterW = Math.max(0, (wall - blockW) / 2);
  const top = 34;
  const bottom = 128;
  const x0 = mid - wall / 2;
  const x1 = mid + wall / 2;
  const half = toCm(thickness / 2);
  const outside = kind === 'external';
  return (
    <svg
      className="wall-x-art"
      viewBox="0 0 300 176"
      role="img"
      aria-label={`Corte de uma parede de ${toCm(thickness)}: bloco de ${toCm(block)} e reboco dos dois lados, com metade da parede para cada lado da linha desenhada`}
    >
      <rect x={0} y={0} width={300} height={176} rx={12} fill="#F5EFE4" />
      <rect x={10} y={top} width={x0 - 10} height={bottom - top} rx={4} fill="#F4E8D6" />
      <rect
        x={x1}
        y={top}
        width={290 - x1}
        height={bottom - top}
        rx={4}
        fill={outside ? '#DDE9D3' : '#E5EDF7'}
      />
      <text x={(10 + x0) / 2} y={84} textAnchor="middle" className="wall-x-room">
        Sala
      </text>
      <text x={(x1 + 290) / 2} y={84} textAnchor="middle" className="wall-x-room">
        {outside ? 'Lado de fora' : 'Quarto'}
      </text>

      <g className="wall-x-plaster wall-x-plaster-l">
        <rect x={x0} y={top} width={plasterW} height={bottom - top} fill="#D9D3C7" />
      </g>
      <g className="wall-x-plaster wall-x-plaster-r">
        <rect x={x1 - plasterW} y={top} width={plasterW} height={bottom - top} fill="#D9D3C7" />
      </g>
      <g className="wall-x-block">
        <rect x={mid - blockW / 2} y={top} width={blockW} height={bottom - top} fill="#C2704C" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={mid - blockW / 2 + blockW * 0.18}
            y={top + 8 + i * 30}
            width={blockW * 0.64}
            height={18}
            rx={2}
            fill="#A65A3B"
          />
        ))}
      </g>

      <g className="wall-x-axis">
        <line
          x1={mid}
          y1={22}
          x2={mid}
          y2={140}
          stroke="#E5484D"
          strokeWidth={1.6}
          strokeDasharray="5 4"
        />
        <text x={mid} y={16} textAnchor="middle" className="wall-x-axis-label">
          linha que você desenhou
        </text>
      </g>

      <g className="wall-x-halves">
        <path d={`M${x0} 150V158H${mid}V150`} fill="none" stroke="#4B5260" strokeWidth={1.2} />
        <path d={`M${mid} 150V158H${x1}V150`} fill="none" stroke="#4B5260" strokeWidth={1.2} />
        <text x={x0 - 4} y={170} textAnchor="end" className="wall-x-dim">
          {half} para cá
        </text>
        <text x={x1 + 4} y={170} textAnchor="start" className="wall-x-dim">
          {half} para lá
        </text>
      </g>

      <g className="wall-x-labels">
        <text x={x0 - 6} y={top + 14} textAnchor="end" className="wall-x-note">
          reboco {toCm(PLASTER)}
        </text>
        <text x={x1 + 6} y={bottom - 6} textAnchor="start" className="wall-x-note">
          bloco {toCm(block)}
        </text>
      </g>
    </svg>
  );
}

/** Explainer dialog about wall thickness and why the net area is smaller. Mount one host. */
export function WallThicknessHost(): ReactElement {
  const open = useStore(explainerStore, (s) => s.open);
  const structure = useDoc((s) => s.doc?.structure ?? DEFAULT_STRUCTURE);
  const [kind, setKind] = useState<Kind>('internal');
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Por que a área útil é menor?"
      description="As paredes têm espessura, e metade dela fica dentro de cada cômodo."
      size="sm"
      footer={
        <Button variant="primary" onClick={close}>
          Entendi
        </Button>
      }
    >
      <div className="wall-x">
        <Segmented<Kind>
          label="Tipo de parede"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'internal', label: `Interna ${toCm(structure.internal)}` },
            { value: 'external', label: `Externa ${toCm(structure.external)}` },
          ]}
        />
        {open ? <Section key={kind} kind={kind} structure={structure} /> : null}
        <ul className="wall-x-tips">
          {TIPS.map((tip, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i} className="wall-x-tip">
              <span className="wall-x-tip-icon" aria-hidden="true">
                {tip.icon}
              </span>
              <span className="wall-x-tip-text">{tip.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
