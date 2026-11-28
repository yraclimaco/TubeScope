"use client";

import { useGSAP } from "@gsap/react";
import { useRef, useState } from "react";
import { drawIn } from "./animate";
import { Tooltip, type TooltipRow } from "./tooltip";
import { useWidth } from "./use-size";

export interface Cell {
  row: string;
  col: string;
  value: number | null;
  n: number;
}

/** Diverging fill around a midpoint: red below, gray at it, blue above (dataviz pair). */
export function divergingColor(value: number, mid: number, span: number): string {
  const t = Math.max(-1, Math.min(1, (value - mid) / span));
  const pole = t >= 0 ? "#3987e5" : "#e66767";
  return `color-mix(in oklab, #383835, ${pole} ${Math.round(Math.abs(t) * 100)}%)`;
}

/** Sequential single-hue fill (blue), dark surface -> bright. */
export function sequentialColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  return `color-mix(in oklab, #1c2a3d, #86b6ef ${Math.round(c * 100)}%)`;
}

export function Heatmap({
  rows,
  cols,
  cells,
  color,
  minN,
  tooltip,
  colLabel = (c) => c,
  cellHeight = 34,
  labelWidth = 120,
  showValues,
}: {
  rows: string[];
  cols: string[];
  cells: Cell[];
  color: (v: number) => string;
  minN: number;
  tooltip: (cell: Cell) => { title: string; rows: TooltipRow[] };
  colLabel?: (c: string, i: number) => string;
  cellHeight?: number;
  labelWidth?: number;
  showValues?: (cell: Cell) => string | null;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  useGSAP(() => drawIn(svg.current), { dependencies: [cells.length] });

  const lw = Math.min(labelWidth, width * 0.28);
  const top = 22;
  const cw = (width - lw) / cols.length;
  const height = top + rows.length * cellHeight;
  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  const labelEvery = Math.max(1, Math.ceil(36 / cw));

  return (
    <div ref={wrap} className="relative">
      <svg ref={svg} width={width} height={height} role="img" aria-label="Heatmap">
        <defs>
          <pattern id="few" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface-3)" strokeWidth="2" />
          </pattern>
        </defs>
        {cols.map((c, j) =>
          j % labelEvery === 0 ? (
            <text key={c} x={lw + j * cw + cw / 2} y={12} textAnchor="middle" className="fill-ink-3 text-[11px]">
              {colLabel(c, j)}
            </text>
          ) : null,
        )}
        {rows.map((r, i) => (
          <text key={r} x={0} y={top + i * cellHeight + cellHeight / 2} dy="0.32em" className="fill-ink-2 text-[12px]">
            {r}
          </text>
        ))}
        {rows.map((r, i) =>
          cols.map((c, j) => {
            const cell = lookup.get(`${r}|${c}`) ?? { row: r, col: c, value: null, n: 0 };
            const few = cell.value == null || cell.n < minN;
            const active = hover?.row === r && hover?.col === c;
            const label = !few && showValues ? showValues(cell) : null;
            return (
              <g key={`${r}|${c}`}>
                <rect data-draw="fade" x={lw + j * cw + 1} y={top + i * cellHeight + 1}
                  width={Math.max(1, cw - 2)} height={cellHeight - 2} rx={4}
                  fill={few ? "url(#few)" : color(cell.value!)}
                  stroke={active ? "var(--text-primary)" : "none"} strokeWidth={1.5}
                  tabIndex={0}
                  onPointerEnter={() => setHover(cell)} onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(cell)} onBlur={() => setHover(null)} />
                {label && cw > 40 && (
                  <text x={lw + j * cw + cw / 2} y={top + i * cellHeight + cellHeight / 2} dy="0.32em"
                    textAnchor="middle" className="pointer-events-none fill-white text-[11px] font-medium tabular-nums">
                    {label}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      {hover && (() => {
        const j = cols.indexOf(hover.col);
        const i = rows.indexOf(hover.row);
        const t = tooltip(hover);
        return (
          <Tooltip x={lw + j * cw + cw / 2} y={top + i * cellHeight} containerWidth={width} title={t.title} rows={t.rows} />
        );
      })()}
    </div>
  );
}
