import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

export interface OffscreenRender {
  /** The first element that the tree rendered (for example the `<svg>`). */
  root: Element;
  dispose(): void;
}

/**
 * Renders a React tree synchronously into a hidden container attached to `document.body`, so
 * layout, `getBBox` and computed styles work (export, thumbnails). Call `dispose()` when done.
 */
export function renderOffscreen(node: ReactNode): OffscreenRender {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;contain:layout;';
  document.body.appendChild(host);
  const root = createRoot(host);
  const dispose = () => {
    root.unmount();
    host.remove();
  };
  try {
    flushSync(() => root.render(node));
  } catch (err) {
    dispose();
    throw err;
  }
  const el = host.firstElementChild;
  if (!el) {
    dispose();
    throw new Error('Offscreen render produced no element');
  }
  return { root: el, dispose };
}
