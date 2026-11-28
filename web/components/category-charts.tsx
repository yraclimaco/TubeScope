"use client";

import { pct } from "@/lib/format";
import { divergingColor, Heatmap, sequentialColor } from "./charts/heatmap";

const BUCKETS = ["0-1 min", "1-3 min", "3-5 min", "5-10 min", "10-20 min", "20-60 min", "60+ min"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DurationLiftHeatmap({
  rows,
}: {
  rows: { category: string; bucket: string; labelled: number; rate: number | null; lift: number | null }[];
}) {
  const categories = [...new Set(rows.map((r) => r.category))];
  return (
    <Heatmap
      rows={categories}
      cols={BUCKETS}
      minN={30}
      labelWidth={130}
      cells={rows.map((r) => ({ row: r.category, col: r.bucket, value: r.lift, n: r.labelled }))}
      color={(v) => divergingColor(v, 1, 1)}
      showValues={(c) => (c.value == null ? null : `${c.value.toFixed(1)}×`)}
      tooltip={(c) => {
        const row = rows.find((r) => r.category === c.row && r.bucket === c.col);
        return {
          title: `${c.row} · ${c.col}`,
          rows:
            c.n < 30
              ? [{ key: "n", label: "labelled videos: too few to compare", value: String(c.n) }]
              : [
                  { key: "lift", label: "vs. category average", value: `${c.value?.toFixed(2)}×` },
                  { key: "rate", label: "stay a second day", value: pct(row?.rate) },
                  { key: "n", label: "labelled videos", value: c.n.toLocaleString() },
                ],
        };
      }}
    />
  );
}

export function TimingHeatmap({
  rows,
}: {
  rows: { dow: number; hour: number; labelled: number; rate: number | null }[];
}) {
  const hours = Array.from({ length: 24 }, (_, h) => String(h));
  const max = Math.max(...rows.filter((r) => r.labelled >= 20).map((r) => r.rate ?? 0), 0.01);
  const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
  return (
    <Heatmap
      rows={DAYS}
      cols={hours}
      minN={20}
      cellHeight={28}
      labelWidth={48}
      colLabel={(c) => fmtHour(Number(c))}
      cells={rows.map((r) => ({ row: DAYS[r.dow - 1]!, col: String(r.hour), value: r.rate, n: r.labelled }))}
      color={(v) => sequentialColor(v / max)}
      tooltip={(c) => ({
        title: `${c.row} ${fmtHour(Number(c.col))} PT`,
        rows:
          c.n < 20
            ? [{ key: "n", label: "labelled videos: too few", value: String(c.n) }]
            : [
                { key: "rate", label: "stay a second day", value: pct(c.value) },
                { key: "n", label: "labelled videos", value: c.n.toLocaleString() },
              ],
      })}
    />
  );
}
