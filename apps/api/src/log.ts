/*
 * The server's logs: one JSON line per event, so a hosting dashboard or a log
 * service can search them and alert on errors. A line never carries what
 * someone typed, a name, an email or an amount: only the route, the status,
 * timings and a request id the person can quote to support.
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
 * Where a server error goes besides the log. Logging is enough to start: the
 * host's log alerts pick up every "server_error" line. A service such as
 * Sentry plugs in here, in one place, when there is an account for it.
 */
export type ErrorReporter = (error: unknown, context: { requestId: string; method: string; route: string }) => void;
