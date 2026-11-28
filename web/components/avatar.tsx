import { avatar } from "@/lib/video";

export function ChannelAvatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  const a = avatar(name, id);
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white/90"
      style={{ width: size, height: size, background: a.color, fontSize: size * 0.42 }}
    >
      {a.letter}
    </span>
  );
}
