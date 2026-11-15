import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx.ts';
import './Segmented.css';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SegmentedProps<T extends string> = {
  /** Group name for assistive technology. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
  disabled?: boolean;
  /** Show the group label above the control. */
  showLabel?: boolean;
  className?: string;
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  showLabel = false,
  className,
}: SegmentedProps<T>): ReactElement {
  return (
    <fieldset className={cx('segmented', className)} disabled={disabled}>
      <legend className={showLabel ? 'segmented-legend' : 'sr-only'}>{label}</legend>
      <div className="segmented-track">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="segmented-option"
            aria-pressed={o.value === value}
            disabled={o.disabled}
            onClick={() => {
              if (o.value !== value) onChange(o.value);
            }}
          >
            {o.icon ? (
              <span className="segmented-icon" aria-hidden="true">
                {o.icon}
              </span>
            ) : null}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
