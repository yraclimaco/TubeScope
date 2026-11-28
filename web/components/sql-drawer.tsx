"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useId, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

export function SqlDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();

  useGSAP(
    () => {
      const el = body.current;
      if (!el) return;
      const duration = prefersReducedMotion() ? 0 : 0.45;
      gsap.to(el, {
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
        duration,
        ease: "power3.inOut",
      });
    },
    { dependencies: [open] },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide transition-colors ${
          open
            ? "border-accent/40 bg-accent-soft text-ink"
            : "border-border text-ink-3 hover:border-ink-3 hover:text-ink-2"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
        </svg>
        SQL
      </button>
      <div id={id} ref={body} className="col-span-full h-0 overflow-hidden opacity-0" aria-hidden={!open}>
        <div className="pt-4">{children}</div>
      </div>
    </>
  );
}
