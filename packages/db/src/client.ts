import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export { schema };

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = {
  db: Database;
  kind: "pglite" | "postgres";
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

/** Rows from `db.execute`, whichever driver ran it. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/**
 * One database handle for the whole server.
 *
 * - A `postgres://` URL connects to a real Postgres (Neon in staging and live).
 * - `pglite:memory` or `pglite:<folder>` runs Postgres inside Node, for tests
 *   and for working without a database server.
 */
export function createDb(url: string, options: { migrationsFolder?: string } = {}): DbHandle {
  const folder = options.migrationsFolder ?? migrationsFolder;
  if (url.startsWith("pglite:")) {
    const where = url.slice("pglite:".length);
    const client = where === "memory" || where === "" ? new PGlite() : new PGlite(where);
    const db = drizzleLite({ client, schema });
    return {
      db: db as unknown as Database,
      kind: "pglite",
      migrate: () => migrateLite(db, { migrationsFolder: folder }),
      close: () => client.close(),
    };
  }
  // prepare: false for Neon's pooled connections. A database that cannot be reached fails in
  // 10 seconds rather than hanging a request; idle connections close after 20.
  // A slow query is stopped by the database itself: see "Running live" in README.md.
  const client = postgres(url, { max: 5, prepare: false, connect_timeout: 10, idle_timeout: 20 });
  const db = drizzlePg({ client, schema });
  return {
    db: db as unknown as Database,
    kind: "postgres",
    migrate: () => migratePg(db, { migrationsFolder: folder }),
    close: () => client.end(),
  };
}
