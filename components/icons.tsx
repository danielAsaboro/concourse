// A small inline icon set: 20px grid, 1.5px stroke, round joins.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const S = ({ children, ...p }: P) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const Logo = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <ellipse cx="12" cy="12" rx="10.25" ry="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="12" cy="12" rx="6" ry="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9.5" y="10.5" width="5" height="3" rx="0.75" fill="currentColor" />
  </svg>
);
export const IconOverview = (p: P) => <S {...p}><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="4" rx="1.5" /><rect x="11" y="9" width="6" height="8" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /></S>;
export const IconCalendar = (p: P) => <S {...p}><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 2.5v4M13 2.5v4" /></S>;
export const IconArena = (p: P) => <S {...p}><ellipse cx="10" cy="10" rx="7.5" ry="6" /><ellipse cx="10" cy="10" rx="4" ry="3" /><path d="M10 4v3M10 13v3M2.5 10h3.5M14 10h3.5" /></S>;
export const IconStands = (p: P) => <S {...p}><path d="M3 8l1.5-4h11L17 8" /><path d="M3 8h14v1.5a2 2 0 0 1-3.5 1.3A2 2 0 0 1 10 11a2 2 0 0 1-3.5-.2A2 2 0 0 1 3 9.5z" /><path d="M4.5 11.5V17h11v-5.5M8.5 17v-3.5h3V17" /></S>;
export const IconSpark = (p: P) => <S {...p}><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z" /><path d="M15.5 13.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></S>;
export const IconEvidence = (p: P) => <S {...p}><path d="M5.5 2.5h6l3 3v12h-9z" /><path d="M11.5 2.5v3h3M8 9.5h5M8 12.5h5M8 15.5h3" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="10" cy="10" r="3.25" /><path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1.1 1.1M14.6 14.6l1.1 1.1M4.3 15.7l1.1-1.1M14.6 5.4l1.1-1.1" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7z" /></S>;
export const IconChevron = (p: P) => <S {...p}><path d="M7.5 5l5 5-5 5" /></S>;
export const IconChevronDown = (p: P) => <S {...p}><path d="M5 7.5l5 5 5-5" /></S>;
export const IconArrowRight = (p: P) => <S {...p}><path d="M4 10h12M11 5l5 5-5 5" /></S>;
export const IconArrowUp = (p: P) => <S {...p}><path d="M10 16V4M5 9l5-5 5 5" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M5 5l10 10M15 5L5 15" /></S>;
export const IconSwap = (p: P) => <S {...p}><path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M4 10.5l3.5 3.5L16 5.5" /></S>;
export const IconHistory = (p: P) => <S {...p}><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6L3.5 7.3" /><path d="M3.5 3.5v3.8h3.8M10 6.5V10l2.5 1.5" /></S>;
export const IconExpand = (p: P) => <S {...p}><path d="M12 3.5h4.5V8M8 16.5H3.5V12M16.5 3.5l-5 5M3.5 16.5l5-5" /></S>;
export const IconReset = (p: P) => <S {...p}><path d="M4 4v4h4" /><path d="M4.6 12.5A6 6 0 1 0 5.4 7L4 8" /></S>;
export const IconUsers = (p: P) => <S {...p}><circle cx="7.5" cy="7" r="3" /><path d="M2.5 16.5a5 5 0 0 1 10 0M13 4.3a3 3 0 0 1 0 5.4M15 12.2a5 5 0 0 1 2.5 4.3" /></S>;
export const IconTarget = (p: P) => <S {...p}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /><circle cx="10" cy="10" r=".75" fill="currentColor" /></S>;
export const IconChat = (p: P) => <S {...p}><path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3h0.5a2 2 0 0 1-2-2z" /></S>;
export const IconStore = (p: P) => <S {...p}><path d="M3.5 7.5L5 3.5h10l1.5 4M3.5 7.5h13M4.5 7.5V16.5h11V7.5M8 16.5v-4h4v4" /></S>;
export const IconHandshake = (p: P) => <S {...p}><path d="M2.5 8l3-3 3 1.5L11 5l3.5 1 3 2.5" /><path d="M5 11l3 3c.7.7 1.8.7 2.5 0l4-4M8.5 6.5L6.5 9a1.4 1.4 0 0 0 2 2l2-1.5" /></S>;
export const IconMegaphone = (p: P) => <S {...p}><path d="M3 8.5v3h2.5l6 3.5v-10l-6 3.5zM14.5 7.5a3 3 0 0 1 0 5M6 11.5l1 4.5h2l-1-4" /></S>;
export const IconCode = (p: P) => <S {...p}><path d="M7 6l-4 4 4 4M13 6l4 4-4 4" /></S>;
export const IconLayers = (p: P) => <S {...p}><path d="M10 3l7 3.5-7 3.5-7-3.5z" /><path d="M3 10l7 3.5 7-3.5M3 13.5L10 17l7-3.5" /></S>;
export const IconInfo = (p: P) => <S {...p}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5M10 6.5v.01" /></S>;
export const IconDatabase = (p: P) => <S {...p}><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></S>;
