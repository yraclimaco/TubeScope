"use client";

import { useGSAP } from "@gsap/react";
import { useRef, useState } from "react";
import { pct } from "@/lib/format";
import { drawIn } from "./animate";
import { Tooltip } from "./tooltip";
import { linear, useWidth } from "./use-size";

export interface RateRow {
  label: string;
  rate: number;
  low: number;
  high: number;
  n: number;
  share: number;
  color: string;
}

const ROW = 34;
const M = { top: 26, right: 16, bottom: 26 };

/**
 * One row per category: share of the chart (bar, left) and staying rate with its 95% Wilson
 * interval (dot + range, right), against the overall rate (reference line).
 */
export function RateDots({ rows, overall }: { rows: RateRow[]; overall: number }) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useGSAP(() => drawIn(svg.current), { dependencies: [rows.length] });

  const labelW = Math.min(150, width * 0.3);
  const shareW = Math.min(130, width * 0.22);
  const gap = 24;
  const rateX0 = labelW + shareW + gap;
  const height = M.top + rows.length * ROW + M.bottom;
  const maxShare = Math.max(...rows.map((r) => r.share));
  const shareX = linear([0, maxShare], [labelW, labelW + shareW - 8]);
  const maxRate = Math.min(1, Math.max(...rows.map((r) => r.high)) * 1.08);
  const rx = linear([0, maxRate], [rateX0, width - M.right]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= maxRate);

  return (
    <div ref={wrap} className="relative">
      <svg ref={svg} width={width} height={height} role="img"
        aria-label="Share of chart and multi-day rate with 95% confidence interval by category">
        <text x={labelW} y={0} dy="0.9em" className="fill-ink-3 text-[11px]">Share of chart</text>
        <text x={rateX0} y={0} dy="0.9em" className="fill-ink-3 text-[11px]">Stays a second day (95% CI)</text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={rx(t)} x2={rx(t)} y1={M.top - 4} y2={height - M.bottom + 4} stroke="var(--grid)" />
          </g>
        ))}
        <line x1={rx(overall)} x2={rx(overall)} y1={M.top - 14} y2={height - M.bottom + 4}
          stroke="var(--text-secondary)" strokeDasharray="0" strokeOpacity={0.55} />
        <text x={rx(overall) + 4} y={M.top - 8} className="fill-ink-3 text-[10px]">
          all videos {pct(overall)}
        </text>
        {rows.map((r, i) => {
          const cy = M.top + i * ROW + ROW / 2;
          const active = hover === i;
          return (
            <g key={r.label} opacity={hover == null || active ? 1 : 0.45} className="transition-opacity">
              <text x={0} y={cy} dy="0.32em" className="fill-ink-2 text-[12.5px]">{r.label}</text>
              <rect data-draw="grow-x" x={labelW} y={cy - 5} height={10} rx={4}
                width={Math.max(2, shareX(r.share) - labelW)} fill={r.color} />
              <text x={shareX(r.share) + 6} y={cy} dy="0.32em" className="fill-ink-3 text-[11px] tabular-nums">
                {pct(r.share, 0)}
              </text>
              <line data-draw="grow-x" x1={rx(r.low)} x2={rx(r.high)} y1={cy} y2={cy}
                stroke={r.color} strokeWidth={2} strokeLinecap="round" strokeOpacity={0.7} />
              <circle data-draw="pop" cx={rx(r.rate)} cy={cy} r={5.5} fill={r.color}
                stroke="var(--surface-1)" strokeWidth={2} />
              <rect x={0} y={cy - ROW / 2} width={width} height={ROW} fill="transparent"
                tabIndex={0} aria-label={`${r.label}: ${pct(r.rate)} stay, ${pct(r.share)} of chart`}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
        {ticks.map((t) => (
          <text key={t} x={rx(t)} y={height - 6} textAnchor="middle" className="fill-ink-3 text-[10px] tabular-nums">
            {t * 100}%
          </text>
        ))}
      </svg>
      {hover != null && rows[hover] && (
        <Tooltip
          x={rx(rows[hover]!.rate)}
          y={M.top + hover * ROW}
          containerWidth={width}
          title={rows[hover]!.label}
          rows={[
            { key: "rate", label: "stay a second day", value: pct(rows[hover]!.rate) },
            { key: "ci", label: "95% interval", value: `${pct(rows[hover]!.low)}–${pct(rows[hover]!.high)}` },
            { key: "share", label: "of chart videos", value: pct(rows[hover]!.share) },
            { key: "n", label: "labelled videos", value: rows[hover]!.n.toLocaleString() },
          ]}
        />
      )}
    </div>
  );
}
