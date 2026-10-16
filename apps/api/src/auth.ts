import { randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { APP_NAME } from "@briv/core";
import { authAccounts, authRateLimits, authSessions, authUsers, authVerifications, profiles, settings, type Database } from "@briv/db";
import type { Env } from "./env.ts";
import { signInCodeMessage, type Mailer } from "./mail.ts";

/*
 * Sign-in: an emailed code, Apple and Google. No passwords. Apple and Google
 * switch on only when their keys are set. Passkeys come when the app offers
 * them; until then the server does not accept them.
 *
 * When an account is made it gets a random person number, and an empty profile
 * with that number. Money is only ever filed against the person number.
 *
 * Limits, counted in the database so they hold across servers, by the
 * visitor's own address from the host's header (CLIENT_IP_HEADER):
 * - asking for a code: 3 a minute from one address, and 5 an hour for one
 *   email (that one is in app.ts, as Better Auth counts by address only);
 * - entering a code: 5 a minute; each code takes 3 wrong tries, then a new one is needed.
 * Codes are stored hashed and last 5 minutes.
 *
 * Where the host stops work once a reply is sent (Vercel), `runInBackground`
 * hands it the work that finishes after the reply, such as sending the code.
 */
export function createAuth(db: Database, env: Env, mail: Mailer, options: { runInBackground?: (task: Promise<unknown>) => void } = {}) {
  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  const trustedOrigins = [...env.origins, `${env.APP_SCHEME}://`];
  // Expo Go's own scheme, only while building on a laptop.
  if (!env.live) trustedOrigins.push("exp://");
  if (env.APPLE_CLIENT_ID) trustedOrigins.push("https://appleid.apple.com");

  return betterAuth({
    appName: APP_NAME,
    baseURL: env.authUrl,
    secret: env.secret,
    trustedOrigins,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits,
      },
    }),
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: env.CLIENT_IP_HEADER ? { ipAddressHeaders: [env.CLIENT_IP_HEADER.toLowerCase()] } : undefined,
      useSecureCookies: env.live,
      // On Vercel, work after the reply (such as sending the code) must be handed to the host, or it may be cut off.
      backgroundTasks: options.runInBackground ? { handler: options.runInBackground } : undefined,
    },
    user: {
      additionalFields: {
        personId: { type: "string", required: false, input: false, returned: false },
      },
      // Deleting goes through Briv's own route, which asks for an emailed code (routes/me.ts).
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "apple", "email-otp"] },
      // Briv never uses Apple's or Google's tokens; while they are kept, they are kept encrypted.
      encryptOAuthTokens: true,
    },
    socialProviders,
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const personId = randomUUID();
            await db.insert(profiles).values({ id: personId });
            await db.insert(settings).values({ personId });
            return { data: { ...user, personId } };
          },
        },
      },
    },
    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp }) => {
          await mail({ to: email, ...signInCodeMessage(otp) });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
