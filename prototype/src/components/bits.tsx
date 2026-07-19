"use client";

// Small shared presentation components.

import type { SaveState, TaskStatus, UnitStatus } from "@/domain/types";
import { humanizeStatus, unitStatusLabel } from "@/domain/selectors";

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return <span className={`badge s-${status.toLowerCase()}`}>{unitStatusLabel(status)}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge s-${status.toLowerCase()}`}>{humanizeStatus(status)}</span>;
}

export function OperationStatusBadge({ status }: { status: string }) {
  return <span className={`badge s-${status.toLowerCase()}`}>{humanizeStatus(status)}</span>;
}

export function SaveStateBadge({ state }: { state: SaveState }) {
  const labels: Record<SaveState, string> = {
    Saved: "Saved",
    Pending: "Pending",
    Error: "Error",
    NeedsReview: "Needs Review"
  };
  return <span className={`badge save-${state.toLowerCase()}`}>{labels[state]}</span>;
}

// Shows friendly relative wording plus the exact timestamp (doc 04 rule:
// always expose the exact timestamp).
export function Exact({ at }: { at: string }) {
  const d = new Date(at);
  const text = d.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });
  return (
    <time dateTime={at} title={at}>
      {text}
    </time>
  );
}

const ART_COLORS: Record<string, [string, string]> = {
  pump: ["#3a5f8a", "#a9c3de"],
  nameplate: ["#6b6b6b", "#d9d9d9"],
  crate: ["#8a6a3a", "#dec9a9"],
  stamp: ["#5a5a8a", "#c3c3de"],
  caliper: ["#3a8a6f", "#a9dec9"],
  gauge: ["#8a3a3a", "#dea9a9"],
  shaft: ["#4a4a4a", "#cccccc"],
  pdf: ["#8a3a3a", "#f0dcdc"]
};

// A deterministic placeholder graphic. Clearly labelled MOCK; never a real
// photo and never real camera capture.
export function MockPhoto({
  art,
  caption,
  width = 180,
  height = 120
}: {
  art: string;
  caption: string;
  width?: number;
  height?: number;
}) {
  const [dark, light] = ART_COLORS[art] ?? ["#555", "#ccc"];
  return (
    <figure className="mock-photo" style={{ margin: 0 }}>
      <svg width={width} height={height} role="img" aria-label={`Mock photo: ${caption}`}>
        <rect width="100%" height="100%" fill={light} />
        <circle cx={width * 0.35} cy={height * 0.55} r={height * 0.28} fill={dark} opacity={0.85} />
        <rect x={width * 0.52} y={height * 0.3} width={width * 0.34} height={height * 0.42} rx={6} fill={dark} opacity={0.55} />
        <text x="50%" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="#222">
          MOCK PHOTO
        </text>
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Deterministic fake QR pattern derived from the value. Visually reads as a
// QR code for previews; not a scannable real code.
export function QrSvg({ value, size = 96 }: { value: string; size?: number }) {
  const n = 13;
  const cell = size / n;
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = (h * 33) ^ value.charCodeAt(i);
  const cells: boolean[] = [];
  let x = Math.abs(h) || 1;
  for (let i = 0; i < n * n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    cells.push((x & 4) === 0);
  }
  const finder = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <rect x={cx * cell} y={cy * cell} width={cell * 3} height={cell * 3} fill="#000" />
      <rect x={(cx + 0.75) * cell} y={(cy + 0.75) * cell} width={cell * 1.5} height={cell * 1.5} fill="#fff" />
    </g>
  );
  return (
    <svg width={size} height={size} role="img" aria-label={`QR code for ${value}`} style={{ background: "#fff" }}>
      {cells.map((on, i) => {
        const cx = i % n;
        const cy = Math.floor(i / n);
        const inFinder =
          (cx < 4 && cy < 4) || (cx > n - 5 && cy < 4) || (cx < 4 && cy > n - 5);
        if (!on || inFinder) return null;
        return <rect key={i} x={cx * cell} y={cy * cell} width={cell * 0.92} height={cell * 0.92} fill="#000" />;
      })}
      {finder(0.5, 0.5)}
      {finder(n - 3.5, 0.5)}
      {finder(0.5, n - 3.5)}
    </svg>
  );
}
