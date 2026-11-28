"use client";

import { useGSAP } from "@gsap/react";
import { useRef, useState } from "react";
import { pct } from "@/lib/format";
import { drawIn } from "./animate";
import { Tooltip } from "./tooltip";
import { linear, useWidth } from "./use-size";

/** Predicted vs. observed rate per bin; on the diagonal = calibrated. */
export function Calibration({ bins }: { bins: { n: number; mean_predicted: number; observed_rate: number }[] }) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useGSAP(() => drawIn(svg.current), { dependencies: [bins] });
  const size = Math.min(width, 380);
  const M = 40;
  const top = Math.min(1, Math.max(...bins.flatMap((b) => [b.mean_predicted, b.observed_rate])) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= top + 1e-9);
  const x = linear([0, top], [M, size - 12]);
  const y = linear([0, top], [size - M, 12]);
  const d = bins.map((b, i) => `${i ? "L" : "M"}${x(b.mean_predicted)},${y(b.observed_rate)}`).join("");
  return (
    <div ref={wrap} className="relative">
      <svg ref={svg} width={size} height={size} role="img" aria-label="Calibration: predicted vs observed rate">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(top)} stroke="var(--grid)" />
            <line x1={x(0)} x2={x(top)} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={x(t)} y={size - M + 16} textAnchor="middle" className="fill-ink-3 text-[11px]">{pct(t, 0)}</text>
            <text x={M - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px]">{pct(t, 0)}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(top)} y2={y(top)} stroke="var(--text-secondary)" strokeOpacity={0.45} />
        <text x={x(top) - 4} y={y(top) + 14} textAnchor="end" className="fill-ink-3 text-[10px]">perfectly calibrated</text>
        <path data-draw="line" d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {bins.map((b, i) => (
          <g key={i}>
            <circle data-draw="pop" cx={x(b.mean_predicted)} cy={y(b.observed_rate)} r={hover === i ? 6 : 4.5}
              fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={x(b.mean_predicted)} cy={y(b.observed_rate)} r={13} fill="transparent" tabIndex={0}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          </g>
        ))}
        <text x={(M + size) / 2} y={size - 4} textAnchor="middle" className="fill-ink-3 text-[11px]">Predicted</text>
        <text transform={`translate(10 ${size / 2 - 20}) rotate(-90)`} textAnchor="middle" className="fill-ink-3 text-[11px]">Observed</text>
      </svg>
      {hover != null && bins[hover] && (
        <Tooltip x={x(bins[hover]!.mean_predicted)} y={y(bins[hover]!.observed_rate) - 20} containerWidth={size}
          title={`Bin ${hover + 1} of ${bins.length}`}
          rows={[
            { key: "p", label: "predicted", value: pct(bins[hover]!.mean_predicted) },
            { key: "o", label: "observed", value: pct(bins[hover]!.observed_rate) },
            { key: "n", label: "videos", value: String(bins[hover]!.n) },
          ]} />
      )}
    </div>
  );
}
