import assert from "node:assert/strict";
import { createDb } from "@briv/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { memoryLogger } from "./log.ts";
import type { TownResolver } from "./town.ts";

/*
 * A whole Briv server for tests: a fresh database (PGlite in memory, or a real
 * Postgres when TEST_DATABASE_URL is set, as on GitHub), sign-in codes caught
 * instead of emailed, and a fixed "today".
 */

export const TEST_ORIGIN = "http://localhost:8081";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read each answer's JSON loosely
export type Called = { status: number; body: any; headers: Headers };

export function startTestApp(options: { today?: Date; resolveTown?: TownResolver } = {}) {
  const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "pglite:memory";
  const handle = createDb(DATABASE_URL);
  const env = readEnv({ NODE_ENV: "test", APP_ORIGINS: TEST_ORIGIN, DATABASE_URL });
  const codes = new Map<string, string>();
  const mail = async ({ to, text }: { to: string; subject: string; text: string }) => {
    codes.set(to, /\b(\d{6})\b/.exec(text)?.[1] ?? "");
  };
  const logs = memoryLogger();
  const auth = createAuth(handle.db, env, mail);
  const app = createApp({
    db: handle.db,
    auth,
    env,
    mail,
    resolveTown: options.resolveTown ?? (async () => "Birmingham"),
    today: () => options.today ?? new Date(2026, 9, 13),
    log: logs,
  });

  async function call(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}): Promise<Called> {
    const headers: Record<string, string> = { Origin: init.origin ?? TEST_ORIGIN };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.cookie) headers.Cookie = init.cookie;
    const response = await app.request(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }

  async function signIn(email: string): Promise<string> {
    const sent = await call("/api/auth/email-otp/send-verification-otp", { body: { email, type: "sign-in" } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const otp = codes.get(email);
    assert.ok(otp && otp.length === 6, "a six-digit code was emailed");
    const signed = await call("/api/auth/sign-in/email-otp", { body: { email, otp } });
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
    const cookies = signed.headers.getSetCookie().map((c) => c.split(";")[0]);
    assert.ok(cookies.length > 0, "a session cookie was set");
    return cookies.join("; ");
  }

  return { app, auth, mail, handle, env, keys: { keys: env.sealKeys, current: env.sealKeyId }, call, signIn, logs, codes };
}
