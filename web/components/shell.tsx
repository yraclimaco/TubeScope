"use client";

import gsap from "gsap";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChannelAvatar } from "./avatar";
import { prefersReducedMotion } from "./motion";

export interface SidebarChannel {
  channel_id: string;
  channel_title: string;
}

const I = {
  menu: "M4 6h16M4 12h16M4 18h16",
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  categories: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  channels: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  model: "M4 19h16M7 16V9M12 16V5M17 16v-4",
  simulator: "M5 7h9M18 7h1M5 12h3M12 12h7M5 17h11M19 17h0M16 5v4M10 10v4M18 15v4",
  sql: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  github: "M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5a3 3 0 0 0-1-2.5c3 0 6-1.5 6-6.5a5 5 0 0 0-1.5-3.5 4.5 4.5 0 0 0-.1-3.5s-1.2-.4-3.9 1.4a13 13 0 0 0-7 0C6.8 2.6 5.6 3 5.6 3a4.5 4.5 0 0 0-.1 3.5A5 5 0 0 0 4 10c0 5 3 6.5 6 6.5a3 3 0 0 0-1 2.5V22",
};

function Icon({ d, className = "size-6" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const EXPLORE = [
  { href: "/", label: "Home", icon: I.home },
  { href: "/categories", label: "Categories", icon: I.categories },
  { href: "/channels", label: "Channels", icon: I.channels },
];
const ANALYTICS = [
  { href: "/model", label: "Model", icon: I.model },
  { href: "/simulator", label: "Simulator", icon: I.simulator },
  { href: "/sql", label: "SQL lab", icon: I.sql },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1.5 px-1 text-[19px] font-semibold tracking-[-0.03em] text-ink">
      <span className="grid h-6 w-8 place-items-center rounded-md bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white">
        <svg viewBox="0 0 24 24" className="ml-0.5 size-3.5" fill="currentColor" aria-hidden>
          <path d="M8 6.5v11l9-5.5z" />
        </svg>
      </span>
      TubeScope
    </Link>
  );
}

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  useEffect(() => setValue(params.get("q") ?? ""), [params]);
  return (
    <form
      role="search"
      className="flex w-full max-w-xl items-center"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
      }}
    >
      <label htmlFor="global-search" className="sr-only">Search videos and channels</label>
      <input
        id="global-search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search videos and channels"
        className="h-10 min-w-0 flex-1 rounded-l-full border border-border-strong bg-[#121212] px-4 text-[15px] text-ink placeholder:text-ink-3 focus:border-[#3987e5] focus:outline-none"
      />
      <button type="submit" aria-label="Search"
        className="grid h-10 w-16 place-items-center rounded-r-full border border-l-0 border-border-strong bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3">
        <Icon d={I.search} className="size-5" />
      </button>
    </form>
  );
}

export function Shell({ channels, children }: { channels: SidebarChannel[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  useEffect(() => {
    if (!drawer || !drawerRef.current || prefersReducedMotion()) return;
    gsap.fromTo(drawerRef.current, { x: -260 }, { x: 0, duration: 0.35, ease: "power3.out" });
  }, [drawer]);

  const toggle = () => {
    if (window.matchMedia("(min-width: 1280px)").matches) setExpanded((v) => !v);
    else setDrawer((v) => !v);
  };

  const fullItem = (item: { href: string; label: string; icon: string }) => (
    <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
      className={`flex h-10 items-center gap-6 rounded-xl px-3 text-sm transition-colors ${
        isActive(item.href) ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2"
      }`}>
      <Icon d={item.icon} />
      {item.label}
    </Link>
  );

  const fullNav = (
    <div className="space-y-3 px-3 py-3">
      <div className="space-y-0.5">{EXPLORE.map(fullItem)}</div>
      <hr className="border-border" />
      <p className="px-3 pt-1 text-[15px] font-semibold text-ink">Analytics</p>
      <div className="space-y-0.5">{ANALYTICS.map(fullItem)}</div>
      {channels.length > 0 && (
        <>
          <hr className="border-border" />
          <p className="px-3 pt-1 text-[15px] font-semibold text-ink">Top channels</p>
          <div className="space-y-0.5">
            {channels.map((c) => (
              <Link key={c.channel_id} href={`/?channel=${encodeURIComponent(c.channel_id)}`}
                className="flex h-10 items-center gap-4 rounded-xl px-3 text-sm text-ink-2 transition-colors hover:bg-surface-2">
                <ChannelAvatar name={c.channel_title} id={c.channel_id} size={24} />
                <span className="truncate">{c.channel_title}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <hr className="border-border" />
      <p className="px-3 pb-6 text-xs leading-relaxed text-ink-3">
        Analytics for YouTube&apos;s US most-popular chart. Not affiliated with YouTube.
      </p>
    </div>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-4 bg-bg/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggle} aria-label="Toggle navigation"
            className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface-2">
            <Icon d={I.menu} />
          </button>
          <Logo />
        </div>
        <div className="hidden flex-1 justify-center sm:flex">
          <Suspense fallback={null}><SearchBox /></Suspense>
        </div>
        <a href="https://github.com/yraclimaco/TubeScope" target="_blank" rel="noreferrer"
          className="flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-3">
          <Icon d={I.github} className="size-4" />
          <span className="hidden md:inline">Source</span>
        </a>
      </header>

      {/* Desktop: full guide (xl, expanded) or mini guide */}
      <aside data-lenis-prevent
        className={`scrollbar-thin fixed bottom-0 left-0 top-14 z-40 hidden overflow-y-auto md:block ${
          expanded ? "xl:w-60" : ""
        } w-[72px]`}>
        <nav aria-label="Main" className={expanded ? "hidden xl:block" : "hidden"}>{fullNav}</nav>
        <nav aria-label="Main" className={`px-1 py-1 ${expanded ? "xl:hidden" : ""}`}>
          {[...EXPLORE, ...ANALYTICS].map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-4 text-[10px] transition-colors hover:bg-surface-2 ${
                isActive(item.href) ? "text-ink" : "text-ink-2"
              }`}>
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile and mid-width: drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[60] xl:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside ref={drawerRef} data-lenis-prevent className="scrollbar-thin absolute inset-y-0 left-0 w-60 overflow-y-auto bg-bg">
            <div className="flex h-14 items-center gap-3 px-4">
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation"
                className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
                <Icon d={I.menu} />
              </button>
              <Logo />
            </div>
            {fullNav}
          </aside>
        </div>
      )}

      <div className={`pt-14 md:pl-[72px] ${expanded ? "xl:pl-60" : ""}`}>
        <div className="px-4 pb-20 sm:px-6">{children}</div>
      </div>
    </>
  );
}
