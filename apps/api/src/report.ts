import { randomUUID } from "node:crypto";
import type { Env } from "./env.ts";
import type { ErrorContext, ErrorReporter, SafeError } from "./log.ts";

/*
 * Error monitoring: server errors, job failures and app crashes go to Sentry
 * when SENTRY_DSN is set, so someone is told within a minute instead of
 * finding out from a person.
 *
 * Sentry's own SDK is not used on purpose. It collects request bodies, headers
 * and local values by default, and Briv's rule is that nothing a person typed
 * leaves the server. This sends only the safe form of an error (its kind, the
 * database code and the code locations), the route pattern and the request id.
 */

type Dsn = { endpoint: string; key: string };

/** Reads a DSN such as https://abc123@o1.ingest.de.sentry.io/456. */
export function readDsn(dsn: string): Dsn {
  const url = new URL(dsn);
  const project = url.pathname.split("/").filter(Boolean).pop();
  if (url.protocol !== "https:" || !url.username || !project || !/^\d+$/.test(project)) {
    throw new Error("SENTRY_DSN must look like https://key@host/123.");
  }
  const prefix = url.pathname.slice(0, url.pathname.lastIndexOf("/"));
  return { endpoint: `https://${url.host}${prefix}/api/${project}/envelope/`, key: url.username };
}

type Frame = { function?: string; filename: string; lineno: number; colno: number; in_app: boolean };

/** "at fn (file.ts:12:3)" → a frame. Sentry lists frames oldest first. */
export function framesOf(at: string[]): Frame[] {
  return at
    .map((line): Frame | null => {
      const match = /^at (?:(.+?) \()?([^()]+?):(\d+):(\d+)\)?$/.exec(line);
      if (!match) return null;
      const [, fn, filename, lineno, colno] = match;
      return {
        ...(fn ? { function: fn } : {}),
        filename,
        lineno: Number(lineno),
        colno: Number(colno),
        in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
      };
    })
    .filter((frame): frame is Frame => frame !== null)
    .reverse();
}

/** The Sentry event for one error: nothing in it came from a person. */
export function eventOf(problem: SafeError, context: ErrorContext, release: { environment: string; release?: string }) {
  return {
    event_id: randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    platform: context.source === "app" ? "javascript" : "node",
    level: "error",
    environment: release.environment,
    ...(release.release ? { release: release.release } : {}),
    tags: {
      source: context.source,
      ...(context.route ? { route: context.route } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.requestId ? { request_id: context.requestId } : {}),
      ...(problem.code ? { db_code: problem.code } : {}),
    },
    exception: {
      values: [{ type: problem.error, value: problem.code ? `code ${problem.code}` : problem.error, stacktrace: { frames: framesOf(problem.at) } }],
    },
  };
}

export function sentryReporter(
  dsn: string,
  release: { environment: string; release?: string },
  send: typeof fetch = fetch,
): ErrorReporter {
  const target = readDsn(dsn);
  return (problem, context) => {
    const event = eventOf(problem, context, release);
    const body = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    // Fire and forget, with a time limit: reporting must never slow a request or crash the server.
    send(target.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=briv-api/1`,
      },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  };
}

/** The reporter the settings ask for: Sentry when SENTRY_DSN is set, otherwise none (the log still has every error). */
export function reporterFor(env: Env): ErrorReporter | undefined {
  if (!env.SENTRY_DSN) return undefined;
  return sentryReporter(env.SENTRY_DSN, {
    environment: env.SENTRY_ENVIRONMENT ?? (env.live ? "live" : "development"),
    release: env.RELEASE,
  });
}
