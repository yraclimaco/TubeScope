import "server-only";
import postgres from "postgres";

declare global {
  // Reuse one pool across hot reloads in development.
  var __tubescopeSql: postgres.Sql | undefined;
}

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see web/.env.example)");
  return postgres(url, { max: 5, idle_timeout: 20, prepare: false });
}

export function db(): postgres.Sql {
  globalThis.__tubescopeSql ??= connect();
  return globalThis.__tubescopeSql;
}
