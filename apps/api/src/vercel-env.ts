/*
 * Settings Vercel already knows, filled in so they need not be typed into its
 * dashboard. Anything set in the dashboard wins. Off Vercel, nothing changes.
 *
 * - The server's address and the website allowed to call it: the website and
 *   the server are one Vercel project, so both are the project's own address.
 *   A preview deployment uses its own address.
 * - The visitor's address for sign-in limits: Vercel puts it in x-real-ip and
 *   overwrites anything a visitor sends in that header.
 * - Labels for error reports: which deployment, and which commit.
 */
export function withVercelDefaults(source: Record<string, string | undefined>): Record<string, string | undefined> {
  if (!source.VERCEL) return source;
  const env = { ...source };
  const blank = (name: string) => env[name] === undefined || env[name] === "";
  const https = (host: string | undefined) => (host ? `https://${host}` : undefined);

  const production = source.VERCEL_ENV === "production";
  const own = production ? https(source.VERCEL_PROJECT_PRODUCTION_URL) : https(source.VERCEL_BRANCH_URL ?? source.VERCEL_URL);
  if (own && blank("BETTER_AUTH_URL")) env.BETTER_AUTH_URL = own;
  if (blank("APP_ORIGINS")) {
    const origins = [own, https(source.VERCEL_URL)].filter((origin): origin is string => Boolean(origin));
    if (origins.length > 0) env.APP_ORIGINS = [...new Set(origins)].join(",");
  }
  if (blank("CLIENT_IP_HEADER")) env.CLIENT_IP_HEADER = "x-real-ip";
  if (blank("SENTRY_ENVIRONMENT")) env.SENTRY_ENVIRONMENT = production ? "live" : (source.VERCEL_ENV ?? "live").slice(0, 32);
  if (blank("RELEASE") && source.VERCEL_GIT_COMMIT_SHA) env.RELEASE = source.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  return env;
}
