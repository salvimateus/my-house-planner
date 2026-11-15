import type { ReactElement, ReactNode } from 'react';
import { useId } from 'react';
import { cx } from './cx.ts';
import './Switch.css';

export type SwitchProps = {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  className?: string;
};

/** Full-row toggle: the whole row is the switch, so the target stays large on touch. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: SwitchProps): ReactElement {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      className={cx('switch', className)}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-text">
        <span id={`${id}-label`} className="switch-label">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="switch-desc">
            {description}
          </span>
        ) : null}
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
