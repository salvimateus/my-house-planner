import { Moon, Sun } from 'lucide-react';
import type { ReactElement } from 'react';
import { uiStore } from '../store/uiStore.ts';
import { IconButton, type IconButtonProps } from './controls/IconButton.tsx';
import { useEffectiveTheme } from './useEffectiveTheme.ts';
import './ThemeToggle.css';

/** Switches to the opposite of the theme on screen and stores it as an explicit choice. */
export function ThemeToggle({
  variant,
  className,
}: Pick<IconButtonProps, 'variant' | 'className'>): ReactElement {
  const theme = useEffectiveTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  return (
    <IconButton
      variant={variant}
      className={className}
      label={label}
      title={label}
      icon={<Icon key={theme} className="theme-toggle-icon" />}
      onClick={() => uiStore.getState().setPrefs({ theme: next })}
    />
  );
}
