/*
 * `pnpm dev:api`: the server on a laptop. NODE_ENV is set here, before the
 * server reads its settings, so working locally never needs live's settings,
 * and live never gets laptop defaults by accident.
 */
process.env.NODE_ENV ??= "development";
await import("./server.ts");
