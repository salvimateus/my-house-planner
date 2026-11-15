import type { Screen } from '../store/uiStore.ts';

type ExportFormat = 'pdf' | 'svg' | 'png';

/**
 * Event names and their parameters. Names follow GA4 recommended events where one fits.
 * The Google tag in the GTM container sends them as is, so a new event needs no GTM change.
 */
export interface AnalyticsEvents {
  page_view: Record<string, never>;
  template_open: { template_id: string };
  plan_create: { lot_width_m: number; lot_depth_m: number };
  project_open: { source: 'list' };
  project_file_import: Record<string, never>;
  project_file_export: { method: 'download' | 'web_share' };
  export_generate: {
    format: ExportFormat;
    paper: string;
    scale: string;
    dpi?: number;
    options: string;
  };
  export_download: { format: ExportFormat };
  export_share: { format: ExportFormat; method: 'web_share' | 'download' };
  share_link_create: { method: 'copy' | 'web_share' };
  share_link_open: Record<string, never>;
  tool_select: { tool_id: string };
  item_place: { item_id: string };
  opening_place: { opening_type: string };
  room_create: { room_type: string };
  sun_panel_open: Record<string, never>;
  theme_change: { theme: 'light' | 'dark' };
  undo: Record<string, never>;
  redo: Record<string, never>;
  app_error: { error_code: string };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

type EventArgs<E extends AnalyticsEvent> =
  AnalyticsEvents[E] extends Record<string, never>
    ? [params?: AnalyticsEvents[E]]
    : [params: AnalyticsEvents[E]];

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** The `gtag()` of Google's install snippet: GTM reads the Arguments object, not an array. */
export function gtag(..._args: unknown[]): void {
  window.dataLayer ??= [];
  // biome-ignore lint/complexity/noArguments: gtm.js expects the Arguments object itself.
  window.dataLayer.push(arguments);
}

/** Sends one finished user action. It never throws, so a call site needs no guard. */
export function track<E extends AnalyticsEvent>(name: E, ...[params]: EventArgs<E>): void {
  try {
    gtag('event', name, params ?? {});
  } catch {
    // Analytics must never break the app.
  }
}

const PAGES: Record<Screen, { path: string; title: string }> = {
  start: { path: '/inicio', title: 'Início' },
  wizard: { path: '/novo-terreno', title: 'Novo terreno' },
  editor: { path: '/editor', title: 'Editor da planta' },
};

/**
 * Points every later hit at the virtual page: origin plus a stable path, never the real URL,
 * whose hash can hold a whole shared plan.
 */
export function setPage(screen: Screen): void {
  const page = PAGES[screen];
  gtag('set', { page_location: `${window.location.origin}${page.path}`, page_title: page.title });
}

/** A short stable code for a message, so no user text reaches analytics. */
export function errorCode(message: string): string {
  let h = 5381;
  for (let i = 0; i < message.length; i++) h = ((h * 33) ^ message.charCodeAt(i)) >>> 0;
  return `e_${h.toString(36)}`;
}
