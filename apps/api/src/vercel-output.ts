/*
 * What the Vercel build writes besides the files themselves: how requests are
 * routed, the function's settings, and the daily job. Kept here, apart from the
 * build script, so the tests can check it.
 *
 * One project serves both: the server's paths go to the function, every other
 * path is the website (a single-page app, so unknown paths get index.html).
 */

/** Paths the server answers. Everything else is the website. */
export const SERVER_PATHS = /^\/(?:api\/auth(?:\/.*)?|me(?:\/.*)?|health|jobs\/.*)$/;

export const FUNCTION_NAME = "server";

export const outputConfig = {
  version: 3,
  routes: [
    // Server paths go straight to the function, before any file is looked up.
    { src: SERVER_PATHS.source, dest: `/${FUNCTION_NAME}` },
    // The website's own files: scripts, fonts, pictures.
    { handle: "filesystem" },
    // The website's screens are drawn in the browser, so any other path gets the app.
    { src: "/(.*)", dest: "/index.html" },
  ],
  // 03:30 UTC every day, a quiet hour in Britain.
  crons: [{ path: "/jobs/retention", schedule: "30 3 * * *" }],
} as const;

export const functionConfig = {
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  shouldAddSourcemapSupport: true,
  // London, next to the database (Neon, AWS London).
  regions: ["lhr1"],
  maxDuration: 30,
} as const;
