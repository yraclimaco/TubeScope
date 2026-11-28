import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Shell, type SidebarChannel } from "@/components/shell";
import { SmoothScroll, Spotlight } from "@/components/smooth";
import { run, sidebarChannels } from "@/lib/queries";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TubeScope", template: "%s · TubeScope" },
  description:
    "Lifecycle analytics for YouTube's most-popular chart: which videos hold their place, and why.",
};

// Adds .js-motion before first paint so GSAP-revealed elements don't flash.
const motionBoot = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-motion')}catch(e){}`;

export const revalidate = 3600;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Script id="motion-boot" strategy="beforeInteractive">
          {motionBoot}
        </Script>
        <SmoothScroll />
        <Spotlight />
        <Shell channels={await run<SidebarChannel>(sidebarChannels).catch(() => [])}>{children}</Shell>
      </body>
    </html>
  );
}
