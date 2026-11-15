// placeholder: WP9b
import type { ReactElement } from 'react';
import type { Fill } from '../../model/types.ts';

export type FillPickerProps = {
  value: Fill;
  onChange(fill: Fill): void;
  group: 'indoor' | 'outdoor' | 'all';
};

export function FillPicker(_props: FillPickerProps): ReactElement | null {
  return null;
}
