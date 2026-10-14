import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeError } from "./log.ts";
import { framesOf, readDsn, sentryReporter } from "./report.ts";

describe("error monitoring", () => {
  it("reads a Sentry address", () => {
    assert.deepEqual(readDsn("https://abc123@o1.ingest.de.sentry.io/456"), {
      endpoint: "https://o1.ingest.de.sentry.io/api/456/envelope/",
      key: "abc123",
    });
    assert.throws(() => readDsn("http://abc@host/1"));
    assert.throws(() => readDsn("https://host/1"));
  });

  it("turns code places into frames, oldest first", () => {
    assert.deepEqual(framesOf(["at inner (person.ts:10:5)", "at outer (payments.ts:20:3)", "something else"]), [
      { function: "outer", filename: "payments.ts", lineno: 20, colno: 3, in_app: true },
      { function: "inner", filename: "person.ts", lineno: 10, colno: 5, in_app: true },
    ]);
  });

  it("sends the kind of error and where, never what it said", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const report = sentryReporter("https://abc123@o1.ingest.sentry.io/456", { environment: "live", release: "abc" }, fakeFetch);

    const error = Object.assign(new Error('insert into payments values (4210, "Ada Lovelace", "SW1A 1AA")'), { code: "23505" });
    report(safeError(error), { source: "server", requestId: "req-1", method: "POST", route: "/me/payments" });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://o1.ingest.sentry.io/api/456/envelope/");
    const headers = sent[0].init.headers as Record<string, string>;
    assert.match(headers["x-sentry-auth"], /sentry_key=abc123/);
    const [, item, event] = String(sent[0].init.body).split("\n").map((line) => JSON.parse(line));
    assert.equal(item.type, "event");
    assert.equal(event.exception.values[0].type, "Error");
    assert.equal(event.tags.route, "/me/payments");
    assert.equal(event.tags.db_code, "23505");
    assert.equal(event.environment, "live");
    const everything = String(sent[0].init.body);
    for (const secret of ["Ada", "SW1A", "4210", "insert"]) assert.ok(!everything.includes(secret), secret);
  });

  it("never throws, even when Sentry cannot be reached", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const report = sentryReporter("https://abc123@o1.ingest.sentry.io/456", { environment: "test" }, failing);
    assert.doesNotThrow(() => report(safeError(new Error("x")), { source: "job" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
