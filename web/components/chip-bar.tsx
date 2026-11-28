"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface Chip {
  label: string;
  href: string;
  active: boolean;
  divider?: boolean; // draw a separator before this chip
}

/** Horizontally scrolling topic chips with edge arrows, like a video site's tab row. */
export function ChipBar({ chips }: { chips: Chip[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    gsap.to(el, { scrollLeft: el.scrollLeft + dir * el.clientWidth * 0.7, duration: 0.5, ease: "power2.out" });
  };

  const arrow = (dir: 1 | -1) => (
    <div className={`absolute inset-y-0 ${dir < 0 ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l"} flex items-center from-bg via-bg to-transparent ${dir < 0 ? "pr-8" : "pl-8"}`}>
      <button type="button" onClick={() => nudge(dir)} aria-label={dir < 0 ? "Scroll topics left" : "Scroll topics right"}
        className="grid size-8 place-items-center rounded-full text-ink transition-colors hover:bg-surface-2">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d={dir < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="relative">
      <div ref={track} className="no-scrollbar flex gap-3 overflow-x-auto py-3">
        {chips.map((chip) => [
          chip.divider ? <span key={`${chip.label}-divider`} aria-hidden className="my-1 w-px shrink-0 bg-border-strong" /> : null,
          <Link key={chip.label} href={chip.href} scroll={false} aria-current={chip.active ? "true" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              chip.active ? "bg-ink text-bg" : "bg-surface-2 text-ink hover:bg-surface-3"
            }`}>
            {chip.label}
          </Link>,
        ])}
      </div>
      {edges.left && arrow(-1)}
      {edges.right && arrow(1)}
    </div>
  );
}
