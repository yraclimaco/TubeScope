"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { categoryColor } from "@/lib/categories";
import { compact, num, pct } from "@/lib/format";
import { ChannelAvatar } from "./avatar";
import { prefersReducedMotion } from "./motion";

gsap.registerPlugin(Flip);

export interface ChannelRow {
  channel_id: string;
  channel_title: string;
  primary_category: string | null;
  charted_videos: number;
  labelled: number;
  multiday_videos: number;
  raw_rate: number;
  smoothed_rate: number;
  avg_days: number;
  subscribers: number | null;
  rank: number;
  volume_rank: number;
}

type Sort = "staying" | "volume" | "raw";

export function Leaderboard({ rows, overall }: { rows: ChannelRow[]; overall: number }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("staying");
  const [minVideos, setMinVideos] = useState(3);
  const list = useRef<HTMLOListElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) => r.labelled >= minVideos && (!q || r.channel_title.toLowerCase().includes(q)),
    );
    const key: Record<Sort, (r: ChannelRow) => number> = {
      staying: (r) => -r.smoothed_rate,
      volume: (r) => -r.charted_videos,
      raw: (r) => -r.raw_rate,
    };
    return [...filtered].sort((a, b) => key[sort](a) - key[sort](b)).slice(0, 50);
  }, [rows, query, sort, minVideos]);

  const capture = () => {
    if (list.current && !prefersReducedMotion())
      flipState.current = Flip.getState(list.current.querySelectorAll("[data-flip]"));
  };

  useGSAP(
    () => {
      if (!flipState.current) return;
      Flip.from(flipState.current, {
        duration: 0.55,
        ease: "power3.inOut",
        absolute: false,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }),
        onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.2 }),
      });
      flipState.current = null;
    },
    { dependencies: [shown], scope: list },
  );

  const max = Math.max(...shown.map((r) => r.smoothed_rate), overall, 0.01);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative">
          <span className="sr-only">Search channels</span>
          <input
            value={query}
            onChange={(e) => { capture(); setQuery(e.target.value); }}
            placeholder="Search channels"
            className="w-56 rounded-full border border-border-strong bg-[#121212] px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-[#3987e5] focus:outline-none"
          />
        </label>
        <div role="radiogroup" aria-label="Sort by" className="flex gap-2 text-sm">
          {([["staying", "Staying power"], ["volume", "Volume"], ["raw", "Raw rate"]] as const).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={sort === k} type="button"
              onClick={() => { capture(); setSort(k); }}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${sort === k ? "bg-ink text-bg" : "bg-surface-2 text-ink hover:bg-surface-3"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-3">
          Min. labelled videos
          <select value={minVideos} onChange={(e) => { capture(); setMinVideos(Number(e.target.value)); }}
            className="rounded-lg border border-border bg-bg px-2 py-1.5 text-ink">
            {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,16rem)_4.5rem_4.5rem_5rem] gap-3 border-b border-border px-2 pb-2 text-xs text-ink-3 md:grid">
        <span>#</span><span>Channel</span><span>Smoothed staying rate</span>
        <span className="text-right">Videos</span><span className="text-right">Avg days</span><span className="text-right">Subscribers</span>
      </div>
      <ol ref={list} className="divide-y divide-border/60">
        {shown.map((r, i) => (
          <li key={r.channel_id} data-flip data-flip-id={r.channel_id}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-2 py-2.5 text-sm transition-colors hover:bg-surface-2 md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,16rem)_4.5rem_4.5rem_5rem]">
            <span className="text-ink-3 tabular-nums">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              <ChannelAvatar name={r.channel_title} id={r.channel_id} size={28} />
              <Link href={`/?channel=${encodeURIComponent(r.channel_id)}`} className="truncate text-ink hover:underline">
                {r.channel_title}
              </Link>
              <span className="hidden items-center gap-1 truncate text-xs text-ink-3 sm:inline-flex">
                <span className="size-1.5 rounded-full" style={{ background: categoryColor(r.primary_category) }} />
                {r.primary_category}
              </span>
            </span>
            <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
              <span className="relative h-2.5 flex-1 rounded-r-[4px]">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--series-1)]"
                  style={{ width: `${(r.smoothed_rate / max) * 100}%` }} />
                <span className="absolute -inset-y-1 w-px bg-ink-2/60" style={{ left: `${(overall / max) * 100}%` }}
                  title={`All videos: ${pct(overall)}`} />
              </span>
              <span className="w-24 shrink-0 text-xs tabular-nums text-ink-2">
                {pct(r.smoothed_rate)} <span className="text-ink-3">({r.multiday_videos}/{r.labelled})</span>
              </span>
            </span>
            <span className="hidden text-right tabular-nums text-ink-2 md:block">{r.charted_videos}</span>
            <span className="hidden text-right tabular-nums text-ink-2 md:block">{num(r.avg_days, 1)}</span>
            <span className="hidden text-right tabular-nums text-ink-2 md:block">{compact(r.subscribers)}</span>
          </li>
        ))}
      </ol>
      {shown.length === 0 && <p className="py-10 text-center text-sm text-ink-3">No channels match.</p>}
    </div>
  );
}
