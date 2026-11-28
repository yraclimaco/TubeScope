// Higher-resolution thumbnails than the 120x90 ones stored with the data.
export function thumb(videoId: string, quality: "mq" | "hq" | "sd" = "mq"): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${quality}default.jpg`;
}

export function duration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Channel avatars: we don't store channel images, so draw initials on a stable colour.
const AVATAR_BG = ["#3a5a8c", "#8c4a3a", "#2f6e5a", "#7a5a1e", "#5b4a8c", "#3d6b7a", "#7a3d5e", "#4f6b2f"];

export function avatar(name: string, id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return { letter, color: AVATAR_BG[h % AVATAR_BG.length]! };
}
