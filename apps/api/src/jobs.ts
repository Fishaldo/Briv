/*
 * Jobs the host's scheduler runs: `node dist/jobs.js retention` once a day.
 * Each run is one JSON log line, and a row in the jobs table.
 */
import { londonToday } from "@briv/core";
import { createDb } from "@briv/db";
import { readEnv } from "./env.ts";
import { runRetention } from "./jobs/retention.ts";
import { jsonLogger, safeError } from "./log.ts";
import { reporterFor } from "./report.ts";

const env = readEnv();
const handle = createDb(env.DATABASE_URL);
const name = process.argv[2];

try {
  if (name !== "retention") throw new Error("Usage: jobs.js retention");
  const result = await runRetention(handle.db, londonToday());
  jsonLogger("info", "job_done", { job: name, ...result });
} catch (error) {
  const problem = safeError(error);
  jsonLogger("error", "job_failed", { job: name, ...problem });
  reporterFor(env)?.(problem, { source: "job", route: name });
  process.exitCode = 1;
  // Let the report leave before the process ends.
  await new Promise((resolve) => setTimeout(resolve, 2000));
} finally {
  await handle.close();
}
