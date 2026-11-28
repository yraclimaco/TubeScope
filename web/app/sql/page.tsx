import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/panel";
import { SqlBlock } from "@/components/sql-block";
import { ALL_QUERIES } from "@/lib/queries";
import views from "@/generated/sql-views.json";

export const metadata: Metadata = { title: "SQL lab" };

type View = { file: string; kind: string; name: string; description: string; sql: string };

// Concepts each view demonstrates, for learning.
const CONCEPTS: Record<string, string[]> = {
  "analytics.wilson_bound": ["SQL functions", "confidence intervals"],
  "analytics.snapshot_coverage": ["window functions (LAG)", "CEIL", "data quality checks"],
  "analytics.video_streaks": ["gaps and islands", "ROW_NUMBER", "LEFT JOIN to neighbouring days"],
  "analytics.video_lifecycle": ["CTEs", "aggregation", "censoring flags"],
  "analytics.video_features": ["point-in-time joins", "CASE buckets", "time zones"],
  "analytics.category_benchmarks": ["FILTER aggregates", "percentile_cont", "window ranks"],
  "analytics.daily_category_share": ["dense grids (CROSS JOIN)", "RANGE window frames"],
  "analytics.video_daily_deltas": ["LAG", "growth rates", "NULLIF"],
  "analytics.channel_performance": ["empirical-Bayes smoothing", "MODE()", "RANK"],
  "analytics.publish_timing": ["FILTER aggregates", "GROUP BY two dimensions"],
  "analytics.duration_by_category": ["within-group comparisons", "lift"],
  "analytics.data_freshness": ["freshness monitoring", "date arithmetic"],
};

export default function SqlLab() {
  const list = views as View[];
  return (
    <Reveal className="mx-auto max-w-6xl pt-4 ">
      <PageHeader eyebrow="SQL lab" title="Every number on this site, in SQL">
        The analysis lives in Postgres views, built in order: each one reads the ones above it.
        Connect Tableau (or any SQL client) to the same views to rebuild these charts yourself.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav data-reveal aria-label="Views" className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-2 text-xs text-ink-3">Build order</p>
          <ol className="space-y-1 text-sm">
            {list.map((v, i) => (
              <li key={v.file}>
                <a href={`#${v.name}`} className="flex gap-2 rounded-md px-2 py-1 text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink">
                  <span className="w-5 text-right font-mono text-xs text-ink-3">{i + 1}</span>
                  <span className="truncate font-mono text-xs">{v.name.replace("analytics.", "")}</span>
                </a>
              </li>
            ))}
            <li>
              <a href="#site-queries" className="mt-3 block rounded-md px-2 py-1 text-xs text-ink-3 hover:text-ink">Queries used by this site →</a>
            </li>
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {list.map((v) => (
            <section key={v.file} id={v.name} data-reveal className="scroll-mt-24 card p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-mono text-sm text-ink">{v.name}</h2>
                <span className="font-mono text-[11px] text-ink-3">db/views/{v.file}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{v.description}</p>
              {CONCEPTS[v.name] && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {CONCEPTS[v.name]!.map((c) => (
                    <li key={c} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-3">{c}</li>
                  ))}
                </ul>
              )}
              <details className="group mt-4">
                <summary className="cursor-pointer list-none text-xs text-ink-3 transition-colors hover:text-ink">
                  <span className="group-open:hidden">Show SQL ↓</span>
                  <span className="hidden group-open:inline">Hide SQL ↑</span>
                </summary>
                <SqlBlock sql={v.sql} className="mt-3" />
              </details>
            </section>
          ))}

          <section id="site-queries" className="scroll-mt-24 space-y-4 pt-6">
            <h2 data-reveal className="text-lg font-semibold tracking-tight text-ink">Queries used by this site</h2>
            {ALL_QUERIES.map((q) => (
              <div key={q.id} data-reveal className="card p-5">
                <p className="text-sm font-medium text-ink">{q.title}</p>
                <SqlBlock sql={q.text} className="mt-3" />
              </div>
            ))}
          </section>
        </div>
      </div>
    </Reveal>
  );
}
