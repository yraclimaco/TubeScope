"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { compact, shortDate } from "@/lib/format";
import type { FeedVideo } from "@/lib/queries";
import { duration, thumb } from "@/lib/video";
import { ChannelAvatar } from "./avatar";

function Thumbnail({ id, title, className = "" }: { id: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`grid place-items-center bg-[linear-gradient(135deg,#232323,#161616)] text-xs text-ink-3 ${className}`}>
      Thumbnail unavailable
    </div>
  ) : (
    <Image src={thumb(id, "mq")} alt={title} fill onError={() => setFailed(true)}
      sizes="(min-width: 1536px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
      className={`object-cover ${className}`} />
  );
}

function RunBadge({ v }: { v: FeedVideo }) {
  if (!v.label_observable) return null;
  return v.is_multiday ? (
    <span className="absolute bottom-1.5 left-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {v.days}-day run
    </span>
  ) : null;
}

export function VideoCard({ v }: { v: FeedVideo }) {
  const length = duration(v.duration_sec);
  return (
    <article className="group">
      <Link href={`/videos/${v.video_id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2 transition-[border-radius] duration-300 group-hover:rounded-none">
          <Thumbnail id={v.video_id} title={v.title} className="transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
          <RunBadge v={v} />
          {length && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[12px] font-medium text-white tabular-nums">
              {length}
            </span>
          )}
        </div>
      </Link>
      <div className="mt-3 flex gap-3">
        <Link href={`/?channel=${encodeURIComponent(v.channel_id)}`} aria-label={`${v.channel_title}'s videos`}>
          <ChannelAvatar name={v.channel_title} id={v.channel_id} />
        </Link>
        <div className="min-w-0">
          <Link href={`/videos/${v.video_id}`}>
            <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-ink">{v.title}</h3>
          </Link>
          <Link href={`/?channel=${encodeURIComponent(v.channel_id)}`}
            className="mt-1 block truncate text-sm text-ink-3 transition-colors hover:text-ink-2">
            {v.channel_title}
          </Link>
          <p className="text-sm text-ink-3">
            {compact(v.peak_views)} views · {v.days} day{v.days === 1 ? "" : "s"} on chart · {shortDate(v.first_chart_date)}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Compact horizontal card for the watch page's "Up next" column. */
export function VideoRow({ v }: { v: FeedVideo }) {
  const length = duration(v.duration_sec);
  return (
    <Link href={`/videos/${v.video_id}`} className="group flex gap-2.5">
      <div className="relative aspect-video w-[168px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
        <Thumbnail id={v.video_id} title={v.title} className="transition-transform duration-500 group-hover:scale-[1.05]" />
        {length && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-medium text-white tabular-nums">{length}</span>
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{v.title}</p>
        <p className="mt-1 truncate text-xs text-ink-3">{v.channel_title}</p>
        <p className="text-xs text-ink-3">{compact(v.peak_views)} views · {v.days}d on chart</p>
      </div>
    </Link>
  );
}
