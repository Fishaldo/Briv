import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bankHolidays, isWorkingDay, londonToday, payPeriodOf, paydayIn, workingDayOnOrAfter, workingDaysUntil } from "./dates.ts";

describe("today in the UK", () => {
  it("reads the London date whatever the clock", () => {
    // British Summer Time: 23:30 UTC is already tomorrow in London.
    assert.equal(londonToday(new Date(Date.UTC(2026, 9, 22, 23, 30))), "2026-10-23");
    // Winter: London is on UTC.
    assert.equal(londonToday(new Date(Date.UTC(2026, 11, 1, 23, 30))), "2026-12-01");
  });
});

describe("bank holidays", () => {
  it("matches the published England and Wales dates", () => {
    const published = [
      "2025-12-25", "2025-12-26",
      "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
      "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
      "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
    ];
    const worked = [2025, 2026, 2027, 2028].flatMap((year) => [...bankHolidays(year)]).filter((day) => day >= "2025-12-01").sort();
    assert.deepEqual(worked, published);
  });

  it("keeps the one-off holidays, and does not run out", () => {
    assert.ok(bankHolidays(2022).has("2022-09-19"));
    assert.ok(bankHolidays(2023).has("2023-05-08"));
    assert.ok(!bankHolidays(2022).has("2022-05-30"));
    assert.equal(bankHolidays(2035).size, 8);
  });

  it("counts working days and moves payments off weekends", () => {
    assert.equal(isWorkingDay("2026-12-28"), false);
    assert.equal(workingDayOnOrAfter("2026-12-26"), "2026-12-29");
    // Friday 18 Dec 2026 to Tuesday 29 Dec: Mon 21 to Thu 24, then Tue 29.
    assert.equal(workingDaysUntil("2026-12-18", "2026-12-29"), 5);
  });
});

describe("paydays", () => {
  it("moves a day-of-month payday back to a working day", () => {
    assert.equal(paydayIn(2026, 10, 25), "2026-10-23");
    assert.equal(paydayIn(2026, 12, 25), "2026-12-24");
    assert.equal(paydayIn(2027, 2, 31), "2027-02-26");
  });

  it("knows the last working day and the last Friday", () => {
    assert.equal(paydayIn(2026, 8, { rule: "last_working_day" }), "2026-08-28");
    assert.equal(paydayIn(2026, 10, { rule: "last_friday" }), "2026-10-30");
  });

  it("finds the period even when payday moved into the month before", () => {
    // 1 November 2026 is a Sunday, so November's pay comes on Friday 30 October.
    assert.deepEqual(payPeriodOf("2026-10-31", 1), { start: "2026-10-30", end: "2026-11-30" });
    assert.deepEqual(payPeriodOf("2026-10-29", 1), { start: "2026-10-01", end: "2026-10-29" });
  });

  it("uses calendar months without a payday", () => {
    assert.deepEqual(payPeriodOf("2026-02-10", null), { start: "2026-02-01", end: "2026-02-28" });
    assert.deepEqual(payPeriodOf("2026-01-10", null, -1), { start: "2025-12-01", end: "2025-12-31" });
  });
});
