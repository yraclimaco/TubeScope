"use client";

import { useGSAP } from "@gsap/react";
import { area, curveMonotoneX } from "d3-shape";
import { useMemo, useRef, useState } from "react";
import { shortDate } from "@/lib/format";
import { drawIn } from "./animate";
import { Legend, Tooltip } from "./tooltip";
import { linear, useWidth } from "./use-size";

export interface ShareRow {
  day: string;
  category: string;
  share: number;
}

const HEIGHT = 280;
const M = { top: 8, right: 12, bottom: 28, left: 40 };

/** 100% stacked area of the chart's category mix, one layer per series (fixed colours). */
export function StackedArea({
  rows,
  series,
  colors,
}: {
  rows: ShareRow[];
  series: string[];
  colors: Record<string, string>;
}) {
  const color = (k: string) => colors[k] ?? "var(--series-other)";
  const [wrap, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { days, stacks } = useMemo(() => {
    const byDay = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!byDay.has(r.day)) byDay.set(r.day, new Map());
      byDay.get(r.day)!.set(r.category, r.share);
    }
    const days = [...byDay.keys()].sort();
    // Normalise each day to 100% so the stack is a clean part-to-whole.
    const stacks = days.map((day) => {
      const m = byDay.get(day)!;
      const total = series.reduce((s, k) => s + (m.get(k) ?? 0), 0) || 1;
      let acc = 0;
      return series.map((k) => {
        const v = (m.get(k) ?? 0) / total;
        const seg = { key: k, y0: acc, y1: acc + v, v };
        acc += v;
        return seg;
      });
    });
    return { days, stacks };
  }, [rows, series]);

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const x = linear([0, Math.max(1, days.length - 1)], [M.left, M.left + innerW]);
  const y = linear([0, 1], [M.top + innerH, M.top]);

  useGSAP(() => drawIn(svg.current), { dependencies: [days.length] });

  const paths = series.map((key, si) => {
    const shape = area<(typeof stacks)[number]>()
      .x((_, i) => x(i))
      .y0((st) => y(st[si]!.y0))
      .y1((st) => y(st[si]!.y1))
      .curve(curveMonotoneX);
    return { key, d: shape(stacks) ?? "" };
  });

  const tickEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 90))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (days.length - 1));
    setHover(Math.min(days.length - 1, Math.max(0, i)));
  };

  return (
    <div className="space-y-3">
      <Legend items={series.map((s) => ({ label: s, color: color(s) }))} />
      <div ref={wrap} className="relative">
        <svg ref={svg} width={width} height={HEIGHT} role="img"
          aria-label="Stacked area chart of the daily share of chart videos by category">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          <g data-draw="wipe">
            {paths.map((p) => (
              <path key={p.key} d={p.d} fill={color(p.key)} fillOpacity={0.82}
                stroke="var(--surface-1)" strokeWidth={2} strokeLinejoin="round" />
            ))}
          </g>
          {days.map((d, i) =>
            i % tickEvery === 0 ? (
              <text key={d} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
                {shortDate(d)}
              </text>
            ) : null,
          )}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} stroke="var(--text-primary)" strokeOpacity={0.6} />
          )}
          <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover != null && stacks[hover] && (
          <Tooltip
            x={x(hover)}
            y={M.top}
            containerWidth={width}
            title={shortDate(days[hover]!)}
            rows={[...stacks[hover]!].reverse().map((s) => ({
              key: s.key,
              color: color(s.key),
              label: s.key,
              value: `${(s.v * 100).toFixed(1)}%`,
            }))}
          />
        )}
      </div>
    </div>
  );
}
