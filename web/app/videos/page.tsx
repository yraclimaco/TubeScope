import { redirect } from "next/navigation";

// The home feed is the video browser now; keep old links working.
export default async function Videos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q;
  redirect(q ? `/?q=${encodeURIComponent(q)}` : "/");
}
