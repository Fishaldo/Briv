import { z } from "zod";
import { APP_NAME, APP_SCHEME } from "@briv/core";

/*
 * Everything the server reads from its environment, checked once at start.
 * Secrets are set in the hosting dashboard, never in the repository.
 *
 * It fails closed: unless NODE_ENV says "development" or "test", the server
 * runs as live and refuses to start without the settings live needs. A host
 * that forgets NODE_ENV gets live safety, not laptop defaults.
 */
const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().int().positive().default(8787),
  /** postgres://… in staging and live. pglite:<folder> or pglite:memory to work without a server. */
  DATABASE_URL: z.string().default("pglite:./.pglite"),
  /** Where this server is reached, used by sign-in for links and cookies. */
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Websites allowed to call the server, comma separated. The phone app is always allowed. */
  APP_ORIGINS: z.string().optional(),
  APP_SCHEME: z.string().default(APP_SCHEME),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /**
   * Keys that seal private text, as `id:base64` pairs, comma separated, the
   * current key first: "k2:…,k1:…". Older keys stay listed until everything
   * sealed with them has been re-sealed. Each key is 32 random bytes.
   */
  SEAL_KEYS: z.string().optional(),
  /** The first single key, kept working as key "k1". */
  SEAL_KEY: z.string().optional(),
  /**
   * The header the host puts the visitor's own address in, such as
   * cf-connecting-ip or fly-client-ip. Sign-in limits count by that address,
   * so it must be one the visitor cannot set.
   */
  CLIENT_IP_HEADER: z.string().optional(),
  /** Error monitoring (Sentry). Without it, errors are only in the log. */
  SENTRY_DSN: z.string().url().optional(),
  /** "staging" or "live" in error reports. Defaults to live or development. */
  SENTRY_ENVIRONMENT: z.string().max(32).optional(),
  /** The release running, such as the git commit, so a report says which code it came from. */
  RELEASE: z.string().max(64).optional(),
});

export type Env = z.infer<typeof schema> & {
  live: boolean;
  authUrl: string;
  secret: string;
  mailFrom: string;
  /** Sealing keys by id; `sealKeyId` is the one new text is sealed with. */
  sealKeys: Map<string, Buffer>;
  sealKeyId: string;
  origins: string[];
};

const DEV_SECRET = "briv-development-secret-not-for-live-use-0000000";
const DEV_SEAL = Buffer.alloc(32, 7);

/** Settings live cannot start without. */
const REQUIRED_LIVE = ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "APP_ORIGINS", "MAIL_FROM", "RESEND_API_KEY", "CLIENT_IP_HEADER"] as const;

function readKeys(env: z.infer<typeof schema>): { keys: Map<string, Buffer>; current: string } {
  const keys = new Map<string, Buffer>();
  let current = "";
  for (const pair of (env.SEAL_KEYS ?? "").split(",").map((part) => part.trim()).filter(Boolean)) {
    const [id, value] = pair.split(":");
    if (!id || !value || !/^[a-z0-9]{1,8}$/i.test(id)) throw new Error("SEAL_KEYS must be id:base64 pairs, such as k2:AbC…");
    keys.set(id, Buffer.from(value, "base64"));
    current ||= id;
  }
  if (env.SEAL_KEY && !keys.has("k1")) {
    keys.set("k1", Buffer.from(env.SEAL_KEY, "base64"));
    current ||= "k1";
  }
  for (const [id, key] of keys) if (key.length !== 32) throw new Error(`Sealing key ${id} must be 32 bytes, base64.`);
  return { keys, current };
}

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  // A setting left blank in a dashboard counts as not set.
  const env = schema.parse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "")));
  const live = env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
  if (live) {
    const missing = REQUIRED_LIVE.filter((name) => !env[name]);
    if (missing.length > 0) throw new Error(`Live needs ${missing.join(", ")}. Set NODE_ENV=development to work on a laptop.`);
    if (env.DATABASE_URL.startsWith("pglite:")) throw new Error("Live needs a real Postgres DATABASE_URL.");
  }
  const sealing = readKeys(env);
  if (live && sealing.keys.size === 0) throw new Error("Live needs SEAL_KEYS (or SEAL_KEY).");
  if (sealing.keys.size === 0) {
    sealing.keys.set("dev", DEV_SEAL);
    sealing.current = "dev";
  }
  return {
    ...env,
    live,
    authUrl: env.BETTER_AUTH_URL ?? "http://localhost:8787",
    secret: env.BETTER_AUTH_SECRET ?? DEV_SECRET,
    mailFrom: env.MAIL_FROM ?? `${APP_NAME} <codes@example.com>`,
    sealKeys: sealing.keys,
    sealKeyId: sealing.current,
    origins: (env.APP_ORIGINS ?? "http://localhost:8081")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
