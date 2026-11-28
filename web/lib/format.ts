export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function int(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "–";
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "–";
  return n.toFixed(digits);
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

/** Named formats, so server components can tell client charts how to format values. */
export type Fmt = "int" | "compact" | "pct0" | "pct1" | "num2" | "x2" | "date" | "hour" | "day" | "minutes" | "logMinutes";

export function formatter(f: Fmt): (n: number) => string {
  switch (f) {
    case "int": return (n) => int(n);
    case "compact": return (n) => compact(n);
    case "pct0": return (n) => pct(n, 0);
    case "pct1": return (n) => pct(n, 1);
    case "num2": return (n) => num(n, 2);
    case "x2": return (n) => `${num(n, 2)}×`;
    case "hour": return (n) => `${n % 12 === 0 ? 12 : n % 12}${n < 12 ? "a" : "p"}`;
    case "day": return (n) => `Day ${n}`;
    case "minutes": return (n) => (n < 1 ? `${Math.round(n * 60)}s` : `${n}m`);
    case "date": return (n) => shortDate(new Date(n).toISOString());
    case "logMinutes": return (n) => {
      const m = 10 ** n;
      return m < 1 ? `${Math.round(m * 60)}s` : `${Math.round(m)}m`;
    };
  }
}
