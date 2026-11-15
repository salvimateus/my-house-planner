import { Minus, Plus } from 'lucide-react';
import type { KeyboardEvent, ReactElement } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Mm } from '../../model/types.ts';
import { formatCm, formatLengthShort, parseMeters } from '../../model/units.ts';
import { cx } from './cx.ts';
import './MeasureInput.css';

export type MeasureUnit = 'm' | 'cm';

export type MeasureInputProps = {
  label: string;
  /** Committed value in mm. */
  value: Mm;
  onCommit(value: Mm): void;
  unit?: MeasureUnit;
  min?: Mm;
  max?: Mm;
  /** Stepper increment in mm. Defaults to 100 mm (m) or 10 mm (cm). */
  step?: Mm;
  disabled?: boolean;
  hint?: string;
  /** Live parsed value while typing: null when the text is invalid or out of range. */
  onDraft?(value: Mm | null): void;
  /** Extra rule after the range check; return a pt-BR message to reject. */
  validate?(value: Mm): string | null;
  hideLabel?: boolean;
  className?: string;
};

const UNIT_NAME: Record<MeasureUnit, string> = { m: 'em metros', cm: 'em centímetros' };

export const formatMeasure = (mm: Mm, unit: MeasureUnit): string =>
  unit === 'm' ? formatLengthShort(mm) : formatCm(mm);

export function parseMeasure(text: string, unit: MeasureUnit): Mm | null {
  if (unit === 'm') return parseMeters(text);
  const t = text
    .trim()
    .toLowerCase()
    .replace(/\s*cm$/, '')
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 10);
}

const withUnit = (mm: Mm, unit: MeasureUnit) => `${formatMeasure(mm, unit)} ${unit}`;

function check(
  text: string,
  unit: MeasureUnit,
  min: Mm | undefined,
  max: Mm | undefined,
  validate: ((v: Mm) => string | null) | undefined,
): { value: Mm | null; error: string | null } {
  const v = parseMeasure(text, unit);
  if (v === null) {
    return {
      value: null,
      error:
        unit === 'm' ? 'Digite um número, por exemplo 10,5.' : 'Digite um número, por exemplo 15.',
    };
  }
  if ((min !== undefined && v < min) || (max !== undefined && v > max)) {
    if (min !== undefined && max !== undefined) {
      return {
        value: null,
        error: `Use um valor entre ${withUnit(min, unit)} e ${withUnit(max, unit)}.`,
      };
    }
    return {
      value: null,
      error:
        min !== undefined && v < min
          ? `O mínimo é ${withUnit(min, unit)}.`
          : `O máximo é ${withUnit(max ?? 0, unit)}.`,
    };
  }
  const custom = validate?.(v) ?? null;
  return custom ? { value: null, error: custom } : { value: v, error: null };
}

export function MeasureInput({
  label,
  value,
  onCommit,
  unit = 'm',
  min,
  max,
  step,
  disabled,
  hint,
  onDraft,
  validate,
  hideLabel = false,
  className,
}: MeasureInputProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(() => formatMeasure(value, unit));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  const stepMm = step ?? (unit === 'm' ? 100 : 10);

  useEffect(() => {
    if (editing.current) return;
    setText(formatMeasure(value, unit));
    setError(null);
  }, [value, unit]);

  const commitValue = (v: Mm) => {
    editing.current = false;
    setError(null);
    setText(formatMeasure(v, unit));
    onDraft?.(v);
    if (v !== value) onCommit(v);
  };

  const commitText = (): boolean => {
    const r = check(text, unit, min, max, validate);
    if (r.value === null) {
      setError(r.error);
      return false;
    }
    commitValue(r.value);
    return true;
  };

  const revert = () => {
    editing.current = false;
    setText(formatMeasure(value, unit));
    setError(null);
    onDraft?.(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitText();
    } else if (e.key === 'Escape' && (editing.current || error)) {
      // Keep the dialog open: the first Escape only reverts the field.
      e.preventDefault();
      e.stopPropagation();
      revert();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
    }
  };

  const bump = (dir: 1 | -1, times = 1) => {
    const base = parseMeasure(text, unit) ?? value;
    let next = Math.round(base / stepMm) * stepMm + dir * stepMm * times;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (validate?.(next)) return;
    commitValue(next);
  };

  const parsed = parseMeasure(text, unit) ?? value;
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cx('measure', error && 'measure-invalid', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'measure-label'}>
        {label} <span className="sr-only">({UNIT_NAME[unit]})</span>
      </label>
      <div className="measure-field">
        <button
          type="button"
          className="measure-step"
          aria-label={`Diminuir ${label}`}
          disabled={disabled || (min !== undefined && parsed <= min)}
          onClick={() => bump(-1)}
        >
          <Minus aria-hidden="true" />
        </button>
        <div className="measure-box">
          <input
            id={id}
            className="measure-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            value={text}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              editing.current = true;
              setText(e.target.value);
              if (error) setError(null);
              onDraft?.(check(e.target.value, unit, min, max, validate).value);
            }}
            onBlur={() => {
              if (editing.current) commitText();
            }}
            onKeyDown={onKeyDown}
          />
          <span className="measure-unit" aria-hidden="true">
            {unit}
          </span>
        </div>
        <button
          type="button"
          className="measure-step"
          aria-label={`Aumentar ${label}`}
          disabled={disabled || (max !== undefined && parsed >= max)}
          onClick={() => bump(1)}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} className="measure-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="measure-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
