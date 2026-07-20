"use client";

// Small monochrome Fluent-style icons - line-based, single colour
// (currentColor), no fills, no emoji. Used throughout the nav, command bars,
// and status pills instead of colourful emoji glyphs.

export interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
});

export function HomeIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 9.5 10 3l7 6.5" />
      <path d="M5 8.5V17h10V8.5" />
      <path d="M8 17v-5h4v5" />
    </svg>
  );
}

export function MyWorkIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3.5" y="4" width="13" height="13" rx="1.5" />
      <path d="M3.5 8h13" />
      <path d="M6.5 4V2.5M13.5 4V2.5" />
      <path d="M6.5 11.5l1.6 1.6L11.5 10" />
    </svg>
  );
}

export function OrdersIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="4" y="2.5" width="12" height="15" rx="1.2" />
      <path d="M7 6.5h6M7 9.5h6M7 12.5h4" />
    </svg>
  );
}

export function PlannerIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="4.2" height="13" rx="1" />
      <rect x="7.9" y="3.5" width="4.2" height="9" rx="1" />
      <rect x="13.3" y="3.5" width="4.2" height="6" rx="1" />
    </svg>
  );
}

export function CustomersIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.7 16c.5-2.8 2.5-4.5 4.8-4.5s4.3 1.7 4.8 4.5" />
      <circle cx="14" cy="6.5" r="2" />
      <path d="M12.8 11.6c1.9.2 3.4 1.7 3.8 4" />
    </svg>
  );
}

export function QualityIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M10 2.5 3.5 5v5c0 4 2.8 6.5 6.5 7.5 3.7-1 6.5-3.5 6.5-7.5V5L10 2.5Z" />
      <path d="M7 10.2l2 2 4-4.2" />
    </svg>
  );
}

export function ScanIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 6.5V4a1 1 0 0 1 1-1h2.5" />
      <path d="M17 6.5V4a1 1 0 0 0-1-1h-2.5" />
      <path d="M3 13.5V16a1 1 0 0 0 1 1h2.5" />
      <path d="M17 13.5V16a1 1 0 0 1-1 1h-2.5" />
      <path d="M4 10h12" />
    </svg>
  );
}

export function ReportsIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3.5 16.5h13" />
      <rect x="4.5" y="10" width="2.6" height="6" />
      <rect x="8.7" y="6.5" width="2.6" height="9.5" />
      <rect x="12.9" y="3.5" width="2.6" height="12.5" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="8.7" cy="8.7" r="5.2" />
      <path d="m16.5 16.5-3.9-3.9" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function FilterIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 4.5h14L11.5 10.8V16l-3-1.6v-3.6L3 4.5Z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}

export function GridIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="0.8" />
      <rect x="11" y="3" width="6" height="6" rx="0.8" />
      <rect x="3" y="11" width="6" height="6" rx="0.8" />
      <rect x="11" y="11" width="6" height="6" rx="0.8" />
    </svg>
  );
}

export function BoardIcon({ size = 16, className }: IconProps) {
  return <PlannerIcon size={size} className={className} />;
}

export function EditIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12.9 3.6 16.4 7 6.8 16.6 3 17.5l.9-3.8 9-9.1Z" />
    </svg>
  );
}

export function PersonIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="10" cy="7" r="3" />
      <path d="M3.7 17c.6-3.6 3-5.8 6.3-5.8s5.7 2.2 6.3 5.8" />
    </svg>
  );
}

export function CalendarIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3" y="4.2" width="14" height="13" rx="1.2" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </svg>
  );
}

export function FlagIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M5 3v14" />
      <path d="M5 4h9l-2.2 3L14 10H5" />
    </svg>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}

export function AttachmentIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M13.5 6.5 8 12a2.5 2.5 0 1 0 3.5 3.5l6-6a4.5 4.5 0 0 0-6.4-6.4l-6 6" />
    </svg>
  );
}

export function CommentIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3.5 4.5h13v9h-7l-3.5 3v-3h-2.5Z" />
    </svg>
  );
}
