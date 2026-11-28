"use client";

import { useEffect, useRef, useState } from "react";
import { YOUTUBE_CATEGORIES } from "@/lib/categories";
import { compact, pct } from "@/lib/format";
import { LineChart } from "./charts/line-chart";
import { Gauge } from "./gauge";

export interface Defaults {
  subscribers: number;
  total_views: number;
  video_count: number;
  age_days: number;
  title_chars: number;
  description_words: number;
  tags: number;
}

interface Prediction {
  probability: number;
  threshold: number;
  flagged: boolean;
  base_rate: number;
  category_rate: number | null;
  model: string;
  trained_through: string;
  by_duration: { x: number; probability: number }[];
  by_hour: { x: number; probability: number }[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Log-scale slider for audience size.
const toLog = (v: number) => Math.log10(Math.max(1, v));
const fromLog = (v: number) => Math.round(10 ** v);

function Field({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-ink-3">
        {label}
        {value && <span className="text-sm text-ink tabular-nums">{value}</span>}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const slider = "w-full accent-[var(--accent)]";
const select = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-ink-3 focus:outline-none";

export function Simulator({ defaults }: { defaults: Defaults }) {
  const [input, setInput] = useState({
    category_id: 20,
    duration_minutes: 12,
    channel_subscribers: Math.round(defaults.subscribers),
    channel_video_count: Math.round(defaults.video_count),
    publish_isodow_pt: 5,
    publish_hour_pt: 12,
    title_char_count: Math.round(defaults.title_chars),
    description_word_count: Math.round(defaults.description_words),
    tags_count: Math.round(defaults.tags),
    definition: "hd" as "hd" | "sd",
  });
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const seq = useRef(0);

  // Wake the prediction server as soon as the page opens (free hosting sleeps when idle).
  useEffect(() => {
    fetch("/api/predict", { cache: "no-store" }).catch(() => {});
  }, []);

  // If a request takes a while, explain why instead of looking frozen.
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      // Channel totals scale with subscribers using the median charting channel's ratios.
      const ratio = input.channel_subscribers / Math.max(1, defaults.subscribers);
      try {
        const response = await fetch("/api/predict", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...input,
            channel_total_views: defaults.total_views * ratio,
            channel_age_days: defaults.age_days,
            licensed_content: true,
            channel_country: "US",
          }),
        });
        const body = await response.json();
        if (id !== seq.current) return;
        if (!response.ok) throw new Error(body.error ?? body.detail ?? `HTTP ${response.status}`);
        setResult(body);
        setError(null);
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : "request failed");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [input, defaults]);

  const set = <K extends keyof typeof input>(k: K, v: (typeof input)[K]) => setInput((s) => ({ ...s, [k]: v }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form className="space-y-5 card p-5 sm:p-6" onSubmit={(e) => e.preventDefault()}>
        <Field label="Category">
          <select className={select} value={input.category_id} onChange={(e) => set("category_id", Number(e.target.value))}>
            {YOUTUBE_CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label="Video length" value={input.duration_minutes < 1 ? `${Math.round(input.duration_minutes * 60)}s` : `${input.duration_minutes} min`}>
          <input type="range" className={slider} min={0.5} max={90} step={0.5} value={input.duration_minutes}
            onChange={(e) => set("duration_minutes", Number(e.target.value))} />
        </Field>
        <Field label="Channel subscribers" value={compact(input.channel_subscribers)}>
          <input type="range" className={slider} min={3} max={8.5} step={0.05} value={toLog(input.channel_subscribers)}
            onChange={(e) => set("channel_subscribers", fromLog(Number(e.target.value)))} />
        </Field>
        <Field label="Channel uploads" value={compact(input.channel_video_count)}>
          <input type="range" className={slider} min={0} max={5} step={0.05} value={toLog(input.channel_video_count)}
            onChange={(e) => set("channel_video_count", fromLog(Number(e.target.value)))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Publish day (PT)">
            <select className={select} value={input.publish_isodow_pt} onChange={(e) => set("publish_isodow_pt", Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </Field>
          <Field label="Publish hour (PT)">
            <select className={select} value={input.publish_hour_pt} onChange={(e) => set("publish_hour_pt", Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{`${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "am" : "pm"}`}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Title length" value={`${input.title_char_count} chars`}>
          <input type="range" className={slider} min={5} max={100} value={input.title_char_count}
            onChange={(e) => set("title_char_count", Number(e.target.value))} />
        </Field>
        <Field label="Tags" value={String(input.tags_count)}>
          <input type="range" className={slider} min={0} max={60} value={input.tags_count}
            onChange={(e) => set("tags_count", Number(e.target.value))} />
        </Field>
        <Field label="Description" value={`${input.description_word_count} words`}>
          <input type="range" className={slider} min={0} max={1000} step={10} value={input.description_word_count}
            onChange={(e) => set("description_word_count", Number(e.target.value))} />
        </Field>
        <p className="text-xs leading-relaxed text-ink-3">
          Defaults are the median charting channel. Total channel views scale with subscribers;
          channel age is held at the median.
        </p>
      </form>

      <div className="space-y-6">
        <section className="card p-6" aria-live="polite">
          {slow && !result && !error ? (
            <div className="py-14 text-center">
              <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
              <p className="mt-4 text-sm text-ink">Waking up the model server…</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-3">
                It runs on free hosting that sleeps when nobody has used it for a while. The
                first prediction can take up to a minute; after that it&apos;s instant.
              </p>
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-ink">The prediction service isn&apos;t reachable.</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-3">
                Start it with <code className="font-mono text-ink-2">uv run --extra api uvicorn tubescope.api:app --port 8000</code>{" "}
                and set <code className="font-mono text-ink-2">PREDICT_API_URL</code>. ({error})
              </p>
            </div>
          ) : (
            <div className={`transition-opacity ${loading && result ? "opacity-70" : ""}`}>
              <p className="text-center text-xs text-ink-3">Chance it stays on the chart a second day, if it charts</p>
              <div className="mt-3">
                <Gauge value={result?.probability ?? null} threshold={result?.threshold ?? 0.3} />
              </div>
              {result && (
                <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <dt className="text-xs text-ink-3">This video</dt>
                    <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{pct(result.probability, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">Its category</dt>
                    <dd className="mt-1 text-lg font-semibold text-ink-2 tabular-nums">{pct(result.category_rate, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">All videos</dt>
                    <dd className="mt-1 text-lg font-semibold text-ink-2 tabular-nums">{pct(result.base_rate, 0)}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-5 text-center text-xs text-ink-3">
                The dot on the arc marks the model&apos;s decision threshold. Probabilities are calibrated on held-out days.
              </p>
            </div>
          )}
        </section>

        {result && !error && (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card p-5">
              <h3 className="text-sm font-semibold text-ink">If only the length changed</h3>
              <div className="mt-4">
                <LineChart height={200} yFormat="pct0" xFormat="logMinutes" xLabel="Length (log scale)"
                  reference={{ y: result.probability, label: "current" }}
                  series={[{ key: "d", label: "Chance of a second day", color: "var(--series-1)",
                    points: result.by_duration.map((p) => ({ x: Math.log10(p.x), y: p.probability })) }]} />
              </div>
            </section>
            <section className="card p-5">
              <h3 className="text-sm font-semibold text-ink">If only the publish hour changed</h3>
              <div className="mt-4">
                <LineChart height={200} yFormat="pct0" xFormat="hour" xLabel="Publish hour (PT)"
                  reference={{ y: result.probability, label: "current" }}
                  series={[{ key: "h", label: "Chance of a second day", color: "var(--series-2)",
                    points: result.by_hour.map((p) => ({ x: p.x, y: p.probability })) }]} />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
