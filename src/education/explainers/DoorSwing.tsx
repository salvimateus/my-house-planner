import { ArrowDownToLine, BrickWall, Footprints, ShowerHead } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useId } from 'react';
import { createStore, useStore } from 'zustand';
import { tuning } from '../../juice/tuning.ts';
import { SCENE_THEME } from '../../render/theme.ts';
import { Button } from '../../ui/controls/Button.tsx';
import { Dialog } from '../../ui/controls/Dialog.tsx';
import './DoorSwing.css';

const explainerStore = createStore<{ open: boolean; hosts: string[] }>()(() => ({
  open: false,
  hosts: [],
}));

/** Opens the door swing explainer in the first mounted host. */
export function openDoorSwing(): void {
  explainerStore.setState({ open: true });
}

const close = () => explainerStore.setState({ open: false });

const TIPS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ArrowDownToLine />,
    title: 'Abre para dentro',
    text: 'A porta do cômodo abre para dentro dele, assim não bate em quem passa no corredor.',
  },
  {
    icon: <BrickWall />,
    title: 'Dobradiça perto da parede',
    text: 'Aberta, a folha encosta na parede ao lado e não fica no meio da passagem.',
  },
  {
    icon: <Footprints />,
    title: 'Arco livre',
    text: 'O arco tracejado é o caminho da folha. Não coloque móvel nesse espaço.',
  },
  {
    icon: <ShowerHead />,
    title: 'Banheiro pequeno',
    text: 'Se a porta bate no vaso ou na pia, use porta de correr ou abra para fora.',
  },
];

/** Animated plan: a wall corner, a door whose leaf swings into the room and its dashed arc. */
function SwingDrawing(): ReactElement {
  const t = SCENE_THEME;
  // Plan in px: wall along the top, corner wall on the left, hinge next to the corner.
  const hinge = { x: 48, y: 40 };
  const r = 84;
  return (
    <svg
      className="door-swing-art"
      viewBox="0 0 240 150"
      role="img"
      aria-label="Porta abrindo para dentro do quarto, com a dobradiça perto da parede"
      style={{ ['--swing-ms' as string]: `${tuning.doorSwing.ms * 4}ms` }}
    >
      <rect x={0} y={0} width={240} height={150} rx={12} fill="#F5EFE4" />
      <path d="M0 28H40V40H0Z M140 28H240V40H140Z M28 28H40V150H28Z" fill={t.wall} />
      <rect x={40} y={28} width={6} height={12} fill="#FFFFFF" stroke={t.door} strokeWidth={0.8} />
      <rect x={134} y={28} width={6} height={12} fill="#FFFFFF" stroke={t.door} strokeWidth={0.8} />
      <g className="door-swing-arc">
        <path
          d={`M${hinge.x} ${hinge.y}L${hinge.x} ${hinge.y + r}A${r} ${r} 0 0 0 ${hinge.x + r} ${hinge.y}Z`}
          fill={t.swingArc}
          fillOpacity={0.12}
        />
        <path
          d={`M${hinge.x} ${hinge.y + r}A${r} ${r} 0 0 0 ${hinge.x + r} ${hinge.y}`}
          fill="none"
          stroke={t.swingArc}
          strokeWidth={1.4}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
      </g>
      <g className="door-swing-leaf" style={{ transformOrigin: `${hinge.x}px ${hinge.y}px` }}>
        <rect
          x={hinge.x - 5}
          y={hinge.y}
          width={5}
          height={r}
          rx={1.5}
          fill="#FFFFFF"
          stroke={t.door}
          strokeWidth={1.6}
        />
      </g>
      <circle cx={hinge.x} cy={hinge.y} r={3} fill={t.door} />
      <text x={150} y={110} textAnchor="middle" className="door-swing-room" fill={t.labelSub}>
        Quarto
      </text>
      <text x={190} y={20} textAnchor="middle" className="door-swing-out" fill={t.openingLabel}>
        Corredor
      </text>
    </svg>
  );
}

/**
 * Explainer dialog about the swing of a door, opened from the first door caption or from the
 * opening inspector. Mount one host per panel; only the first mounted one renders.
 */
export function DoorSwingHost(): ReactElement | null {
  const id = useId();
  const open = useStore(explainerStore, (s) => s.open);
  const first = useStore(explainerStore, (s) => s.hosts[0] === id);

  useEffect(() => {
    explainerStore.setState((s) => ({ hosts: [...s.hosts, id] }));
    return () => explainerStore.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id) }));
  }, [id]);

  if (!first) return null;
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Para que lado a porta abre?"
      description="O arco mostra o espaço que a folha ocupa ao abrir."
      size="sm"
      footer={
        <Button variant="primary" onClick={close}>
          Entendi
        </Button>
      }
    >
      <div className="door-swing">
        <SwingDrawing />
        <ul className="door-swing-tips">
          {TIPS.map((tip) => (
            <li key={tip.title} className="door-swing-tip">
              <span className="door-swing-tip-icon" aria-hidden="true">
                {tip.icon}
              </span>
              <span className="door-swing-tip-text">
                <strong>{tip.title}.</strong> {tip.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="door-swing-note">
          Para trocar, selecione a porta e use os botões de virar ao lado dela.
        </p>
      </div>
    </Dialog>
  );
}
