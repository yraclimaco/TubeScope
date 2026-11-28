import type { Metadata } from "next";
import { Leaderboard, type ChannelRow } from "@/components/leaderboard";
import { Reveal } from "@/components/motion";
import { PageHeader, Panel } from "@/components/panel";
import { pct } from "@/lib/format";
import { channelLeaderboard, overviewKpis, run } from "@/lib/queries";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Channels" };

export default async function Channels() {
  const [rows, [kpis]] = await Promise.all([
    run<ChannelRow>(channelLeaderboard),
    run<{ multiday_rate: number }>(overviewKpis),
  ]);
  return (
    <Reveal className="mx-auto max-w-6xl pt-4  space-y-6">
      <PageHeader eyebrow="Channels" title="Who keeps their videos on the chart">
        A channel with one video that stayed would top a raw ranking at 100%. Here each channel&apos;s
        rate is pulled towards the overall rate ({pct(kpis?.multiday_rate)}, the tick on each bar)
        as if it had 10 extra typical videos, so the board rewards consistent staying power.
      </PageHeader>
      <Panel title="Leaderboard" subtitle="Channels with at least 3 labelled videos on the top-200 chart." query={channelLeaderboard}>
        <Leaderboard rows={rows} overall={kpis?.multiday_rate ?? 0} />
      </Panel>
    </Reveal>
  );
}
