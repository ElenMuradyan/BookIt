"use client";

import { formatMoney } from "@bookit/utils";

export function Sparkline({ points, color = "var(--lavender)" }: { points: number[]; color?: string }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const width = 160;
  const height = 36;
  const coords = points.map((value, idx) => {
    const x = points.length <= 1 ? width : (idx / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${height} ${coords.join(" ")} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 36, display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sparkFill)" />
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({
  points,
  money = true,
}: {
  points: { label: string; value: number }[];
  money?: boolean;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const width = 560;
  const height = 160;
  const coords = points.map((point, idx) => {
    const x = points.length <= 1 ? width / 2 : (idx / (points.length - 1)) * (width - 24) + 12;
    const y = height - 18 - (point.value / max) * (height - 34);
    return { x, y, ...point };
  });
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${coords[0]?.x ?? 0},${height - 18} ${line} ${coords[coords.length - 1]?.x ?? width},${height - 18}`;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 170, display: "block" }} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - 18 - ratio * (height - 34);
          return <line key={ratio} x1="12" x2={width - 12} y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 3" />;
        })}
        <polygon points={area} fill="url(#areaGrad)" />
        <polyline points={line} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c) => (
          <g key={c.label}>
            <circle cx={c.x} cy={c.y} r="3.5" fill="#c4b5fd" />
            <title>{`${c.label}: ${money ? formatMoney(c.value) : c.value}`}</title>
          </g>
        ))}
      </svg>
      <div className="row" style={{ justifyContent: "space-between", padding: "0 6px" }}>
        {points.map((point) => (
          <span key={point.label} className="tiny tabular">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
