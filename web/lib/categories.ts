// Fixed colour per category (identity), never assigned by rank.
export const CATEGORY_COLOR: Record<string, string> = {
  Gaming: "var(--series-1)",
  Music: "var(--series-2)",
  Entertainment: "var(--series-3)",
  "People & Blogs": "var(--series-4)",
  Other: "var(--series-other)",
};

export const SERIES_ORDER = ["Gaming", "Music", "Entertainment", "People & Blogs", "Other"];

export function categoryColor(name: string | null | undefined): string {
  return CATEGORY_COLOR[name ?? "Other"] ?? "var(--series-other)";
}

// Selectable YouTube category ids (subset of pipeline/src/tubescope/categories.py).
export const YOUTUBE_CATEGORIES: [number, string][] = [
  [1, "Film & Animation"], [2, "Autos & Vehicles"], [10, "Music"], [15, "Pets & Animals"],
  [17, "Sports"], [19, "Travel & Events"], [20, "Gaming"], [22, "People & Blogs"],
  [23, "Comedy"], [24, "Entertainment"], [25, "News & Politics"], [26, "Howto & Style"],
  [27, "Education"], [28, "Science & Technology"], [29, "Nonprofits & Activism"],
];
