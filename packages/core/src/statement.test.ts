import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyIn, readAmount, readCsv, readStatement, statementDate } from "./statement.ts";

/*
 * Samples laid out like each bank's own export. The payees and amounts are
 * made up; the columns, signs and quirks are the point.
 */

const MONZO = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
tx_1,01/10/2026,08:14:02,Card payment,Tesco,,Groceries,-24.50,GBP,-24.50,GBP,,,,TESCO STORES 2041,,-24.50,
tx_2,02/10/2026,12:00:00,Faster payment,Ada Eze,,Transfers,-50.00,GBP,-50.00,GBP,,,,ADA EZE,,-50.00,
tx_3,25/09/2026,06:00:00,Faster payment,ACME LTD,,Income,2200.00,GBP,2200.00,GBP,,,,ACME LTD SALARY,,,2200.00`;

const STARLING = `Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes
03/10/2026,Greggs,GREGGS 1234,CONTACTLESS,-3.20,1200.00,EATING_OUT,
04/10/2026,Octopus Energy,OCTOPUS,DIRECT DEBIT,-89.00,1111.00,BILLS_AND_SERVICES,`;

const BARCLAYS = `Number,Date,Account,Amount,Subcategory,Memo
,05/10/2026,20-00-00 12345678,-12.99,PAYMENT,NETFLIX.COM
,06/10/2026,20-00-00 12345678,1500.00,FT,ACME LTD`;

const LLOYDS = `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance
07/10/2026,DEB,'30-00-00,12345678,SAINSBURYS S/MKTS,31.40,,980.10
08/10/2026,FPI,'30-00-00,12345678,ACME LTD,,2200.00,3180.10`;

const NATIONWIDE = `"Account Name:","FlexAccount ****1234"
"Account Balance:","£1,020.00"
"Available Balance: ","£1,020.00"

"Date","Transaction type","Description","Paid out","Paid in","Balance"
"09 Oct 2026","Visa purchase","Boots","£6.75","","£1,013.25"
"10 Oct 2026","Bank credit","ACME LTD","","£2,200.00","£3,213.25"`;

const HSBC = `11/10/2026,"PRET A MANGER 12",-4.85
12/10/2026,"TFL TRAVEL CH",-7.00
12/10/2026,"ACME LTD",2200.00`;

const AMEX = `Date,Description,Card Member,Account #,Amount
13/10/2026,ASOS.COM,A N OTHER,-11001,45.00
14/10/2026,PAYMENT RECEIVED - THANK YOU,A N OTHER,-11001,-500.00`;

describe("bank exports", () => {
  it("reads Monzo: money out only, money in kept apart", () => {
    const read = readStatement(MONZO);
    assert.deepEqual(
      read.rows.map((row) => [row.spentOn, row.merchant, row.amountPence, row.category]),
      [
        ["2026-10-01", "Tesco", 2450, "groceries"],
        ["2026-10-02", "Ada Eze", 5000, "transfers"],
      ],
    );
    assert.deepEqual(read.moneyIn, [{ merchant: "ACME LTD", amountPence: 220000, date: "2026-09-25" }]);
    assert.equal(read.skipped, 0);
  });

  it("reads Starling's signed amounts and its own categories", () => {
    const read = readStatement(STARLING);
    assert.deepEqual(
      read.rows.map((row) => [row.merchant, row.amountPence, row.category]),
      [
        ["Greggs", 320, "dining"],
        ["Octopus Energy", 8900, "bills"],
      ],
    );
  });

  it("reads Barclays, where the payee is in the memo", () => {
    const read = readStatement(BARCLAYS);
    assert.deepEqual(read.rows.map((row) => [row.merchant, row.amountPence, row.category]), [["NETFLIX.COM", 1299, "subscriptions"]]);
    assert.equal(read.moneyIn.length, 1);
  });

  it("reads Lloyds' separate debit and credit columns", () => {
    const read = readStatement(LLOYDS);
    assert.equal(read.signs, "columns");
    assert.deepEqual(read.rows.map((row) => [row.merchant, row.amountPence, row.category]), [["SAINSBURYS S/MKTS", 3140, "groceries"]]);
    assert.deepEqual(read.moneyIn.map((row) => row.amountPence), [220000]);
  });

  it("finds Nationwide's header below the account lines, and reads £ amounts", () => {
    const read = readStatement(NATIONWIDE);
    assert.deepEqual(read.rows.map((row) => [row.spentOn, row.merchant, row.amountPence]), [["2026-10-09", "Boots", 675]]);
    assert.deepEqual(read.moneyIn.map((row) => row.amountPence), [220000]);
  });

  it("reads HSBC with no header row", () => {
    const read = readStatement(HSBC);
    assert.deepEqual(
      read.rows.map((row) => [row.merchant, row.amountPence]),
      [
        ["PRET A MANGER 12", 485],
        ["TFL TRAVEL CH", 700],
      ],
    );
    assert.equal(read.moneyIn.length, 1);
  });

  it("reads a credit card the right way round: purchases are plus, the repayment is not spending", () => {
    const read = readStatement(AMEX);
    assert.equal(read.signs, "plus-out");
    assert.deepEqual(read.rows.map((row) => [row.merchant, row.amountPence]), [["ASOS.COM", 4500]]);
    assert.equal(read.moneyIn[0].amountPence, 50000);
  });

  it("lets the person say which way round the amounts are", () => {
    const read = readStatement(`Date,Description,Amount\n01/10/2026,Tesco,24.50`, { signs: "plus-out" });
    assert.deepEqual(read.rows.map((row) => row.amountPence), [2450]);
  });
});

describe("awkward files", () => {
  it("reads a quoted description that runs over two lines", () => {
    const read = readStatement(`Date,Description,Amount\n01/10/2026,"TESCO\nSTORES 2041",-24.50\n02/10/2026,Greggs,-3.20`);
    assert.deepEqual(read.rows.map((row) => [row.merchant, row.amountPence]), [
      ["TESCO STORES 2041", 2450],
      ["Greggs", 320],
    ]);
  });

  it("counts lines it could not read instead of dropping them silently", () => {
    const read = readStatement(`Date,Description,Amount\n01/10/2026,Tesco,-24.50\nnot a date,Greggs,-3.20\n02/10/2026,Boots,`);
    assert.equal(read.rows.length, 1);
    assert.equal(read.skipped, 2);
  });

  it("reads semicolon files", () => {
    const read = readStatement(`Date;Description;Amount\n01/10/2026;Tesco;-24,50`);
    // A comma decimal is not a UK format: the line is counted as unread rather than guessed.
    assert.equal(read.rows.length, 0);
    assert.equal(read.skipped, 1);
  });

  it("keeps money in out of spending even when the type column says so", () => {
    const read = readStatement(`Date,Type,Description,Amount\n01/10/2026,SALARY,ACME,-1.00\n02/10/2026,DEB,Tesco,-5.00`);
    assert.deepEqual(read.rows.map((row) => row.merchant), ["Tesco"]);
  });

  it("dates pasted lines without a date as today in the UK", () => {
    const read = readStatement("Tesco £12.00", { today: "2026-10-14" });
    assert.deepEqual(read.rows.map((row) => [row.spentOn, row.amountPence]), [["2026-10-14", 1200]]);
  });

  it("still gives money in through the old helper", () => {
    assert.equal(parseMoneyIn(MONZO)[0].amountPence, 220000);
  });
});

describe("amounts and dates", () => {
  it("reads every way banks write an amount", () => {
    assert.equal(readAmount("-12.00"), -1200);
    assert.equal(readAmount("−12.00"), -1200);
    assert.equal(readAmount("(12.00)"), -1200);
    assert.equal(readAmount("12.00-"), -1200);
    assert.equal(readAmount("12.00 DR"), -1200);
    assert.equal(readAmount("12.00 CR"), 1200);
    assert.equal(readAmount("£1,234.56"), 123456);
    assert.equal(readAmount("GBP 7.5"), 750);
    assert.equal(readAmount(""), null);
    assert.equal(readAmount("abc"), null);
    assert.equal(readAmount("24,50"), null);
    assert.equal(readAmount("1,2345"), null);
  });

  it("reads UK dates day first, and an American one only when it must", () => {
    assert.equal(statementDate("05/10/2026"), "2026-10-05");
    assert.equal(statementDate("05-10-26"), "2026-10-05");
    assert.equal(statementDate("25-Sep-2026"), "2026-09-25");
    assert.equal(statementDate("25 September 2026"), "2026-09-25");
    assert.equal(statementDate("10/25/2026"), "2026-10-25");
    assert.equal(statementDate("31/02/2026"), null);
  });

  it("splits cells by the file's own delimiter", () => {
    assert.deepEqual(readCsv("a\tb\n1\t2"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
