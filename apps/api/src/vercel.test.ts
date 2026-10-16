import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "@briv/db";
import { readEnv } from "./env.ts";
import { memoryLogger } from "./log.ts";
import { jobRoutes } from "./routes/jobs.ts";
import { withVercelDefaults } from "./vercel-env.ts";
import { functionConfig, outputConfig, SERVER_PATHS } from "./vercel-output.ts";

const secrets = {
  BETTER_AUTH_SECRET: "x".repeat(40),
  SEAL_KEYS: `k1:${Buffer.alloc(32, 1).toString("base64")}`,
  RESEND_API_KEY: "re_test",
  MAIL_FROM: "Briv <onboarding@resend.dev>",
  DATABASE_URL: "postgres://u:p@host/briv?sslmode=require",
};

const production = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_PRODUCTION_URL: "briv.vercel.app",
  VERCEL_URL: "briv-abc123.vercel.app",
  VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123",
};

describe("settings Vercel fills in", () => {
  it("changes nothing off Vercel", () => {
    const source = { NODE_ENV: "production", APP_ORIGINS: "https://example.com" };
    assert.deepEqual(withVercelDefaults(source), source);
  });

  it("uses the project's own address, Vercel's client address header and labels", () => {
    const env = withVercelDefaults(production);
    assert.equal(env.BETTER_AUTH_URL, "https://briv.vercel.app");
    assert.equal(env.APP_ORIGINS, "https://briv.vercel.app,https://briv-abc123.vercel.app");
    assert.equal(env.CLIENT_IP_HEADER, "x-real-ip");
    assert.equal(env.SENTRY_ENVIRONMENT, "live");
    assert.equal(env.RELEASE, "0123456789ab");
  });

  it("lets anything set in the dashboard win, including a blank-looking default", () => {
    const env = withVercelDefaults({ ...production, BETTER_AUTH_URL: "https://api.example.co.uk", APP_ORIGINS: "", CLIENT_IP_HEADER: "cf-connecting-ip" });
    assert.equal(env.BETTER_AUTH_URL, "https://api.example.co.uk");
    assert.equal(env.APP_ORIGINS, "https://briv.vercel.app,https://briv-abc123.vercel.app");
    assert.equal(env.CLIENT_IP_HEADER, "cf-connecting-ip");
  });

  it("gives a preview its own address", () => {
    const env = withVercelDefaults({ ...production, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "briv-git-new-thing.vercel.app" });
    assert.equal(env.BETTER_AUTH_URL, "https://briv-git-new-thing.vercel.app");
    assert.equal(env.SENTRY_ENVIRONMENT, "preview");
  });

  it("is enough for live with only the secrets typed in", () => {
    const env = readEnv(withVercelDefaults({ ...production, ...secrets }));
    assert.equal(env.live, true);
    assert.deepEqual(env.origins, ["https://briv.vercel.app", "https://briv-abc123.vercel.app"]);
  });

  it("still refuses live when a secret is missing", () => {
    assert.throws(() => readEnv(withVercelDefaults({ ...production, ...secrets, RESEND_API_KEY: "" })), /RESEND_API_KEY/);
  });
});

describe("Vercel routes", () => {
  it("sends the server's paths to the function", () => {
    for (const path of ["/api/auth/sign-in/email-otp", "/api/auth", "/me", "/me/payments", "/health", "/jobs/retention"]) {
      assert.ok(SERVER_PATHS.test(path), path);
    }
  });

  it("leaves the website's paths to the website", () => {
    for (const path of ["/", "/activity", "/settings", "/me-too", "/healthy", "/jobs", "/_expo/static/js/web/entry.js", "/favicon.ico"]) {
      assert.ok(!SERVER_PATHS.test(path), path);
    }
  });

  it("looks up files before falling back to the app, and runs the job daily in London", () => {
    const handles = outputConfig.routes.map((route) => ("handle" in route ? route.handle : route.dest));
    assert.deepEqual(handles, ["/server", "filesystem", "/index.html"]);
    assert.deepEqual(functionConfig.regions, ["lhr1"]);
    assert.equal(outputConfig.crons[0].path, "/jobs/retention");
    assert.ok(SERVER_PATHS.test(outputConfig.crons[0].path));
  });
});

describe("the daily job over the web", () => {
  const handle = createDb("pglite:memory");
  before(() => handle.migrate());
  after(() => handle.close());

  const call = (secret: string | undefined, authorization?: string) => {
    const app = jobRoutes({ db: handle.db, secret, log: memoryLogger(), today: () => "2026-10-16" });
    return app.request("/retention", { headers: authorization ? { Authorization: authorization } : {} });
  };

  it("refuses everyone when no secret is set", async () => {
    assert.equal((await call(undefined, "Bearer anything")).status, 401);
  });

  it("refuses a wrong or missing token", async () => {
    const secret = "s".repeat(40);
    assert.equal((await call(secret)).status, 401);
    assert.equal((await call(secret, `Bearer ${"t".repeat(40)}`)).status, 401);
  });

  it("runs with the right token", async () => {
    const secret = "s".repeat(40);
    const response = await call(secret, `Bearer ${secret}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});
