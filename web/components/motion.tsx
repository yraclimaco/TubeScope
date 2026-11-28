"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { type Fmt, formatter } from "@/lib/format";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades and lifts every [data-reveal] child into view as it scrolls in, staggered. Re-scans on
 * every render, so elements added later (filters, "Show more") are picked up too.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const items = gsap.utils
        .toArray<HTMLElement>("[data-reveal]")
        .filter((el) => !el.hasAttribute("data-reveal-bound"));
      if (!items.length) return;
      items.forEach((el) => el.setAttribute("data-reveal-bound", ""));
      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1 });
        return;
      }
      gsap.set(items, { opacity: 0 }); // keeps them hidden until their trigger fires
      ScrollTrigger.batch(items, {
        start: "top bottom-=24",
        once: true,
        onEnter: (batch) =>
          gsap.fromTo(
            batch,
            { opacity: 0, y: 28, filter: "blur(8px)" },
            {
              opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "power3.out", stagger: 0.08,
              clearProps: "filter,transform",
            },
          ),
      });
    },
    { scope: ref, dependencies: [children], revertOnUpdate: false },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Counts a number up from zero when it enters the viewport. */
export function CountUp({ value, format: fmt }: { value: number; format: Fmt }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = formatter(fmt);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const state = { n: 0 };
      gsap.to(state, {
        n: value,
        duration: 1.4,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top bottom", once: true },
        onUpdate: () => {
          el.textContent = format(state.n);
        },
      });
    },
    { dependencies: [value] },
  );
  return <span ref={ref}>{format(value)}</span>;
}
