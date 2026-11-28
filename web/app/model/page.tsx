import type { Metadata } from "next";
import { ModelView } from "@/components/model-view";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/panel";
import { MODELS } from "@/lib/models";

export const metadata: Metadata = { title: "Model" };

export default function ModelPage() {
  return (
    <Reveal className="mx-auto max-w-6xl pt-4 ">
      <PageHeader eyebrow="Model" title="Will it still be on the chart tomorrow?">
        Two calibrated models: one uses only what a creator knows before
        publishing, the other adds the video&apos;s first day on the chart. Every number below comes
        from days the models never saw while being built.
      </PageHeader>
      <div data-reveal>
        <ModelView models={MODELS} />
      </div>
    </Reveal>
  );
}
