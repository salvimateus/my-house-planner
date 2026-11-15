import type { Rect } from '../geometry/types.ts';
import type { Vec } from '../model/types.ts';
import { camera } from '../store/cameraStore.ts';
import { tuning } from './tuning.ts';
import { reducedMotion } from './tween.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ENTER = 'cubic-bezier(0, 0, 0.2, 1)';
const STATE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Circles per burst, the ring included. */
const BURST_LIMIT = 10;

export interface EffectsHost {
  /** World mm, follows the live camera. */
  world: SVGGElement;
  /** Canvas screen px. */
  screen: SVGGElement;
}

let host: EffectsHost | null = null;
let live = 0;

/** The canvas effects layer registers itself here while it is mounted. */
export function setEffectsHost(next: EffectsHost | null): void {
  host = next;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Adds `count` live nodes under the cap; they go away when every animation ends. */
function mount(parent: SVGGElement, node: SVGElement, anims: Animation[], count = 1): void {
  live += count;
  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    live -= count;
    node.remove();
  };
  void Promise.all(anims.map((a) => a.finished)).then(remove, remove);
  if (!parent.contains(node)) parent.append(node);
}

const room = (n: number) => host !== null && live + n <= tuning.effects.maxNodes;

/** Delete poof: a ring of small dots that fly out and fade at a world point. */
export function burst(world: Vec): void {
  if (reducedMotion() || !host) return;
  const n = Math.min(BURST_LIMIT - 1, Math.max(0, Math.round(tuning.deleteBurst.particles)));
  if (n === 0 || !room(n + 1)) return;
  const p = camera.worldToScreen(world);
  const { vw, vh } = camera.get();
  if (p.x < -40 || p.y < -40 || p.x > vw + 40 || p.y > vh + 40) return;
  const { radiusPx, ms } = tuning.deleteBurst;
  const group = el('g', { class: 'fx-burst', transform: `translate(${p.x} ${p.y})` });
  host.screen.append(group);
  const anims: Animation[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = radiusPx * (0.7 + Math.random() * 0.5);
    const dot = el('circle', {
      r: 2.5 + Math.random() * 2,
      class: i % 3 === 0 ? 'fx-burst-dot fx-burst-dot-alt' : 'fx-burst-dot',
    });
    group.append(dot);
    anims.push(
      dot.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2)`,
            opacity: 0,
          },
        ],
        { duration: ms * (0.85 + Math.random() * 0.3), easing: ENTER, fill: 'forwards' },
      ),
    );
  }
  const ring = el('circle', { r: radiusPx * 0.55, class: 'fx-burst-ring' });
  group.append(ring);
  anims.push(
    ring.animate(
      [
        { transform: 'scale(0.3)', opacity: 0.7 },
        { transform: 'scale(1.25)', opacity: 0 },
      ],
      { duration: ms, easing: ENTER, fill: 'forwards' },
    ),
  );
  mount(host.screen, group, anims, n + 1);
}

const shaking = new WeakMap<Element, Animation>();

/** "No" shake: a short horizontal wobble. Under reduced motion the element simply stays put. */
export function shake(target: Element | null): void {
  if (!target || reducedMotion()) return;
  shaking.get(target)?.cancel();
  const px = tuning.shake.px;
  const a = target.animate(
    [
      { translate: '0 0' },
      { translate: `${-px}px 0` },
      { translate: `${px * 0.8}px 0` },
      { translate: `${-px * 0.5}px 0` },
      { translate: `${px * 0.25}px 0` },
      { translate: '0 0' },
    ],
    { duration: tuning.shake.ms, easing: STATE },
  );
  shaking.set(target, a);
}

/** Scale pop around the element center. */
export function pop(target: Element | null): void {
  if (!target || reducedMotion()) return;
  if (target instanceof SVGElement) {
    target.style.transformBox = 'fill-box';
    target.style.transformOrigin = 'center';
  }
  target.animate([{ scale: '1' }, { scale: String(tuning.effects.popScale) }, { scale: '1' }], {
    duration: tuning.effects.popMs,
    easing: STATE,
  });
}

/**
 * Highlight ring around a world rect, for "look here". It pulses twice; under reduced motion it
 * shows still for the same time and then goes away.
 */
export function pulseRect(rect: Rect): void {
  if (!host || !room(1)) return;
  const pad = 10 * camera.mmPerPx();
  const node = el('rect', {
    class: 'fx-pulse',
    x: rect.x0 - pad,
    y: rect.y0 - pad,
    width: rect.x1 - rect.x0 + 2 * pad,
    height: rect.y1 - rect.y0 + 2 * pad,
    rx: 8 * camera.mmPerPx(),
    'vector-effect': 'non-scaling-stroke',
  });
  host.world.append(node);
  const ms = tuning.effects.pulseMs;
  if (reducedMotion()) {
    const still = node.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms * 2 });
    mount(host.world, node, [still]);
    return;
  }
  node.style.transformBox = 'fill-box';
  node.style.transformOrigin = 'center';
  const a = node.animate(
    [
      { transform: 'scale(1.12)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1.04)', opacity: 0 },
    ],
    { duration: ms, iterations: 2, easing: STATE, fill: 'forwards' },
  );
  mount(host.world, node, [a]);
}
