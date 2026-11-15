import type { ButtonHTMLAttributes, CSSProperties, ReactElement } from 'react';
import { cx } from './cx.ts';
import './Swatch.css';

export type SwatchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  /** #rrggbb */
  color: string;
  label: string;
  selected?: boolean;
  size?: 'md' | 'lg';
};

export function Swatch({
  color,
  label,
  selected,
  size = 'md',
  className,
  style,
  ...rest
}: SwatchProps): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected ?? undefined}
      className={cx('swatch', `swatch-${size}`, className)}
      style={{ ...style, '--swatch-color': color } as CSSProperties}
      {...rest}
    >
      <span className="swatch-dot" aria-hidden="true" />
    </button>
  );
}
