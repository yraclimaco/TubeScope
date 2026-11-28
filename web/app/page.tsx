import Link from "next/link";
import { ChannelAvatar } from "@/components/avatar";
import { ChipBar, type Chip } from "@/components/chip-bar";
import { HeroField, type HeroPoint } from "@/components/hero-field";
import { CountUp, Reveal } from "@/components/motion";
import { VideoCard } from "@/components/video-card";
import { SERIES_ORDER } from "@/lib/categories";
import { compact, longDate, num, pct } from "@/lib/format";
import { MODELS } from "@/lib/models";
import {
  categoryBenchmarks, categoryChips, channelHeader, durationByCategory, feed, freshness,
  heroPoints, overviewKpis, run, type FeedVideo,
} from "@/lib/queries";

export const revalidate = 3600;

// three.js needs real colours (CSS variables are resolved in the stylesheet, not in WebGL).
const HERO_HEX = ["#3987e5", "#d95926", "#199e70", "#c98500", "#6b6b72"];
const SORTS = [
  ["longest", "Longest run"],
  ["views", "Most viewed"],
  ["recent", "Newest"],
] as const;
const PAGE = 48;

type Params = { category?: string; q?: string; channel?: string; sort?: string; n?: string };

function href(base: Params, patch: Partial<Params>): string {
  const merged = { ...base, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const category = (params.category ?? "").slice(0, 40);
  const q = (params.q ?? "").slice(0, 80);
  const channel = (params.channel ?? "").slice(0, 40);
  const sort = SORTS.some(([k]) => k === params.sort) ? params.sort! : "longest";
  const limit = Math.min(240, Math.max(PAGE, Number(params.n) || PAGE));
  const browsing = !category && !q && !channel;

  const [videos, chips, channelInfo] = await Promise.all([
    run<FeedVideo>(feed, [category, q, channel, sort, limit + 1]),
    run<{ category: string; videos: number }>(categoryChips),
    channel ? run<ChannelInfo>(channelHeader, [channel]) : Promise.resolve([]),
  ]);
  const hasMore = videos.length > limit;
  const shown = videos.slice(0, limit);
  const base: Params = { category, q, channel, sort: sort === "longest" ? undefined : sort };

  const chipList: Chip[] = [
    { label: "All", href: href(base, { category: undefined, n: undefined }), active: !category },
    ...chips.map((c) => ({
      label: c.category,
      href: href(base, { category: c.category, n: undefined }),
      active: c.category === category,
    })),
    ...SORTS.map(([k, label], i) => ({
      label,
      divider: i === 0,
      href: href(base, { sort: k === "longest" ? undefined : k, n: undefined }),
      active: sort === k,
    })),
  ];

  return (
    <Reveal className="mx-auto max-w-[1800px]">
      <div className="sticky top-14 z-30 -mx-4 bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <form role="search" action="/" className="pt-3 sm:hidden">
          <label htmlFor="mobile-search" className="sr-only">Search videos and channels</label>
          <input id="mobile-search" name="q" defaultValue={q} placeholder="Search videos and channels"
            className="h-10 w-full rounded-full border border-border-strong bg-[#121212] px-4 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none" />
        </form>
        <ChipBar chips={chipList} />
      </div>

      {browsing && <Banner />}
      {channelInfo[0] && <ChannelHeader c={channelInfo[0]} />}
      {q && (
        <p className="mb-5 mt-2 text-sm text-ink-3">
          {shown.length === 0 ? "No videos match" : `Videos matching`} “<span className="text-ink">{q}</span>”
          {category && <> in {category}</>}
        </p>
      )}

      <Grid videos={shown.slice(0, 8)} />
      {browsing && <InsightShelf />}
      <Grid videos={shown.slice(8)} />

      {hasMore && (
        <div className="mt-12 flex justify-center">
          <Link href={href(base, { n: String(limit + PAGE) })} scroll={false}
            className="rounded-full bg-surface-2 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3">
            Show more
          </Link>
        </div>
      )}
    </Reveal>
  );
}

function Grid({ videos }: { videos: FeedVideo[] }) {
  if (!videos.length) return null;
  return (
    <ul className="mt-4 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {videos.map((v) => (
        <li key={v.video_id} data-reveal>
          <VideoCard v={v} />
        </li>
      ))}
    </ul>
  );
}

type ChannelInfo = {
  channel_id: string; channel_title: string; primary_category: string | null; charted_videos: number;
  labelled: number; multiday_videos: number; smoothed_rate: number; avg_days: number;
  subscribers: number | null; rank: number;
};

function ChannelHeader({ c }: { c: ChannelInfo }) {
  return (
    <section data-reveal className="mb-6 mt-4 flex flex-wrap items-center gap-6 border-b border-border pb-6">
      <ChannelAvatar name={c.channel_title} id={c.channel_id} size={96} />
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{c.channel_title}</h1>
        <p className="mt-2 text-sm text-ink-3">
          {compact(c.subscribers)} subscribers · {c.charted_videos} charted videos · {c.primary_category}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {c.multiday_videos} of {c.labelled} labelled videos stayed a second day · smoothed rate{" "}
          {pct(c.smoothed_rate)} · #{c.rank} on the{" "}
          <Link href="/channels" className="underline decoration-border-strong underline-offset-4 hover:decoration-ink">staying-power leaderboard</Link>
        </p>
      </div>
    </section>
  );
}

type Kpis = { videos: number; channels: number; chart_days: number; labelled: number; multiday_rate: number };

async function Banner() {
  const [[kpis], [fresh], hero] = await Promise.all([
    run<Kpis>(overviewKpis),
    run<{ latest_snapshot_date: string; complete_days_last_7: number }>(freshness),
    run<{ day: number; category: string; days: number; stayed: boolean }>(heroPoints),
  ]);
  const lanes = SERIES_ORDER;
  const points: HeroPoint[] = hero.map((p) => ({
    day: p.day,
    lane: Math.max(0, lanes.indexOf(lanes.includes(p.category) ? p.category : "Other")),
    days: p.days,
    stayed: p.stayed,
  }));
  const live = (fresh?.complete_days_last_7 ?? 0) > 0;
  return (
    <section className="relative mt-2 overflow-hidden rounded-2xl border border-border bg-[radial-gradient(80%_120%_at_75%_40%,#152238_0%,#111_60%)] sm:h-[340px]">
      <HeroField points={points} lanes={lanes} colors={HERO_HEX} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#111_0%,rgba(17,17,17,0.85)_32%,transparent_62%)]" />
      <div className="relative flex h-full min-h-[320px] flex-col justify-between gap-6 p-6 sm:p-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-ink-2">
            <span className={`size-1.5 rounded-full ${live ? "bg-[#0ca30c]" : "bg-ink-3"}`} />
            {live ? "Live" : "Paused"} · data through {fresh ? longDate(fresh.latest_snapshot_date) : "–"}
          </span>
          <h1 className="mt-4 max-w-xl text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[40px]">
            Which videos <span className="text-brand">hold their place</span> on the chart?
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
            Every dot is one charted video. Bright, raised dots stayed more than a day. Pick any
            thumbnail below to see its run.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {[
            ["Videos", <CountUp key="v" value={kpis!.videos} format="int" />],
            ["Channels", <CountUp key="c" value={kpis!.channels} format="int" />],
            ["Chart days", <CountUp key="d" value={kpis!.chart_days} format="int" />],
            ["Stay a 2nd day", <CountUp key="r" value={kpis!.multiday_rate} format="pct1" />],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

async function InsightShelf() {
  const [bench, duration] = await Promise.all([
    run<{ category: string; share: number; rate: number }>(categoryBenchmarks),
    run<{ category: string; labelled: number; lift: number | null }>(durationByCategory),
  ]);
  const music = bench.find((b) => b.category === "Music");
  const gaming = bench.find((b) => b.category === "Gaming");
  const lifts = duration.filter((d) => d.category === "Music" && d.labelled >= 30 && d.lift != null).map((d) => d.lift!);
  const cards = [
    { href: "/categories", kicker: "Categories", stat: pct(gaming?.share, 0), label: "of chart videos are Gaming",
      body: `Only ${pct(gaming?.rate)} of them stay a second day, against ${pct(music?.rate)} for Music.` },
    { href: "/categories#length", kicker: "Video length", stat: lifts.length ? `${Math.min(...lifts).toFixed(2)}–${Math.max(...lifts).toFixed(2)}×` : "–",
      label: "Music's staying rate by length, vs. its average",
      body: "Within a category, length barely matters. The headline duration effect is category mix." },
    { href: "/model", kicker: "Model", stat: num(MODELS.chartday?.test.all_test.roc_auc), label: "ROC AUC on held-out days",
      body: `Day-one signals predict who stays. Before publishing: ${num(MODELS.prepublish?.test.all_test.roc_auc)}.` },
    { href: "/channels", kicker: "Channels", stat: "Top 50", label: "ranked on smoothed staying power",
      body: "A fair leaderboard: one lucky video can't put a channel on top." },
  ];
  return (
    <section data-reveal className="my-12 border-y border-border py-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></svg>
        </span>
        <h2 className="text-xl font-bold tracking-tight text-ink">Chart insights</h2>
      </div>
      <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.href} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <Link href={c.href} className="card group flex h-full flex-col p-5">
              <p className="text-xs font-medium text-ink-3">{c.kicker}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-ink">{c.stat}</p>
              <p className="mt-1 text-xs text-ink-3">{c.label}</p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-2">{c.body}</p>
              <span className="mt-4 text-xs font-medium text-ink-2 transition-colors group-hover:text-ink">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
