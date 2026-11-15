import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cx } from './cx.ts';
import './IconButton.css';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'surface' | 'floating' | 'primary';
  pressed?: boolean;
  /** Small dot or count shown on the corner. */
  badge?: ReactNode;
};

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  pressed,
  badge,
  className,
  title,
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      className={cx('icon-btn', `icon-btn-${variant}`, className)}
      {...rest}
    >
      <span className="icon-btn-glyph" aria-hidden="true">
        {icon}
      </span>
      {badge !== undefined && badge !== null && badge !== false ? (
        <span className="icon-btn-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
