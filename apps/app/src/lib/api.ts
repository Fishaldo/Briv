import { Platform } from "react-native";
import { appErrorOf } from "@briv/contract";
import { APP_NAME } from "@briv/core";
import { authClient } from "./auth-client";
import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let signedOut: (() => void) | null = null;

/** The session registers what to do when the server says the person is no longer signed in. */
export function onSignedOut(handler: (() => void) | null) {
  signedOut = handler;
}

/** Calls the Briv server as the signed-in person. Errors carry a plain message to show. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; quiet?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (Platform.OS !== "web") {
    const cookie = await authClient.getCookie();
    if (cookie) headers.Cookie = cookie;
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: Platform.OS === "web" ? "include" : "omit",
    });
  } catch {
    throw new ApiError(0, `${APP_NAME} can't reach the internet right now. Check your connection and try again.`, {});
  }
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    // Signed out on the server (expired, or deleted on another phone): go back to Welcome, not a dead screen.
    if (response.status === 401 && !init.quiet) signedOut?.();
    const id = typeof body.requestId === "string" ? ` (ref ${body.requestId.slice(0, 8)})` : "";
    const message = typeof body.error === "string" ? `${body.error}${id}` : "Something went wrong. Try again in a moment.";
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

/**
 * Tells the server a screen crashed, so it reaches error monitoring. Only the
 * kind of error and the places in the code are sent (appErrorOf), never its
 * message. Best effort: a crash report that fails is dropped.
 */
export function reportAppError(error: unknown) {
  api("/me/app-errors", { body: appErrorOf(error), quiet: true }).catch(() => undefined);
}

/* The shapes the server sends back, written once in @briv/contract and shared with the server. */
export type { Me, Payment, Summary } from "@briv/contract";
