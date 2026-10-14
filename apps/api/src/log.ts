/*
 * The server's logs: one JSON line per event, so a hosting dashboard or a log
 * service can search them and alert on errors. A line never carries what
 * someone typed, a name, an email or an amount: only the route, the status,
 * timings, a request id the person can quote to support, and for an error its
 * kind and where in the code it happened.
 */

export type Level = "info" | "warn" | "error";

export type Logger = (level: Level, event: string, fields?: Record<string, unknown>) => void;

export const jsonLogger: Logger = (level, event, fields = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
};

/** For tests: keeps what was logged instead of printing it. */
export function memoryLogger(): Logger & { lines: { level: Level; event: string; fields: Record<string, unknown> }[] } {
  const lines: { level: Level; event: string; fields: Record<string, unknown> }[] = [];
  const logger = ((level, event, fields = {}) => {
    lines.push({ level, event, fields });
  }) as Logger & { lines: typeof lines };
  logger.lines = lines;
  return logger;
}

/**
 * An error made safe to log. Its message is left out on purpose: a database
 * error's message can hold the values of the query (an amount, a note, a
 * name). What is kept is enough to find the fault: the kind of error, the
 * database's error code, and the code locations from the stack.
 */
export type SafeError = { error: string; code?: string; at: string[] };

export function safeError(error: unknown): SafeError {
  if (!(error instanceof Error)) return { error: typeof error, at: [] };
  const code = (error as { code?: unknown }).code;
  const at = (error.stack ?? "")
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 8)
    // Keep "at function (file:line:col)", nothing that came from data.
    .map((line) => line.trim().replace(/\(.*?([^/\\]+:\d+:\d+)\)$/, "($1)").slice(0, 160));
  return { error: error.name, ...(typeof code === "string" && /^[\w-]{1,20}$/.test(code) ? { code } : {}), at };
}

/** Where an error happened, as far as a report says: never a path with ids in it, never a person. */
export type ErrorContext = { source: "server" | "app" | "job"; requestId?: string; method?: string; route?: string };

/**
 * Where an error goes besides the log, such as Sentry (report.ts). It is only
 * ever given the safe form of the error, so nothing private can leave.
 */
export type ErrorReporter = (problem: SafeError, context: ErrorContext) => void;
