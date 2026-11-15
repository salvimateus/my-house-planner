import { type ReactElement, useId } from 'react';
import './Logo.css';

/** Minha Casinha mark: a house outline with a floor plan inside. Decorative: the name sits next to it. */
export function Logo({ size = 56 }: { size?: number }): ReactElement {
  const tileId = `${useId()}-tile`;
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="logo-tile-from" />
          <stop offset="1" className="logo-tile-to" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${tileId})`} />
      <rect className="logo-highlight" x="2.5" y="2.5" width="59" height="59" rx="17.5" />
      <path
        className="logo-house"
        d="M14 30.5 32 16l18 14.5V48a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2Z"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        className="logo-plan"
        d="M19 33v13h12V36M31 46h14V33M31 36h-5M38 33v6"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
