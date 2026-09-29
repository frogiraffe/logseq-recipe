import type { ReactNode } from "react";

// Line icons drawn on a 24px grid, in the text colour and at the text size,
// so they follow the Logseq theme and render the same everywhere (symbol
// characters depend on the font, and some turn into colour emoji).
const SHAPES = {
  back: <path d="M19 12H5m7 7-7-7 7-7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </g>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.34-5.66L20 9m0-5v5h-5" />,
  reset: <path d="M4 12a8 8 0 1 0 2.34-5.66L4 9m0-5v5h5" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>
  ),
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </g>
  ),
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  play: <path d="M7 5v14l12-7z" fill="currentColor" stroke="none" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

/** A decorative icon: the control around it carries the accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="draft-recipe-icon"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
