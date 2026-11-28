import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChannelAvatar } from "@/components/avatar";
import { LineChart } from "@/components/charts/line-chart";
import { Reveal } from "@/components/motion";
import { Panel } from "@/components/panel";
import { VideoRow } from "@/components/video-card";
import { categoryColor } from "@/lib/categories";
import { compact, longDate, pct, shortDate } from "@/lib/format";
import { observedDays, run, upNext, videoDays, videoDetail, videoPrediction, type FeedVideo } from "@/lib/queries";
import { duration, thumb } from "@/lib/video";

export const revalidate = 3600;

type Detail = {
  video_id: string; title: string; published_at: string; category_id: number | null;
  duration_sec: number | null; description: string | null;
  channel_id: string; channel_title: string; category: string | null;
  first_chart_date: string; last_chart_date: string; first_streak_days: number;
  total_days_on_chart: number; n_streaks: number; first_chart_size: number;
  best_chart_position: number | null; label_observable: boolean; is_multiday: boolean;
  left_truncated: boolean; right_censored: boolean; first_day_views: number | null;
  peak_views: number | null; engagement: number | null;
};
type Day = { day: string; position: number | null; views: number | null; views_per_day: number | null };

async function load(id: string) {
  const [[detail], days, [prediction]] = await Promise.all([
    run<Detail>(videoDetail, [id]),
    run<Day>(videoDays, [id]),
    run<{ probability: number; in_sample: boolean; model: string; threshold: number }>(videoPrediction, [id]),
  ]);
  return { detail, days, prediction };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { detail } = await load((await params).id);
  return { title: detail?.title ?? "Video" };
}

function outcome(d: Detail): { label: string; note: string; tone: "good" | "plain" | "unknown" } {
  if (d.left_truncated)
    return { label: "Not labelled", tone: "unknown", note: "It may have charted before the data starts, so its first run can't be measured." };
  if (!d.label_observable)
    return { label: "Not labelled", tone: "unknown", note: "The day after its first chart day was never captured, so the outcome is unknown." };
  return d.is_multiday
    ? { label: `Stayed ${d.first_streak_days} days`, tone: "good", note: "Its first run on the chart lasted more than one day." }
    : { label: "One day", tone: "plain", note: "It left the chart after its first day." };
}

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** One square per calendar day from first to last chart day: on the chart, off it, or not captured. */
function ChartRun({ days, observed, first, last }: { days: Day[]; observed: string[]; first: string; last: string }) {
  const on = new Set(days.map((d) => d.day));
  const seen = new Set(observed);
  const start = toTime(first);
  const count = Math.round((toTime(last) - start) / DAY) + 1;
  const cells = Array.from({ length: Math.min(count, 120) }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
  const state = (d: string) => (on.has(d) ? "on" : seen.has(d) ? "off" : "missing");
  const style = {
    on: "bg-accent",
    off: "bg-surface-3",
    missing: "border border-dashed border-ink-3/60",
  } as const;
  const label = { on: "on the chart", off: "off the chart", missing: "no complete capture" } as const;
  return (
    <div>
      <ul className="flex flex-wrap gap-1" aria-label="Days on the chart">
        {cells.map((d) => (
          <li key={d} title={`${shortDate(d)}: ${label[state(d)]}`} className={`size-4 rounded-[4px] ${style[state(d)]}`} />
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        {(["on", "off", "missing"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-[3px] ${style[k]}`} />
            {label[k]}
          </li>
        ))}
        <li>{shortDate(first)} → {shortDate(last)}</li>
      </ul>
    </div>
  );
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { detail, days, prediction } = await load((await params).id);
  if (!detail) notFound();
  const [related, observed] = await Promise.all([
    run<FeedVideo>(upNext, [detail.video_id, detail.channel_id, detail.category_id ?? -1]),
    run<{ day: string }>(observedDays, [detail.first_chart_date, detail.last_chart_date]),
  ]);
  const result = outcome(detail);
  const start = days[0] ? toTime(days[0].day) : 0;
  const views = days
    .filter((d) => d.views != null)
    .map((d) => ({ x: Math.round((toTime(d.day) - start) / DAY) + 1, y: d.views }));
  const youtube = `https://www.youtube.com/watch?v=${encodeURIComponent(detail.video_id)}`;
  const length = duration(detail.duration_sec);

  return (
    <Reveal className="mx-auto grid max-w-[1700px] gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_402px]">
      <div className="min-w-0 space-y-4">
        <a data-reveal href={youtube} target="_blank" rel="noreferrer"
          className="group relative block aspect-video overflow-hidden rounded-xl bg-black" aria-label="Watch on YouTube (opens a new tab)">
          <Image src={thumb(detail.video_id, "hq")} alt="" fill priority sizes="(min-width: 1024px) 70vw, 100vw"
            className="object-cover opacity-90 transition duration-700 group-hover:scale-[1.02] group-hover:opacity-100" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <span className="absolute left-1/2 top-1/2 grid size-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-black/70 text-white backdrop-blur transition duration-300 group-hover:scale-110 group-hover:bg-accent">
            <svg viewBox="0 0 24 24" className="ml-1 size-8" fill="currentColor" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>
          </span>
          <span className="absolute bottom-3 left-4 text-xs text-white/80">Opens on YouTube</span>
          {length && <span className="absolute bottom-3 right-4 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">{length}</span>}
        </a>

        <h1 data-reveal className="text-xl font-bold leading-snug text-ink sm:text-[22px]">{detail.title}</h1>

        <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/?channel=${encodeURIComponent(detail.channel_id)}`} className="flex items-center gap-3">
            <ChannelAvatar name={detail.channel_title} id={detail.channel_id} size={40} />
            <span>
              <span className="block font-semibold text-ink">{detail.channel_title}</span>
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <span className="size-1.5 rounded-full" style={{ background: categoryColor(detail.category) }} />
                {detail.category ?? "Unknown category"}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/?channel=${encodeURIComponent(detail.channel_id)}`}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90">
              Channel videos
            </Link>
            <a href={youtube} target="_blank" rel="noreferrer"
              className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3">
              Watch ↗
            </a>
          </div>
        </div>

        {/* The "description box": analytics summary first, the video's own description folded below. */}
        <section data-reveal className="rounded-xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold text-ink">
            {compact(detail.peak_views)} views at peak · {detail.total_days_on_chart} day{detail.total_days_on_chart === 1 ? "" : "s"} on chart · first charted {longDate(detail.first_chart_date)}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-3">Outcome</p>
              <p className={`mt-1 text-lg font-semibold ${result.tone === "good" ? "text-[#0ca30c]" : "text-ink"}`}>{result.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{result.note}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3">Model said, on day one</p>
              <p className="mt-1 text-lg font-semibold text-ink">{prediction ? `${pct(prediction.probability, 0)} chance` : "Not scored"}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">
                {prediction
                  ? `of a second day${prediction.in_sample ? " (training period, so in-sample)" : ""}.`
                  : "Only videos with a complete first chart day get a prediction."}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-3">First day</p>
              <p className="mt-1 text-lg font-semibold text-ink">{compact(detail.first_day_views)} views</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">
                {detail.engagement != null ? `${pct(detail.engagement, 1)} liked or commented` : "Engagement unknown"} · published {longDate(detail.published_at)}
              </p>
            </div>
          </div>
          {detail.description && (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none font-semibold text-ink">
                <span className="group-open:hidden">…more</span>
                <span className="hidden group-open:inline">Show less</span>
              </summary>
              <p className="mt-3 whitespace-pre-line break-words text-ink-2">{detail.description}</p>
            </details>
          )}
        </section>

        <Panel title="Chart run" subtitle="Every calendar day between its first and last appearance." query={observedDays}>
          <ChartRun days={days} observed={observed.map((o) => o.day)} first={detail.first_chart_date} last={detail.last_chart_date} />
        </Panel>

        <Panel title="Views while on the chart" subtitle="Total views at each daily capture." query={videoDays}>
          {views.length > 1 ? (
            <LineChart area series={[{ key: "views", label: "Views", color: "var(--series-1)", points: views }]}
              yFormat="compact" xFormat="day" xLabel="Day on chart" />
          ) : (
            <p className="py-8 text-center text-sm text-ink-3">Only one day of data for this video.</p>
          )}
        </Panel>
      </div>

      <aside className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Up next</h2>
          <Link href="/sql#site-queries" className="text-xs text-ink-3 hover:text-ink">
            same channel, then {detail.category ?? "category"} · SQL
          </Link>
        </div>
        <ul className="space-y-3">
          {related.map((v) => (
            <li key={v.video_id} data-reveal><VideoRow v={v} /></li>
          ))}
        </ul>
      </aside>
    </Reveal>
  );
}
