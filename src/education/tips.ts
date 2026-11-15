import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import type { Scene } from '../geometry/types.ts';
import { on } from '../juice/events.ts';
import type { Id, ProjectDoc } from '../model/types.ts';
import { docStore } from '../store/docStore.ts';
import { sceneOf } from '../store/selectors.ts';
import { toast } from '../ui/controls/Toast.tsx';
import { markSeen, seen } from './storage.ts';

export type TipId = 'bathroom' | 'bedroom' | 'corridor' | 'sidewalk' | 'walls';

export interface Tip {
  id: TipId;
  title: string;
  text: string;
  /** The tip has a longer animated explanation. */
  explainer?: 'wall-thickness';
}

/** Rules of thumb, in soft wording: they guide, they do not judge. */
export const TIPS: Record<TipId, Tip> = {
  bathroom: {
    id: 'bathroom',
    title: 'Banheiro',
    text: 'A porta do banheiro costuma ter de 60 a 70 cm, e a janela costuma ser alta, do tipo basculante ou maxim-ar.',
  },
  bedroom: {
    id: 'bedroom',
    title: 'Quartos',
    text: 'Quartos com 8 m² ou mais costumam ficar confortáveis para a cama e o guarda-roupa.',
  },
  corridor: {
    id: 'corridor',
    title: 'Corredores',
    text: 'Um corredor de 0,90 m costuma ser confortável. Abaixo de 0,80 m ele costuma ficar apertado.',
  },
  sidewalk: {
    id: 'sidewalk',
    title: 'Calçada',
    text: 'Em São Paulo, a calçada costuma manter uma faixa livre de 1,20 m ou mais para quem passa a pé.',
  },
  walls: {
    id: 'walls',
    title: 'Paredes',
    text: 'Paredes internas costumam ter 15 cm e as externas 20 cm: bloco mais reboco dos dois lados.',
    explainer: 'wall-thickness',
  },
};

const BATH_PRESETS = new Set(['bathroom', 'powder']);
const BED_PRESETS = new Set(['bedroom', 'suite']);

/** Tips that matter for this plan, most specific first. */
export function contextTips(doc: ProjectDoc | null): Tip[] {
  if (!doc) return [];
  const rooms = doc.areas.filter((a) => a.kind === 'room');
  const out: Tip[] = [];
  if (rooms.some((a) => BATH_PRESETS.has(a.preset))) out.push(TIPS.bathroom);
  if (rooms.some((a) => BED_PRESETS.has(a.preset))) out.push(TIPS.bedroom);
  if (rooms.some((a) => a.preset === 'hall') || doc.rulers.length > 0) out.push(TIPS.corridor);
  if (rooms.length > 0) out.push(TIPS.walls);
  out.push(TIPS.sidewalk);
  return out;
}

/** Areas on either side of the wall that hosts the opening. */
function hostAreas(openingId: Id, doc: ProjectDoc, scene: Scene): Id[] {
  const o = doc.openings.find((x) => x.id === openingId);
  if (!o || !scene.openings.get(o.id)?.valid) return [];
  const ids: Id[] = [];
  for (const s of scene.walls) {
    if (s.axis !== o.axis || s.line !== o.line || o.at < s.start || o.at > s.end) continue;
    if (s.plus) ids.push(s.plus);
    if (s.minus) ids.push(s.minus);
  }
  return ids;
}

function showOnce(tip: Tip): void {
  const key = `tip:${tip.id}`;
  if (seen(key)) return;
  markSeen(key);
  toast(`${tip.title}: ${tip.text}`, { durationMs: 7000 });
}

/** One-time tips at the moment they help. Returns the clean-up. */
export function startContextTips(): () => void {
  const offs = [
    on('opening-placed', (e) => {
      const doc = docStore.getState().doc;
      const o = doc?.openings.find((x) => x.id === e.openingId);
      if (!doc || !o || OPENING_SPECS[o.type].group !== 'door') return;
      const ids = new Set(hostAreas(o.id, doc, sceneOf(doc)));
      if (doc.areas.some((a) => ids.has(a.id) && BATH_PRESETS.has(a.preset))) {
        showOnce(TIPS.bathroom);
      }
    }),
    on('ruler-created', () => showOnce(TIPS.corridor)),
  ];
  return () => {
    for (const off of offs) off();
  };
}
