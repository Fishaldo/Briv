import { z } from "zod";

/*
 * Everything the server reads from its environment, checked once at start.
 * Secrets are set in the hosting dashboard, never in the repository.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  /** postgres://… in staging and live. pglite:<folder> or pglite:memory to work without a server. */
  DATABASE_URL: z.string().default("pglite:./.pglite"),
  /** Where this server is reached, used by sign-in for links and cookies. */
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8787"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Websites allowed to call the server, comma separated. The phone app is always allowed. */
  APP_ORIGINS: z.string().default("http://localhost:8081"),
  APP_SCHEME: z.string().default("briv"),
  /** Passkeys are tied to this domain. */
  PASSKEY_RP_ID: z.string().default("localhost"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Briv <codes@example.com>"),
  /** 32 random bytes, base64. Seals statement text before it is stored. */
  SEAL_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema> & {
  secret: string;
  sealKey: Buffer;
  origins: string[];
};

const DEV_SECRET = "briv-development-secret-not-for-live-use-0000000";
const DEV_SEAL = Buffer.alloc(32, 7);

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = schema.parse(source);
  const live = env.NODE_ENV === "production";
  if (live && !env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET must be set in production.");
  if (live && !env.SEAL_KEY) throw new Error("SEAL_KEY must be set in production.");
  if (live && env.DATABASE_URL.startsWith("pglite:")) throw new Error("Production needs a real Postgres DATABASE_URL.");
  const sealKey = env.SEAL_KEY ? Buffer.from(env.SEAL_KEY, "base64") : DEV_SEAL;
  if (sealKey.length !== 32) throw new Error("SEAL_KEY must be 32 bytes, base64.");
  return {
    ...env,
    secret: env.BETTER_AUTH_SECRET ?? DEV_SECRET,
    sealKey,
    origins: env.APP_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
