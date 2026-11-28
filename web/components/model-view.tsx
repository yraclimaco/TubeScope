"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";
import type { ModelReport } from "@/lib/models";
import { int, longDate, num, pct } from "@/lib/format";
import { BarList } from "./charts/bar-list";
import { Calibration } from "./charts/calibration";
import { prefersReducedMotion } from "./motion";

const LABELS: Record<string, string> = {
  prior: "Base rate", category_only: "Category only", logistic: "Logistic regression",
  random_forest: "Random forest", gradient_boosting: "Gradient boosting",
};

const FEATURE_LABELS: Record<string, string> = {
  first_day_views: "First-day views", days_published_before_chart: "Days from publish to chart",
  duration_minutes: "Video length", first_day_engagement_rate: "First-day engagement",
  category_id: "Category", publish_hour_pt: "Publish hour", channel_total_views: "Channel total views",
  channel_video_count: "Channel video count", channel_subscribers: "Channel subscribers",
  title_char_count: "Title length", description_word_count: "Description length",
  channel_country: "Channel country", publish_isodow_pt: "Publish weekday",
  channel_age_days: "Channel age", tags_count: "Tag count", licensed_content: "Licensed content",
  definition: "HD / SD",
};

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      {note && <p className="mt-1 text-sm leading-relaxed text-ink-3">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ModelView({ models }: { models: Partial<Record<"prepublish" | "chartday", ModelReport>> }) {
  const available = (["prepublish", "chartday"] as const).filter((k) => models[k]);
  const [key, setKey] = useState<(typeof available)[number]>(available[0] ?? "prepublish");
  const body = useRef<HTMLDivElement>(null);
  const r = models[key];

  useGSAP(
    () => {
      if (prefersReducedMotion() || !body.current) return;
      gsap.fromTo(body.current.children, { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power2.out" });
    },
    { dependencies: [key] },
  );

  if (!r) return <p className="text-sm text-ink-3">No model reports found. Run `uv run tubescope train`.</p>;
  const t = r.test.all_test;
  const ci = r.test_intervals_95;
  const comparison = Object.entries(r.comparison);
  const vsCategory = r.versus_baselines.category_only?.average_precision;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Model" className="flex gap-2">
          {available.map((k) => (
            <button key={k} role="tab" aria-selected={key === k} type="button" onClick={() => setKey(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${key === k ? "bg-ink text-bg" : "bg-surface-2 text-ink hover:bg-surface-3"}`}>
              {k === "prepublish" ? "Before publishing" : "After day one"}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-3">{r.feature_set_description}</p>
      </div>

      <div ref={body} className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["ROC AUC", num(t.roc_auc), `95% CI ${num(ci.roc_auc[0])}–${num(ci.roc_auc[1])}`],
            ["Average precision", num(t.average_precision), `vs. ${num(t.base_rate)} for guessing`],
            ["Top 10% precision", pct(t.precision_top10pct, 0), `${num(t.lift_top10pct, 1)}× the base rate`],
            ["Recall at threshold", pct(t.recall, 0), `precision ${pct(t.precision, 0)} · flags ${pct(t.flagged_rate, 0)}`],
          ].map(([label, value, detail]) => (
            <div key={label} className="card px-5 py-4">
              <p className="text-xs text-ink-3">{label}</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-ink-3">{detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Against the baselines"
            note={<>Average precision on held-out days ({longDate(r.data.test_range[0])} – {longDate(r.data.test_range[1])}).
              {vsCategory && <> The chosen model beats category-only by {num(vsCategory.difference)} (95% CI {num(vsCategory.ci_low)} to {num(vsCategory.ci_high)}).</>}</>}>
            <BarList
              max={Math.max(...comparison.map(([, v]) => v.test.average_precision))}
              items={comparison.map(([name, v]) => ({
                key: name,
                label: <>{LABELS[name] ?? name}{name === r.estimator && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-ink">chosen</span>}</>,
                value: v.test.average_precision,
                display: num(v.test.average_precision),
                color: name === r.estimator ? "var(--series-1)" : "var(--series-other)",
                muted: v.baseline,
              }))}
            />
          </Card>

          <Card title="Are the probabilities honest?"
            note={`Held-out videos split into ${r.calibration_test.length} equal groups. Calibration error ${num(t.ece, 3)}: when the model says 40%, roughly 40% stay.`}>
            <Calibration bins={r.calibration_test} />
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="What drives the prediction"
            note="Drop in held-out average precision when one input is shuffled. Correlated inputs share credit (length partly stands in for category), so this ranks usefulness, not causes.">
            <BarList
              items={r.permutation_importance_test.slice(0, 10).map((f) => ({
                key: f.feature,
                label: FEATURE_LABELS[f.feature] ?? f.feature,
                value: Math.max(0, f.ap_drop_mean),
                display: num(f.ap_drop_mean, 3),
                color: "var(--series-1)",
              }))}
            />
          </Card>

          <Card title="How it was tested" note="Choices that keep these numbers honest.">
            <dl className="space-y-3 text-sm">
              {[
                ["Data", `${int(r.data.labelled_rows)} labelled videos from ${int(r.data.channels)} channels, ${longDate(r.data.date_range[0])} – ${longDate(r.data.date_range[1])}. Base rate ${pct(r.data.base_rate)}.`],
                ["Held out", `The last ${int(r.data.test_rows)} videos by date, never used for tuning or picking the model. ${int(r.data.embargoed_rows)} videos from the day before were dropped so no training label peeks into the test period.`],
                ["Grouped by channel", "Cross-validation kept each channel's videos in one fold, so the model can't memorise a channel."],
                ["New channels", r.test.new_channels ? `On ${int(r.test.new_channels.n)} test videos from channels never seen in training: ROC AUC ${num(r.test.new_channels.roc_auc)}.` : "–"],
                ["Random split", `The original project's random split would report ROC AUC ${num(r.protocol_comparison.random_split?.roc_auc)} for this setup, vs. ${num(t.roc_auc)} on later days.`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="leading-relaxed text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <Card title="By category" note="Average predicted vs. observed staying rate on held-out days.">
          <BarList
            max={1}
            items={r.by_category_test.flatMap((c) => [
              { key: `${c.category}-o`, label: `${c.category} · observed`, value: c.observed_rate, display: pct(c.observed_rate), color: "var(--series-1)" },
              { key: `${c.category}-p`, label: `${c.category} · predicted`, value: c.mean_predicted, display: pct(c.mean_predicted), color: "var(--series-2)", muted: true },
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
