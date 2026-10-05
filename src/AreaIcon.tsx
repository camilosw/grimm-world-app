import type { ReactNode } from 'react'

/** Line drawings on a 24-unit grid, one per area id (`AREAS`), stroked in the header's text colour. */
const ICONS: Record<string, ReactNode> = {
  // A folded map.
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  // A bookmark: the storybook's sub-chapter cards waiting in the bar.
  bar: <path d="M6 3h12v18l-6-4.5L6 21z" />,
  // An hourglass: Time Passes and Next Chapter.
  encounter: <path d="M6 3h12M6 21h12M7 3v3l5 6 5-6V3M7 21v-3l5-6 5 6v3" />,
  character: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  // A backpack.
  storage: (
    <>
      <path d="M5 11a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M9.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6M8 21v-4.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V21M8 11.5h8" />
    </>
  ),
  // A closed book.
  storybook: (
    <>
      <path d="M5 19V5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0 0 4h12v-4" />
      <path d="M9 7h6" />
    </>
  ),
  // A flag.
  quest: <path d="M5 21V4h13l-3 4.5 3 4.5H5" />,
  // A skull.
  enemy: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.7 1.2 4.4 3 5.4V21h10v-4.6c1.8-1 3-2.7 3-5.4a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11.5" r="1.6" />
      <circle cx="15" cy="11.5" r="1.6" />
      <path d="M10.5 21v-2.5M13.5 21v-2.5" />
    </>
  ),
  // A target.
  training: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  banned: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  // An open hand: the Actions area holds the player's hand.
  hand: (
    <path d="M7 14V6.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V12M16 12V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L4 15.2a1.6 1.6 0 0 1 2.4-2.1L7 14" />
  ),
  home: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />,
  // Crossed swords: blades with flat tips, guards, hilts and pommels.
  battlefield: (
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l3.5 3.5M19 21.5l2.5-2.5M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-3.5 3.5M5 21.5 2.5 19" />
  ),
}

/** The icon in an area's header, before its name; nothing for an area without one. */
export function AreaIcon({ id }: { id: string }) {
  const icon = ICONS[id]
  if (!icon) return null
  return (
    <svg
      className="area-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  )
}
