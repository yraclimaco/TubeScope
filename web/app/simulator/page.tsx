import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/panel";
import { Simulator, type Defaults } from "@/components/simulator";
import { run, simulatorDefaults } from "@/lib/queries";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Simulator" };

export default async function SimulatorPage() {
  const [defaults] = await run<Defaults>(simulatorDefaults);
  return (
    <Reveal className="mx-auto max-w-6xl pt-4 ">
      <PageHeader eyebrow="What-if simulator" title="Plan a video, see its odds">
        Set up a video the way a creator would before publishing. The pre-publish model estimates
        how likely it is to stay a second day <em>if it reaches the chart</em>. It says nothing
        about whether a video charts at all, and it describes patterns, not causes.
      </PageHeader>
      <div data-reveal>
        <Simulator defaults={defaults!} />
      </div>
    </Reveal>
  );
}
