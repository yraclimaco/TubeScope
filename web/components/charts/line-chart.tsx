"use client";

import { useGSAP } from "@gsap/react";
import { curveMonotoneX, line } from "d3-shape";
import { useRef, useState } from "react";
import { type Fmt, formatter } from "@/lib/format";
import { drawIn } from "./animate";
import { Legend, Tooltip } from "./tooltip";
import { linear, niceTicks, useWidth } from "./use-size";

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number | null }[];
}

/** Line chart with a snapping crosshair. One y-axis only. */
export function LineChart({
  series,
  xLabel,
  yFormat: yFmt,
  xFormat: xFmt,
  height = 240,
  yMax,
  reference,
  area,
}: {
  series: Series[];
  xLabel?: string;
  yFormat: Fmt;
  xFormat?: Fmt;
  height?: number;
  yMax?: number;
  reference?: { y: number; label: string };
  area?: boolean;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const yFormat = formatter(yFmt);
  const xFormat = xFmt ? formatter(xFmt) : (v: number) => String(v);
  useGSAP(() => drawIn(svg.current), { dependencies: [series.length] });

  const M = { top: 10, right: 16, bottom: xLabel ? 40 : 26, left: 52 };
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const ys = series.flatMap((s) => s.points.map((p) => p.y ?? 0));
  const top = yMax ?? Math.max(reference?.y ?? 0, ...ys) * 1.08;
  const ticks = niceTicks(top, 4);
  const yTop = ticks[ticks.length - 1] ?? top;
  const x = linear([xs[0] ?? 0, xs[xs.length - 1] ?? 1], [M.left, width - M.right]);
  const y = linear([0, yTop], [height - M.bottom, M.top]);

  const path = (s: Series) =>
    line<{ x: number; y: number | null }>()
      .defined((p) => p.y != null)
      .x((p) => x(p.x))
      .y((p) => y(p.y ?? 0))
      .curve(curveMonotoneX)(s.points) ?? "";

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + M.left;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(x(v) - px) < Math.abs(x(xs[best]!) - px)) best = i;
    });
    setHover(best);
  };

  const xTickEvery = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor((width - 80) / 70))));

  return (
    <div className="space-y-3">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color, shape: "line" }))} />}
      <div ref={wrap} className="relative">
        <svg ref={svg} width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {xs.map((v, i) =>
            i % xTickEvery === 0 ? (
              <text key={v} x={x(v)} y={height - M.bottom + 16} textAnchor="middle" className="fill-ink-3 text-[11px] tabular-nums">
                {xFormat(v)}
              </text>
            ) : null,
          )}
          {xLabel && (
            <text x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle" className="fill-ink-3 text-[11px]">
              {xLabel}
            </text>
          )}
          {reference && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={y(reference.y)} y2={y(reference.y)}
                stroke="var(--text-secondary)" strokeOpacity={0.5} />
              <text x={width - M.right} y={y(reference.y) - 6} textAnchor="end" className="fill-ink-3 text-[10px]">
                {reference.label}
              </text>
            </g>
          )}
          {series.map((s) => (
            <g key={s.key}>
              {area && (
                <path data-draw="fade"
                  d={`${path(s)}L${x(s.points.at(-1)?.x ?? 0)},${y(0)}L${x(s.points[0]?.x ?? 0)},${y(0)}Z`}
                  fill={s.color} fillOpacity={0.1} />
              )}
              <path data-draw="line" d={path(s)} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={x(xs[hover]!)} x2={x(xs[hover]!)} y1={M.top} y2={height - M.bottom}
                stroke="var(--text-primary)" strokeOpacity={0.5} />
              {series.map((s) => {
                const p = s.points.find((q) => q.x === xs[hover]);
                return p?.y != null ? (
                  <circle key={s.key} cx={x(p.x)} cy={y(p.y)} r={4.5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
                ) : null;
              })}
            </g>
          )}
          <rect x={M.left} y={M.top} width={Math.max(0, width - M.left - M.right)} height={height - M.top - M.bottom}
            fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover != null && (
          <Tooltip
            x={x(xs[hover]!)}
            y={M.top}
            containerWidth={width}
            title={xFormat(xs[hover]!)}
            rows={series.flatMap((s) => {
              const p = s.points.find((q) => q.x === xs[hover]);
              return p?.y != null ? [{ key: s.key, color: s.color, label: s.label, value: yFormat(p.y) }] : [];
            })}
          />
        )}
      </div>
    </div>
  );
}
