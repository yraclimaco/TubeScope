// Copies the SQL view definitions and model reports from the repository into web/generated/
// so the site can show the exact SQL behind each chart and the model evaluation.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const out = join(web, "generated");
mkdirSync(out, { recursive: true });

const viewsDir = join(repo, "db", "views");
if (!existsSync(viewsDir)) throw new Error(`missing ${viewsDir}`);
const views = readdirSync(viewsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => {
    const sql = readFileSync(join(viewsDir, file), "utf8");
    const lines = sql.split("\n");
    const comment = [];
    for (const line of lines) {
      if (!line.startsWith("--")) break;
      comment.push(line.replace(/^--\s?/, ""));
    }
    const created = sql.match(/CREATE (?:OR REPLACE )?(VIEW|FUNCTION) (analytics\.\w+)/);
    return {
      file,
      kind: created?.[1]?.toLowerCase() ?? "sql",
      name: created?.[2] ?? file,
      description: comment.join(" ").replace(/\s+/g, " ").trim(),
      sql,
    };
  });
writeFileSync(join(out, "sql-views.json"), JSON.stringify(views, null, 2));

const modelsDir = join(repo, "ml", "models");
const reports = existsSync(modelsDir)
  ? readdirSync(modelsDir)
      .map((d) => join(modelsDir, d, "report.json"))
      .filter(existsSync)
      .map((p) => JSON.parse(readFileSync(p, "utf8")))
  : [];
const latest = {};
for (const r of reports) {
  if (!latest[r.feature_set] || r.trained_at > latest[r.feature_set].trained_at) {
    latest[r.feature_set] = r;
  }
}
writeFileSync(join(out, "models.json"), JSON.stringify(latest, null, 2));
console.log(`sync-data: ${views.length} SQL files, models: ${Object.keys(latest).join(", ") || "none"}`);
