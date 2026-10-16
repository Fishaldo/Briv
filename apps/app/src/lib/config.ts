/**
 * Where the Briv server is. Set EXPO_PUBLIC_API_URL for staging and live.
 * On a phone in development, use the computer's network address, not localhost.
 *
 * "same-origin" is for the website when it is served by the server itself (one
 * Vercel project): the website calls the address it was loaded from, so a
 * preview deployment talks to its own server.
 */
const configured = String(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787");

export const API_URL = (configured === "same-origin" ? String(globalThis.location?.origin ?? "") : configured).replace(/\/$/, "");

/** Sign-in buttons to show, as set up on the server: "apple,google". Email is always there. */
export const SIGN_IN_PROVIDERS = new Set(
  String(process.env.EXPO_PUBLIC_SIGN_IN_PROVIDERS ?? "")
    .split(",")
    .map((p: string) => p.trim())
    .filter(Boolean),
);

export { APP_NAME, APP_SCHEME } from "@briv/core";
