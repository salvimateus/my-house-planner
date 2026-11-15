import { Moon, Sun, SunMoon } from 'lucide-react';
import type { ReactElement } from 'react';
import { uiStore, useUi } from '../store/uiStore.ts';
import { IconButton, type IconButtonProps } from './controls/IconButton.tsx';
import './ThemeToggle.css';

const THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' } as const;
const THEME_LABEL = {
  auto: 'Tema: automático',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
} as const;

/** Cycles the stored theme preference: auto, light, dark. */
export function ThemeToggle({
  variant,
  className,
}: Pick<IconButtonProps, 'variant' | 'className'>): ReactElement {
  const theme = useUi((s) => s.prefs.theme);
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon;
  return (
    <IconButton
      variant={variant}
      className={className}
      label={THEME_LABEL[theme]}
      title={`${THEME_LABEL[theme]}. Toque para trocar.`}
      icon={<Icon key={theme} className="theme-toggle-icon" />}
      onClick={() => uiStore.getState().setPrefs({ theme: THEME_NEXT[theme] })}
    />
  );
}
