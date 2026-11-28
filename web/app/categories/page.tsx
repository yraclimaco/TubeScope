import type { Metadata } from "next";
import { DurationLiftHeatmap, TimingHeatmap } from "@/components/category-charts";
import { Reveal } from "@/components/motion";
import { PageHeader, Panel } from "@/components/panel";
import { RateDots } from "@/components/charts/rate-dots";
import { StackedArea } from "@/components/charts/stacked-area";
import { CATEGORY_COLOR, categoryColor, SERIES_ORDER } from "@/lib/categories";
import { num, pct } from "@/lib/format";
import { categoryBenchmarks, categoryShareOverTime, durationByCategory, publishTiming, run } from "@/lib/queries";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Categories" };

type Bench = {
  category: string; videos: number; share: number; labelled: number; rate: number; rate_low: number;
  rate_high: number; lift: number; overall_rate: number; median_minutes: number; engagement_median: number;
};

export default async function Categories() {
  const [bench, duration, timing, share] = await Promise.all([
    run<Bench>(categoryBenchmarks),
    run<{ category: string; bucket: string; labelled: number; rate: number | null; lift: number | null }>(durationByCategory),
    run<{ dow: number; hour: number; labelled: number; rate: number | null }>(publishTiming),
    run<{ day: string; category: string; share: number }>(categoryShareOverTime),
  ]);
  const overall = bench[0]?.overall_rate ?? 0;

  return (
    <Reveal className="mx-auto max-w-6xl pt-4  space-y-6">
      <PageHeader eyebrow="Categories" title="Volume isn't staying power">
        Some categories flood the chart; others hold their place. Every rate here comes with a 95%
        Wilson interval, so small categories show how uncertain they are.
      </PageHeader>

      <Panel
        title="Share of chart vs. staying power"
        subtitle={<>Categories with at least 30 labelled videos. The vertical line is the rate across all videos ({pct(overall)}).</>}
        query={categoryBenchmarks}
      >
        <RateDots
          overall={overall}
          rows={bench.map((b) => ({
            label: b.category, rate: b.rate, low: b.rate_low, high: b.rate_high, n: b.labelled,
            share: b.share, color: categoryColor(b.category),
          }))}
        />
      </Panel>

      <Panel
        title="Who owns the chart, day by day"
        subtitle="Share of each day's top-200 chart by category. Gaming fills most of the list every day."
        query={categoryShareOverTime}
      >
        <StackedArea rows={share} series={SERIES_ORDER} colors={CATEGORY_COLOR} />
      </Panel>

      <div id="length" className="scroll-mt-24">
        <Panel
          title="Does length matter within a category?"
          subtitle="Each cell compares a length bucket's staying rate with its own category's average (1.0× = no difference). Hatched cells have fewer than 30 labelled videos."
          query={durationByCategory}
        >
          <DurationLiftHeatmap rows={duration} />
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-24 rounded-full bg-[linear-gradient(90deg,#e66767,#383835,#3987e5)]" />
              below average · same · above average
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(45deg,var(--surface-3)_0_2px,transparent_2px_5px)]" />
              too few videos
            </span>
          </div>
        </Panel>
      </div>

      <Panel
        title="When were staying videos published?"
        subtitle="Staying rate by publish weekday and hour, US Pacific time. Brighter is higher. Hatched cells have fewer than 20 labelled videos; treat single cells as noisy."
        query={publishTiming}
      >
        <TimingHeatmap rows={timing} />
      </Panel>

      <Panel title="Category table" subtitle="The numbers behind the chart above." query={categoryBenchmarks}>
        <div className="scrollbar-thin -mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-border">
                {["Category", "Videos", "Share", "Stay rate", "95% CI", "Lift", "Median length", "Median engagement"].map((h) => (
                  <th key={h} className="px-2 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink-2">
              {bench.map((b) => (
                <tr key={b.category} className="border-b border-border/60 transition-colors hover:bg-surface-2">
                  <td className="px-2 py-2.5 text-ink">
                    <span className="mr-2 inline-block size-2 rounded-full" style={{ background: categoryColor(b.category) }} />
                    {b.category}
                  </td>
                  <td className="px-2">{b.videos.toLocaleString()}</td>
                  <td className="px-2">{pct(b.share)}</td>
                  <td className="px-2 text-ink">{pct(b.rate)}</td>
                  <td className="px-2 text-ink-3">{pct(b.rate_low)}–{pct(b.rate_high)}</td>
                  <td className="px-2">{num(b.lift)}×</td>
                  <td className="px-2">{num(b.median_minutes, 1)} min</td>
                  <td className="px-2">{pct(b.engagement_median, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Reveal>
  );
}
