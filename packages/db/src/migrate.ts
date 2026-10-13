/*
 * Applies every migration in ../migrations that the database has not seen yet.
 * Run with DATABASE_URL set. Safe to run again: applied migrations are skipped.
 */
import { createDb } from "./client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const handle = createDb(url);
try {
  await handle.migrate();
  console.log("Database is up to date.");
} finally {
  await handle.close();
}
