// placeholder: WP9a
import type { ReactElement } from 'react';
import type { Fill } from '../model/types.ts';
import type { RenderContext } from './RenderContext.ts';

export function PatternDefs(_props: { fills: Fill[] }): ReactElement | null {
  return null;
}

export function fillPaint(fill: Fill, _ctx: RenderContext): string {
  return fill.color;
}
