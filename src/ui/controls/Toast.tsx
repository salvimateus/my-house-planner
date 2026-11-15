import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { createStore, useStore } from 'zustand';
import { docStore } from '../../store/docStore.ts';
import { cx } from './cx.ts';
import './Toast.css';
import { errorCode, track } from '../../analytics/track.ts';

export type ToastTone = 'info' | 'success' | 'error';

export type ToastOptions = {
  tone?: ToastTone;
  /** Adds a "Desfazer" action that undoes the last change. */
  undo?: boolean;
  action?: { label: string; run(): void };
  durationMs?: number;
};

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  action: { label: string; run(): void } | null;
  leaving: boolean;
};

const MAX_VISIBLE = 3;
const EXIT_MS = 180;

const toastStore = createStore<{ items: ToastItem[] }>()(() => ({ items: [] }));
const timers = new Map<number, number>();
let nextId = 1;

function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  timers.delete(id);
  toastStore.setState((s) => ({
    items: s.items.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
  }));
  window.setTimeout(() => {
    toastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  }, EXIT_MS);
}

/** Shows a short message at the bottom of the screen. */
export function toast(message: string, opts: ToastOptions = {}): void {
  const id = nextId++;
  const action =
    opts.action ??
    (opts.undo ? { label: 'Desfazer', run: () => docStore.getState().undo() } : null);
  const item: ToastItem = { id, message, tone: opts.tone ?? 'info', action, leaving: false };
  if (item.tone === 'error') track('app_error', { error_code: errorCode(message) });
  const visible = toastStore.getState().items.filter((t) => !t.leaving);
  for (const old of visible.slice(0, Math.max(0, visible.length - MAX_VISIBLE + 1)))
    dismiss(old.id);
  toastStore.setState((s) => ({ items: [...s.items, item] }));
  const ms = opts.durationMs ?? (action ? 7000 : opts.tone === 'error' ? 6000 : 4000);
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), ms),
  );
}

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function ToastHost(): ReactElement {
  const items = useStore(toastStore, (s) => s.items);
  const ref = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const open = el.matches(':popover-open');
    if (items.length === 0) {
      if (open) el.hidePopover();
    } else if (!open || items.length > lastCount.current) {
      // Re-show so the host stays above dialogs opened after it.
      if (open) el.hidePopover();
      el.showPopover();
    }
    lastCount.current = items.length;
  }, [items]);

  return (
    <div ref={ref} popover="manual" className="toast-host">
      <ol className="toast-list" aria-live="polite" aria-relevant="additions">
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <li
              key={t.id}
              className={cx('toast', `toast-${t.tone}`, t.leaving && 'toast-leaving')}
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon className="toast-icon" aria-hidden="true" />
              <span className="toast-msg">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="toast-close"
                aria-label="Fechar aviso"
                onClick={() => dismiss(t.id)}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
