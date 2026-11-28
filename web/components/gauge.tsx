"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { prefersReducedMotion } from "./motion";

/** Semicircle meter. The arc and number tween to each new probability. */
export function Gauge({ value, threshold }: { value: number | null; threshold: number }) {
  const arc = useRef<SVGPathElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const state = useRef({ v: 0 });
  const R = 88;
  const length = Math.PI * R;

  useGSAP(
    () => {
      if (value == null) return;
      const apply = () => {
        arc.current?.setAttribute("stroke-dashoffset", String(length * (1 - state.current.v)));
        if (label.current) label.current.textContent = `${Math.round(state.current.v * 100)}%`;
      };
      if (prefersReducedMotion()) {
        state.current.v = value;
        apply();
        return;
      }
      gsap.to(state.current, { v: value, duration: 0.9, ease: "power3.out", onUpdate: apply, overwrite: true });
    },
    { dependencies: [value] },
  );

  const tx = 110 - R * Math.cos(Math.PI * threshold);
  const ty = 104 - R * Math.sin(Math.PI * threshold);
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 220 120" className="w-full" role="img" aria-label={value == null ? "No prediction" : `${Math.round(value * 100)}% chance`}>
        <path d={`M${110 - R},104 A${R},${R} 0 0 1 ${110 + R},104`} fill="none" stroke="color-mix(in oklab, var(--series-1) 22%, var(--surface-2))" strokeWidth={14} strokeLinecap="round" />
        <path ref={arc} d={`M${110 - R},104 A${R},${R} 0 0 1 ${110 + R},104`} fill="none" stroke="var(--series-1)" strokeWidth={14}
          strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length} />
        <circle cx={tx} cy={ty} r={3} fill="var(--text-primary)" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span ref={label} className="text-5xl font-semibold tracking-tight text-ink tabular-nums">–</span>
      </div>
    </div>
  );
}
