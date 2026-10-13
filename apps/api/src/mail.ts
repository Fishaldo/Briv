import type { Env } from "./env.ts";

export type Mailer = (message: { to: string; subject: string; text: string }) => Promise<void>;

/**
 * Sends through Resend when a key is set. Without one (on a laptop, in tests)
 * the message is printed instead, so sign-in still works while building.
 */
export function createMailer(env: Env): Mailer {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY must be set in production.");
    return async ({ to, subject, text }) => {
      console.log(`[mail to ${to}] ${subject}\n${text}`);
    };
  }
  return async ({ to, subject, text }) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
    });
    if (!response.ok) throw new Error(`Email was not sent (${response.status}).`);
  };
}

export function signInCodeMessage(code: string) {
  return {
    subject: `${code} is your Briv code`,
    text: `Your Briv code is ${code}.\n\nIt works for 5 minutes. If you did not ask for it, you can ignore this email.`,
  };
}
