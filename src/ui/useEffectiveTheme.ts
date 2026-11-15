import { useSyncExternalStore } from 'react';
import { useUi } from '../store/uiStore.ts';

export type EffectiveTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(notify: () => void): () => void {
  const mql = matchMedia(DARK_QUERY);
  mql.addEventListener('change', notify);
  return () => mql.removeEventListener('change', notify);
}

/** The theme on screen: the stored choice, or the system theme while the user has never chosen. */
export function useEffectiveTheme(): EffectiveTheme {
  const pref = useUi((s) => s.prefs.theme);
  const systemDark = useSyncExternalStore(subscribe, () => matchMedia(DARK_QUERY).matches);
  if (pref !== 'auto') return pref;
  return systemDark ? 'dark' : 'light';
}
