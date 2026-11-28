"use client";

export interface TooltipRow {
  key: string;
  color?: string;
  label: string;
  value: string;
}

/** Positioned inside a `relative` chart container. Values lead; series names follow. */
export function Tooltip({
  x,
  y,
  title,
  rows,
  containerWidth,
}: {
  x: number;
  y: number;
  title?: string;
  rows: TooltipRow[];
  containerWidth: number;
}) {
  const flip = x > containerWidth - 200;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-36 rounded-lg border border-border bg-surface-3/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur"
      style={{
        left: flip ? undefined : x + 14,
        right: flip ? containerWidth - x + 14 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      {title && <p className="mb-1.5 text-ink-3">{title}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
            <span className="font-semibold text-ink tabular-nums">{r.value}</span>
            <span className="text-ink-2">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "rect" | "line" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={item.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
