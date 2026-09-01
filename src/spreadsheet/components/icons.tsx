import React from 'react';

/*
 * 16×16 stroke icons from the "Crisp" design. Paths are copied verbatim
 * from the prototype; keep them in sync with the design handoff.
 */

type IconProps = { size?: number };

const Svg: React.FC<IconProps & { children: React.ReactNode; sw?: number }> = ({ size = 16, sw = 1.5, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const UndoIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M6.5 3.5 3.5 6.5l3 3M3.5 6.5H10a3 3 0 0 1 0 6H7" /></Svg>
);

export const RedoIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M9.5 3.5l3 3-3 3M12.5 6.5H6a3 3 0 0 0 0 6h3" /></Svg>
);

export const BoldIcon: React.FC<IconProps> = (p) => (
  <Svg {...p} sw={1.7}><path d="M5 2.75h3.75a2.375 2.375 0 0 1 0 4.75H5zm0 4.75h4.25a2.375 2.375 0 0 1 0 4.75H5z" /></Svg>
);

export const ItalicIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M6.5 2.75h6M3.5 13.25h6M9.75 2.75l-3.5 10.5" /></Svg>
);

export const UnderlineIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M4.5 2.5v4.75a3.5 3.5 0 0 0 7 0V2.5M3.75 13.5h8.5" /></Svg>
);

export const StrikethroughIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M2.75 8h10.5M10.75 4.75c-.5-1.25-1.75-1.9-2.75-1.9-1.5 0-2.75.9-2.75 2.15 0 .5.15.95.5 1.3M5.25 11.25c.5 1.25 1.75 1.9 2.75 1.9 1.5 0 2.75-.9 2.75-2.15 0-.5-.15-.95-.5-1.3" /></Svg>
);

export const TextColorIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M4.75 10 8 2.75 11.25 10M5.9 7.75h4.2" /><rect x="3" y="12" width="10" height="2.5" rx="0.75" fill="var(--accent)" stroke="none" /></Svg>
);

export const FillColorIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M8 2.75s3.75 4.1 3.75 6.35a3.75 3.75 0 0 1-7.5 0C4.25 6.85 8 2.75 8 2.75z" /></Svg>
);

export const HorizontalAlignIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M2.75 3.5h10.5M2.75 6.5h6.5M2.75 9.5h10.5M2.75 12.5h6.5" /></Svg>
);

export const VerticalAlignIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M2.75 13.25h10.5M8 2.75V10M5.5 7.5 8 10l2.5-2.5" /></Svg>
);

export const WrapTextIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M2.75 3.5h10.5M2.75 8h8a2.25 2.25 0 0 1 0 4.5H8.75M10.25 10.5l-1.75 1.75 1.75 1.75M2.75 12.25h3" /></Svg>
);

export const BordersIcon: React.FC<IconProps> = (p) => (
  <Svg {...p} sw={1.3}><rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1" /><path d="M8 2.75v10.5M2.75 8h10.5" opacity="0.45" /></Svg>
);

export const FunctionsIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M12 3.5H4.5L8.5 8l-4 4.5H12" /></Svg>
);

export const FilterIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M2.75 3.5h10.5L9.5 8.25v4.5L6.5 11V8.25z" /></Svg>
);

export const AddSheetIcon: React.FC<IconProps> = (p) => (
  <Svg {...p} size={14}><path d="M8 3.5v9M3.5 8h9" /></Svg>
);

export const HistoryIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.25" /><path d="M8 5.25V8l2 1.5" /></Svg>
);

export const SunIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><circle cx="8" cy="8" r="3.25" /><path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.4 3.4l1.25 1.25M11.35 11.35l1.25 1.25M12.6 3.4l-1.25 1.25M4.65 11.35 3.4 12.6" /></Svg>
);

export const MoonIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}><path d="M13.25 9.5A5.75 5.75 0 0 1 6.5 2.75a5.75 5.75 0 1 0 6.75 6.75z" /></Svg>
);

export const GridGlyphIcon: React.FC<IconProps> = (p) => (
  <Svg {...p} size={14}>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <path d="M2 6.5h12M6.5 2v12" />
  </Svg>
);

export const ChevronDownIcon: React.FC<IconProps> = (p) => (
  <Svg {...p} size={8} sw={2}><path d="M4 6.5 8 10l4-3.5" /></Svg>
);
