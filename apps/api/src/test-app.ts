import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { createDb, type DbHandle } from "@briv/db";
import postgres from "postgres";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { memoryLogger } from "./log.ts";
import type { TownResolver } from "./town.ts";

/*
 * A whole Briv server for tests: a fresh database (PGlite in memory, or a real
 * Postgres when TEST_DATABASE_URL is set, as on GitHub), sign-in codes caught
 * instead of emailed, and a fixed "today".
 *
 * Test files run side by side. On Postgres each test server makes its own
 * database and drops it at the end, so files never see each other's people
 * and a run can be repeated.
 */

export const TEST_ORIGIN = "http://localhost:8081";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read each answer's JSON loosely
export type Called = { status: number; body: any; headers: Headers };

/** On Postgres, every test server gets a database of its own, made on migrate and dropped on close. */
function freshDatabase(base: string) {
  const name = `briv_test_${process.pid}_${randomInt(1_000_000)}`;
  const url = new URL(base);
  url.pathname = `/${name}`;
  return { url: url.toString(), name, admin: base };
}

function withOwnDatabase(handle: DbHandle, own: { name: string; admin: string }): DbHandle {
  const admin = () => postgres(own.admin, { max: 1, onnotice: () => {} });
  return {
    ...handle,
    migrate: async () => {
      const sql = admin();
      await sql.unsafe(`create database "${own.name}"`);
      await sql.end();
      await handle.migrate();
    },
    close: async () => {
      await handle.close();
      const sql = admin();
      await sql.unsafe(`drop database if exists "${own.name}"`);
      await sql.end();
    },
  };
}

export function startTestApp(options: { today?: Date; resolveTown?: TownResolver } = {}) {
  const DATABASE_URL = process.env.TEST_DATABASE_URL ? freshDatabase(process.env.TEST_DATABASE_URL) : null;
  const handle = DATABASE_URL ? withOwnDatabase(createDb(DATABASE_URL.url), DATABASE_URL) : createDb("pglite:memory");
  // Each test server has its own client address, so sign-in limits on a shared Postgres don't spill between tests.
  const env = readEnv({ NODE_ENV: "test", APP_ORIGINS: TEST_ORIGIN, DATABASE_URL: DATABASE_URL?.url ?? "pglite:memory", CLIENT_IP_HEADER: "x-test-client-ip" });
  const clientIp = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
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
    const headers: Record<string, string> = { Origin: init.origin ?? TEST_ORIGIN, "x-test-client-ip": clientIp };
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
