"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../motion";

gsap.registerPlugin(ScrollTrigger);

/** Draws chart marks in once the chart scrolls into view. */
export function drawIn(root: Element | null) {
  if (!root || prefersReducedMotion()) return;
  const trigger = { trigger: root, start: "top bottom-=40", once: true };
  const lines = root.querySelectorAll<SVGPathElement>("[data-draw=line]");
  lines.forEach((path) => {
    const length = path.getTotalLength();
    gsap.fromTo(
      path,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut", scrollTrigger: trigger,
        onComplete: () => { path.style.strokeDasharray = "none"; } },
    );
  });
  const growX = root.querySelectorAll("[data-draw=grow-x]");
  if (growX.length)
    gsap.from(growX, { scaleX: 0, transformOrigin: "left center", duration: 0.9, ease: "power3.out",
      stagger: 0.03, scrollTrigger: trigger });
  const growY = root.querySelectorAll("[data-draw=grow-y]");
  if (growY.length)
    gsap.from(growY, { scaleY: 0, transformOrigin: "center bottom", duration: 0.9, ease: "power3.out",
      stagger: 0.03, scrollTrigger: trigger });
  const pop = root.querySelectorAll("[data-draw=pop]");
  if (pop.length)
    gsap.from(pop, { scale: 0, opacity: 0, transformOrigin: "center", duration: 0.6, ease: "back.out(2)",
      stagger: 0.02, scrollTrigger: trigger });
  const fade = root.querySelectorAll("[data-draw=fade]");
  if (fade.length)
    gsap.from(fade, { opacity: 0, duration: 0.8, stagger: 0.004, ease: "power1.out", scrollTrigger: trigger });
  const wipe = root.querySelectorAll("[data-draw=wipe]");
  if (wipe.length)
    gsap.fromTo(wipe, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.6,
      ease: "power2.inOut", scrollTrigger: trigger });
}
