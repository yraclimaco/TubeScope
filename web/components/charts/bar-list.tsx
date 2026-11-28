"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { drawIn } from "./animate";

export interface BarItem {
  key: string;
  label: React.ReactNode;
  value: number;
  display: string;
  color?: string;
  muted?: boolean;
  low?: number;
  high?: number;
}

/** Horizontal bars as HTML rows: label, bar (<=12px, rounded data-end), value at the tip. */
export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const ref = useRef<HTMLUListElement>(null);
  useGSAP(() => drawIn(ref.current), { dependencies: [items.length] });
  const top = max ?? Math.max(...items.map((i) => i.high ?? i.value), 1e-9);
  return (
    <ul ref={ref} className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_1fr]">
          <span className={`truncate text-[13px] ${item.muted ? "text-ink-3" : "text-ink-2"}`}>{item.label}</span>
          <span className="relative flex h-5 items-center">
            <span
              data-draw="grow-x"
              className="h-2.5 rounded-r-[4px]"
              style={{
                width: `${Math.max(0.5, (item.value / top) * 82)}%`,
                background: item.color ?? "var(--series-1)",
                opacity: item.muted ? 0.45 : 1,
              }}
            />
            {item.low != null && item.high != null && (
              <span
                className="absolute h-px bg-ink-2"
                style={{ left: `${(item.low / top) * 82}%`, width: `${((item.high - item.low) / top) * 82}%` }}
              />
            )}
            <span className="ml-2 text-xs text-ink-2 tabular-nums">{item.display}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
