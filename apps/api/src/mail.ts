import { APP_NAME } from "@briv/core";
import type { Env } from "./env.ts";

export type Mailer = (message: { to: string; subject: string; text: string }) => Promise<void>;

/**
 * Sends through Resend. Only on a laptop or in tests, with no key, is the
 * message printed instead, so sign-in works while building. Live refuses to
 * start without a key (see env.ts), so codes are never printed there.
 */
export function createMailer(env: Env): Mailer {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.live) throw new Error("RESEND_API_KEY must be set in live.");
    return async ({ to, subject, text }) => {
      console.log(`[mail to ${to}] ${subject}\n${text}`);
    };
  }
  return async ({ to, subject, text }) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.mailFrom, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email was not sent (${response.status}).`);
  };
}

export function signInCodeMessage(code: string) {
  return {
    subject: `${code} is your ${APP_NAME} code`,
    text: `Your ${APP_NAME} code is ${code}.\n\nIt works for 5 minutes. If you did not ask for it, you can ignore this email.`,
  };
}

export function deleteCodeMessage(code: string) {
  return {
    subject: `${code} deletes your ${APP_NAME} account`,
    text:
      `Your code to delete your ${APP_NAME} account is ${code}.\n\n` +
      `It works for 10 minutes. Everything you saved in ${APP_NAME} is removed for good.\n` +
      `If you did not ask for this, ignore this email: nothing changes without the code.`,
  };
}
