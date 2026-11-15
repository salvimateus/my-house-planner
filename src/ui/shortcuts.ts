import { castDraft } from 'immer';
import { nanoid } from 'nanoid';
import { copyArea, duplicateArea, hasAreaClipboard, pasteArea } from '../editor/select/area.ts';
import { deleteFrontageItem } from '../editor/select/frontage.ts';
import { withFixedSize } from '../editor/select/item.ts';
import type { ToolId } from '../editor/tools/types.ts';
import { deleteArea } from '../geometry/areaOps.ts';
import type { Rect } from '../geometry/types.ts';
import { feedback } from '../juice/feedback.ts';
import { tuning } from '../juice/tuning.ts';
import { SNAP_STEP } from '../model/defaults.ts';
import type { Item, Lot, Mm, Vec } from '../model/types.ts';
import { camera } from '../store/cameraStore.ts';
import { docStore } from '../store/docStore.ts';
import { type BuildMode, uiStore } from '../store/uiStore.ts';
import { toast } from './controls/Toast.tsx';

/** Returns true when the key was consumed. */
export type KeyHandler = (e: KeyboardEvent) => boolean;

let toolKeyHandler: KeyHandler | null = null;

/** The input router registers the active tool's `onKey` here, so tools see keys first. */
export function setToolKeyHandler(fn: KeyHandler | null): void {
  toolKeyHandler = fn;
}

const NUDGE: Mm = 50;
const NUDGE_BIG: Mm = 500;
const PASTE_OFFSET: Mm = 500;

let preferredSnapStep: Mm = SNAP_STEP;
let clipboard: Item[] = [];
let pasteCount = 0;
let pasteKind: 'items' | 'area' = 'items';
let readOnlyWarned = 0;

const newId = () => nanoid(10);

function canEdit(): boolean {
  const { doc, readOnly } = docStore.getState();
  if (!doc) return false;
  if (readOnly) {
    const now = Date.now();
    if (now - readOnlyWarned > 3000) {
      readOnlyWarned = now;
      toast('Esta planta está aberta só para leitura.');
    }
    return false;
  }
  return true;
}

export function lotViewBounds(lot: Lot): Rect {
  const r: Rect = { x0: 0, y0: 0, x1: lot.width, y1: lot.depth };
  const s = lot.sidewalkWidth;
  for (const side of [lot.frontSide, lot.cornerSide]) {
    if (side === 'top') r.y0 -= s;
    else if (side === 'bottom') r.y1 += s;
    else if (side === 'left') r.x0 -= s;
    else if (side === 'right') r.x1 += s;
  }
  return r;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Floating chrome over the canvas: status chip, canvas controls and the open bottom sheet. */
const CHROME_SELECTORS = ['.status-chip', '.canvas-controls', '.sheet-scroller:not([data-hidden])'];
const CHROME_GAP = 8;

/** Chrome boxes in canvas px. The bottom sheet counts only with its peek height. */
function chromeBoxes(): Box[] {
  if (typeof document === 'undefined') return [];
  const canvas = document.querySelector('.canvas');
  if (!canvas) return [];
  const c = canvas.getBoundingClientRect();
  const out: Box[] = [];
  for (const sel of CHROME_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    let r = el.getBoundingClientRect();
    if (sel.startsWith('.sheet')) {
      const peek = Number.parseFloat(getComputedStyle(el).getPropertyValue('--sheet-peek')) || 0;
      if (peek <= 0) continue;
      r = new DOMRect(c.left, c.bottom - peek, c.width, peek);
    }
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({
      x0: r.left - c.left,
      y0: r.top - c.top,
      x1: r.right - c.left,
      y1: r.bottom - c.top,
    });
  }
  return out;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * The rect to pass to `camera.fit(rect, 0)` so `b` fits with the padding and stays clear of the
 * floating chrome. A chrome box adds an inset on its nearest side only when it would cover `b`.
 */
export function fitClearOfChrome(b: Rect): Rect {
  const { vw, vh } = camera.get();
  const pad = tuning.camera.fitPaddingPx;
  const ins: Record<'t' | 'r' | 'b' | 'l', number> = { t: pad, r: pad, b: pad, l: pad };
  const boxes = chromeBoxes();
  const w = Math.max(1, b.x1 - b.x0);
  const h = Math.max(1, b.y1 - b.y0);
  let view = { zoom: 1, cx: 0, cy: 0 };
  for (let pass = 0; pass < 4; pass++) {
    const aw = Math.max(1, vw - ins.l - ins.r);
    const ah = Math.max(1, vh - ins.t - ins.b);
    const zoom = Math.min(
      tuning.camera.maxZoom,
      Math.max(tuning.camera.minZoom, Math.min(aw / w, ah / h)),
    );
    view = {
      zoom,
      cx: (b.x0 + b.x1) / 2 - (ins.l - ins.r) / 2 / zoom,
      cy: (b.y0 + b.y1) / 2 - (ins.t - ins.b) / 2 / zoom,
    };
    const lot: Box = {
      x0: vw / 2 + (b.x0 - view.cx) * zoom,
      y0: vh / 2 + (b.y0 - view.cy) * zoom,
      x1: vw / 2 + (b.x1 - view.cx) * zoom,
      y1: vh / 2 + (b.y1 - view.cy) * zoom,
    };
    let grew = false;
    for (const e of boxes) {
      if (!overlaps(e, lot)) continue;
      const vertical =
        e.y0 + e.y1 < vh
          ? { side: 't' as const, need: e.y1 + CHROME_GAP }
          : { side: 'b' as const, need: vh - e.y0 + CHROME_GAP };
      const horizontal =
        e.x0 + e.x1 < vw
          ? { side: 'l' as const, need: e.x1 + CHROME_GAP }
          : { side: 'r' as const, need: vw - e.x0 + CHROME_GAP };
      const pick = vertical.need <= horizontal.need ? vertical : horizontal;
      if (pick.need > ins[pick.side]) {
        ins[pick.side] = pick.need;
        grew = true;
      }
    }
    if (!grew) break;
  }
  const hw = vw / 2 / view.zoom;
  const hh = vh / 2 / view.zoom;
  return { x0: view.cx - hw, y0: view.cy - hh, x1: view.cx + hw, y1: view.cy + hh };
}

/** Fits the lot, its sidewalks and streets, clear of the floating chrome. */
export function fitLotView(lot: Lot, animate = true): void {
  camera.fit(fitClearOfChrome(lotViewBounds(lot)), 0, animate);
}

function shapeCenter(points: Vec[] | undefined): Vec {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2) };
}

const BUILD_SHORTCUTS: Record<string, BuildMode> = { r: 'room', a: 'outdoor', p: 'split' };
const TOOL_SHORTCUTS: Record<string, ToolId> = {
  v: 'select',
  o: 'opening',
  f: 'item',
  m: 'ruler',
  b: 'paint',
};

/** App commands shared by the toolbar, menu, canvas controls and keyboard. */
export const commands = {
  undo(): void {
    if (canEdit()) docStore.getState().undo();
  },
  redo(): void {
    if (canEdit()) docStore.getState().redo();
  },

  activateTool(tool: ToolId, buildMode?: BuildMode): void {
    const ui = uiStore.getState();
    if (tool !== 'select' && docStore.getState().readOnly) {
      canEdit();
      return;
    }
    if (buildMode) ui.setBuildMode(buildMode);
    ui.setTool(tool);
  },

  toggleGrid(): void {
    uiStore.getState().toggleLayer('grid', 'visible');
  },

  toggleSnap(): void {
    const ui = uiStore.getState();
    if (ui.snapEnabled) ui.setSnap(false);
    else ui.setSnap(true, preferredSnapStep);
  },

  setSnapStep(step: Mm): void {
    preferredSnapStep = step;
    uiStore.getState().setSnap(true, step);
  },

  fitView(animate = true): void {
    const doc = docStore.getState().doc;
    if (!doc) return;
    fitLotView(doc.lot, animate);
  },

  zoomBy(factor: number): void {
    const { vw, vh } = camera.get();
    camera.zoomAt({ x: vw / 2, y: vh / 2 }, factor);
    camera.commitLive();
  },

  selectLot(): void {
    const ui = uiStore.getState();
    ui.setTool('select');
    ui.select({ kind: 'lot' });
    ui.setSheet('inspector', 'half');
  },

  cancelOrDeselect(): void {
    const ds = docStore.getState();
    const ui = uiStore.getState();
    if (ds.gesture) {
      ds.cancelGesture();
      ui.setTransient({ guides: [], ghost: null, invalid: false, readout: null });
      return;
    }
    if (ui.selection) {
      ui.select(null);
      return;
    }
    if (ui.tool !== 'select') ui.setTool('select');
  },

  deleteSelection(): boolean {
    const sel = uiStore.getState().selection;
    const doc = docStore.getState().doc;
    if (!sel || !doc) return false;
    if (sel.kind === 'lot') return false;
    if (sel.kind === 'wall') {
      toast('Paredes saem dos cômodos. Use “Remover parede” no painel para integrar dois cômodos.');
      return true;
    }
    if (!canEdit()) return true;
    const commit = docStore.getState().commit;
    if (sel.kind === 'area') {
      const area = doc.areas.find((a) => a.id === sel.id);
      if (!area) return false;
      const res = deleteArea(doc, sel.id);
      if (!res.valid) return false;
      commit('Excluir cômodo', (d) => {
        Object.assign(d, castDraft(res.patch));
      });
      feedback.remove(shapeCenter(area.shape[0]));
      toast([`“${area.name}” excluído.`, ...res.messages].join(' '), { undo: true });
    } else if (sel.kind === 'street-tree' || sel.kind === 'sidewalk-ramp') {
      const at = deleteFrontageItem(sel);
      if (!at) return false;
      feedback.remove(at);
      toast(sel.kind === 'street-tree' ? 'Árvore excluída.' : 'Rampa excluída.', { undo: true });
    } else {
      const ids = new Set(sel.ids);
      if (ids.size === 0) return false;
      let at: Vec = { x: 0, y: 0 };
      let message = '';
      if (sel.kind === 'item') {
        const first = doc.items.find((i) => ids.has(i.id));
        if (first) at = { x: first.x, y: first.y };
        commit(ids.size > 1 ? 'Excluir objetos' : 'Excluir objeto', (d) => {
          d.items = d.items.filter((i) => !ids.has(i.id));
        });
        message = ids.size > 1 ? `${ids.size} objetos excluídos.` : 'Objeto excluído.';
      } else if (sel.kind === 'opening') {
        commit('Excluir abertura', (d) => {
          d.openings = d.openings.filter((o) => !ids.has(o.id));
        });
        const first = doc.openings.find((o) => ids.has(o.id));
        if (first)
          at = first.axis === 'h' ? { x: first.at, y: first.line } : { x: first.line, y: first.at };
        message = ids.size > 1 ? 'Aberturas excluídas.' : 'Abertura excluída.';
      } else {
        const first = doc.rulers.find((r) => ids.has(r.id));
        if (first) at = first.mode === 'free' ? first.a : first.origin;
        commit(ids.size > 1 ? 'Excluir réguas' : 'Excluir régua', (d) => {
          d.rulers = d.rulers.filter((r) => !ids.has(r.id));
        });
        message = ids.size > 1 ? 'Réguas excluídas.' : 'Régua excluída.';
      }
      feedback.remove(at);
      toast(message, { undo: true });
    }
    uiStore.getState().select(null);
    return true;
  },

  copySelection(): boolean {
    const sel = uiStore.getState().selection;
    const doc = docStore.getState().doc;
    if (sel?.kind === 'area') {
      const copied = copyArea(sel.id);
      if (copied) pasteKind = 'area';
      return copied;
    }
    if (sel?.kind !== 'item' || !doc) return false;
    const ids = new Set(sel.ids);
    clipboard = doc.items.filter((i) => ids.has(i.id));
    pasteCount = 0;
    if (clipboard.length > 0) pasteKind = 'items';
    if (clipboard.length > 0) toast(clipboard.length > 1 ? 'Objetos copiados.' : 'Objeto copiado.');
    return clipboard.length > 0;
  },

  paste(): boolean {
    if (pasteKind === 'area' && hasAreaClipboard()) return canEdit() ? pasteArea() : false;
    if (clipboard.length === 0 || !canEdit()) return false;
    pasteCount += 1;
    const offset = PASTE_OFFSET * pasteCount;
    const copies = clipboard.map((i) => ({
      ...withFixedSize(i),
      id: newId(),
      x: i.x + offset,
      y: i.y + offset,
    }));
    docStore.getState().commit('Colar', (d) => {
      d.items.push(...copies);
    });
    uiStore.getState().select({ kind: 'item', ids: copies.map((c) => c.id) });
    feedback.place();
    return true;
  },

  duplicateSelection(): boolean {
    const sel = uiStore.getState().selection;
    const doc = docStore.getState().doc;
    if (sel?.kind === 'area') return canEdit() ? duplicateArea(sel.id) : true;
    if (sel?.kind !== 'item' || !doc || !canEdit()) return false;
    const ids = new Set(sel.ids);
    const copies = doc.items
      .filter((i) => ids.has(i.id))
      .map((i) => ({
        ...withFixedSize(i),
        id: newId(),
        x: i.x + PASTE_OFFSET,
        y: i.y + PASTE_OFFSET,
      }));
    if (copies.length === 0) return false;
    docStore.getState().commit('Duplicar', (d) => {
      d.items.push(...copies);
    });
    uiStore.getState().select({ kind: 'item', ids: copies.map((c) => c.id) });
    feedback.place();
    return true;
  },

  nudge(dx: Mm, dy: Mm): boolean {
    const sel = uiStore.getState().selection;
    if (!sel || (sel.kind !== 'item' && sel.kind !== 'opening' && sel.kind !== 'ruler')) {
      return false;
    }
    if (!canEdit()) return true;
    const ids = new Set(sel.ids);
    const commit = docStore.getState().commit;
    if (sel.kind === 'item') {
      commit('Mover', (d) => {
        for (const i of d.items) {
          if (!ids.has(i.id)) continue;
          i.x += dx;
          i.y += dy;
        }
      });
    } else if (sel.kind === 'opening') {
      commit('Mover abertura', (d) => {
        for (const o of d.openings) {
          if (ids.has(o.id)) o.at += o.axis === 'h' ? dx : dy;
        }
      });
    } else {
      commit('Mover régua', (d) => {
        for (const r of d.rulers) {
          if (!ids.has(r.id)) continue;
          if (r.mode === 'free') {
            r.a = { x: r.a.x + dx, y: r.a.y + dy };
            r.b = { x: r.b.x + dx, y: r.b.y + dy };
          } else {
            r.origin = { x: r.origin.x + dx, y: r.origin.y + dy };
          }
        }
      });
    }
    return true;
  },

  rotateSelection(deg: 90 | -90): boolean {
    const sel = uiStore.getState().selection;
    if (sel?.kind !== 'item') return false;
    if (!canEdit()) return true;
    const ids = new Set(sel.ids);
    docStore.getState().commit('Girar', (d) => {
      for (const i of d.items) {
        if (ids.has(i.id)) i.rotation = (((i.rotation + deg) % 360) + 360) % 360;
      }
    });
    feedback.tick();
    return true;
  },
};

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset'].includes(t.type);
  }
  return false;
}

function blockedByOverlay(): boolean {
  return document.querySelector('dialog[open], [popover="auto"]:popover-open') !== null;
}

function handleModified(e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (k === 'z') {
    if (e.shiftKey) commands.redo();
    else commands.undo();
    return true;
  }
  if (k === 'y') {
    commands.redo();
    return true;
  }
  if (k === 'd') {
    // Always consumed, so the browser does not open its bookmark prompt.
    commands.duplicateSelection();
    return true;
  }
  if (k === 'c') return commands.copySelection();
  if (k === 'v') return commands.paste();
  return false;
}

function handlePlain(e: KeyboardEvent): boolean {
  const ui = uiStore.getState();
  switch (e.key) {
    case 'Escape':
      commands.cancelOrDeselect();
      return true;
    case 'Delete':
    case 'Backspace':
      return commands.deleteSelection();
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      const d = e.shiftKey ? NUDGE_BIG : NUDGE;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      return commands.nudge(dx, dy);
    }
    case '?':
      ui.openDialog('about');
      return true;
  }
  const k = e.key.toLowerCase();
  if (k === 'e') return commands.rotateSelection(e.shiftKey ? -90 : 90);
  if (k === 'g') {
    commands.toggleGrid();
    return true;
  }
  const mode = BUILD_SHORTCUTS[k];
  if (mode) {
    commands.activateTool('build', mode);
    return true;
  }
  const tool = TOOL_SHORTCUTS[k];
  if (tool) {
    commands.activateTool(tool);
    return true;
  }
  return false;
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  // Only arrows auto-repeat, for a continuous nudge.
  if (e.repeat && !e.key.startsWith('Arrow')) return;
  if (uiStore.getState().screen !== 'editor') return;
  if (isTypingTarget(e.target) || blockedByOverlay()) return;
  if (toolKeyHandler?.(e)) {
    e.preventDefault();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return;
  const handled = mod ? handleModified(e) : handlePlain(e);
  if (handled) e.preventDefault();
}

/** Installs the global keyboard shortcuts. Returns the clean-up function. */
export function startShortcuts(): () => void {
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

export const SHORTCUT_LIST: { keys: string; label: string }[] = [
  { keys: 'V', label: 'Mover e selecionar' },
  { keys: 'R', label: 'Desenhar cômodo' },
  { keys: 'A', label: 'Área externa' },
  { keys: 'P', label: 'Dividir cômodo' },
  { keys: 'O', label: 'Portas e janelas' },
  { keys: 'F', label: 'Objetos e móveis' },
  { keys: 'M', label: 'Régua' },
  { keys: 'B', label: 'Pintar' },
  { keys: 'G', label: 'Mostrar ou esconder a grade' },
  { keys: 'Delete', label: 'Excluir a seleção' },
  { keys: 'Ctrl+Z', label: 'Desfazer' },
  { keys: 'Ctrl+Shift+Z ou Ctrl+Y', label: 'Refazer' },
  { keys: 'Ctrl+D', label: 'Duplicar objeto' },
  { keys: 'Ctrl+C e Ctrl+V', label: 'Copiar e colar objetos' },
  { keys: 'Setas', label: 'Mover 5 cm (com Shift, 50 cm)' },
  { keys: 'E e Shift+E', label: 'Girar objeto 90°' },
  { keys: 'Esc', label: 'Cancelar ou tirar a seleção' },
  { keys: '?', label: 'Ajuda e atalhos' },
];
