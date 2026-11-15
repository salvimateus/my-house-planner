import { uiStore } from '../store/uiStore.ts';
import { gtag, setPage, track } from './track.ts';

const GTM_ID = 'GTM-588SHZP2';
const GTM_SRC = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;

function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 4000 });
  } else {
    window.setTimeout(task, 2000);
  }
}

function injectContainer(): void {
  if (document.querySelector(`script[src="${GTM_SRC}"]`)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = GTM_SRC;
  // Offline or blocked: the queued commands stay in the data layer and the app goes on.
  script.onerror = () => script.remove();
  document.head.appendChild(script);
}

let started = false;

/**
 * Production only. Queues the virtual page and the container start now, and loads the
 * container script once the first render is done and the browser is idle.
 */
export function startAnalytics(): void {
  if (!import.meta.env.PROD || started) return;
  started = true;
  try {
    // Before 'js': the container's Google tag sends the first page_view on its own, with this page.
    setPage(uiStore.getState().screen);
    gtag('js', new Date());
    uiStore.subscribe((s, prev) => {
      if (s.screen === prev.screen) return;
      setPage(s.screen);
      track('page_view');
    });
    window.setTimeout(() => whenIdle(injectContainer), 0);
  } catch {
    // Analytics must never break the app.
  }
}
