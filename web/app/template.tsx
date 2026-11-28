"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { prefersReducedMotion } from "@/components/motion";

/** Re-mounts on every navigation: a short fade-and-rise page transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current || prefersReducedMotion()) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 14, filter: "blur(6px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out", clearProps: "filter,transform" },
    );
  });
  return <div ref={ref}>{children}</div>;
}
