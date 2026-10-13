import { randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import { APP_NAME } from "@briv/core";
import {
  authAccounts,
  authPasskeys,
  authSessions,
  authUsers,
  authVerifications,
  profiles,
  settings,
  type Database,
} from "@briv/db";
import type { Env } from "./env.ts";
import { signInCodeMessage, type Mailer } from "./mail.ts";

/*
 * Sign-in: an emailed code, passkeys, Apple and Google. No passwords.
 * Apple and Google switch on only when their keys are set.
 *
 * When an account is made it gets a random person number, and an empty profile
 * with that number. Money is only ever filed against the person number.
 */
export function createAuth(db: Database, env: Env, mail: Mailer) {
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
  if (env.NODE_ENV !== "production") trustedOrigins.push("exp://");
  if (env.APPLE_CLIENT_ID) trustedOrigins.push("https://appleid.apple.com");

  return betterAuth({
    appName: APP_NAME,
    baseURL: env.BETTER_AUTH_URL,
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
        passkey: authPasskeys,
      },
    }),
    user: {
      additionalFields: {
        personId: { type: "string", required: false, input: false, returned: false },
      },
      deleteUser: {
        enabled: true,
        // Removing the profile removes every payment, place, consent and setting with it.
        beforeDelete: async (user) => {
          const [row] = await db
            .select({ personId: authUsers.personId })
            .from(authUsers)
            .where(eq(authUsers.id, user.id));
          if (row?.personId) await db.delete(profiles).where(eq(profiles.id, row.personId));
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "apple", "email-otp"] },
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
        sendVerificationOTP: async ({ email, otp }) => {
          await mail({ to: email, ...signInCodeMessage(otp) });
        },
      }),
      passkey({
        rpID: env.PASSKEY_RP_ID,
        rpName: APP_NAME,
        origin: env.origins,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
