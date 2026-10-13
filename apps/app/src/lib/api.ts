import { Platform } from "react-native";
import { APP_NAME, type CategoryId } from "@briv/core";
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

/** Calls the Briv server as the signed-in person. Errors carry a plain message to show. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "Something went wrong. Try again in a moment.";
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

/* The shapes the server sends back. */

export type Me = {
  name: string;
  email: string;
  profile: {
    country: string;
    currency: string;
    homeTown: string | null;
    paydayRule: "none" | "day_of_month" | "last_working_day" | "last_friday";
    paydayDay: number | null;
    usualTakeHome: number | null;
    preciseLocation: boolean;
    locationAsked: boolean;
    onboarded: boolean;
  };
  settings: { reminders: boolean; weeklyDay: number | null };
  places: { id: string; town: string }[];
};

export type Payment = {
  id: string;
  amount: number;
  currency: string;
  spentOn: string;
  shopName: string | null;
  category: CategoryId;
  kind: string | null;
  source: string;
  countsAsSpending: boolean;
  toPerson: boolean;
  hasReceipt: boolean;
  note: string | null;
};

export type Summary = {
  period: { start: string; end: string; label: string; short: string; day: number; days: number };
  previousPeriod: { start: string; end: string; label: string; short: string };
  takeHome: number | null;
  spent: number;
  moved: number;
  count: number;
  byCategory: { id: CategoryId; amount: number }[];
  lastPayByCategory: { id: CategoryId; amount: number }[];
  lastPaySpent: number;
  lastPaySameDay: number;
  projected: number | null;
};
