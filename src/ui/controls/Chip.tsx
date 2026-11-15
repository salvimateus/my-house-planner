import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cx } from './cx.ts';
import './Chip.css';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: ReactNode;
};

export function Chip({ selected, icon, className, children, ...rest }: ChipProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected ?? undefined}
      className={cx('chip', className)}
      {...rest}
    >
      {icon ? (
        <span className="chip-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="chip-text">{children}</span>
    </button>
  );
}
