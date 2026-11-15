import type { ReactElement } from 'react';

/** Minha Casinha mark: a house outline with a floor plan inside. Decorative: the name sits next to it. */
export function Logo({ size = 56 }: { size?: number }): ReactElement {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="18" fill="#1A3263" />
      <path
        d="M14 30.5 32 16l18 14.5V48a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2Z"
        fill="#FFF8EE"
        stroke="#FAB95B"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M19 33v13h12V36M31 46h14V33M31 36h-5M38 33v6"
        fill="none"
        stroke="#1A3263"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
