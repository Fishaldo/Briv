import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { APP_NAME, displayShopName, readStatement, type CategoryId, type StatementRead } from "@briv/core";
import { MAX_BATCH } from "@briv/contract";
import { dayText } from "@/features/days";
import { pounds } from "@/features/money";
import { PageHead } from "@/features/page-head";
import { CategoryPicker } from "@/features/pickers";
import { api, type BatchAnswer, type Payment } from "@/lib/api";
import { CheckIcon } from "@/ui/icons";
import { Button, Card, Field, List, Problem, Row, Screen, T } from "@/ui/kit";
import { font, makeStyles, touch, useColors } from "@/ui/theme";

type Line = { amount: number; spentOn: string; shopName: string; category: CategoryId; statement: string; keep: boolean };
type Clash = { line: Line; saved: Payment; reason: "same-day" | "posted-later"; keepBoth: boolean | null };

/**
 * A bank or card statement: a CSV from the banking app, or lines pasted from
 * it. Money in is left out. The person checks each payment, then all are
 * saved in one go; ones that look already saved are asked about.
 */
export default function Statement() {
  const c = useColors();
  const styles = useStyles();
  const [text, setText] = useState("");
  const [card, setCard] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [read, setRead] = useState<StatementRead | null>(null);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [saved, setSaved] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"file" | "save" | null>(null);
  const [done, setDone] = useState(false);

  function readText(body: string, isCard = card) {
    const result = readStatement(body, { signs: isCard ? "plus-out" : undefined });
    setRead(result);
    if (result.rows.length === 0) {
      setLines(null);
      setProblem(
        result.moneyIn.length > 0
          ? "Only money coming in was found. If this is a credit card statement, turn on Credit card and try again."
          : "No payments found. Try the CSV file from your banking app, or lines like 01/10/2026, Tesco, -42.16",
      );
      return;
    }
    setProblem(null);
    setLines(
      result.rows.map((row) => ({
        amount: row.amountPence,
        spentOn: row.spentOn,
        shopName: displayShopName(row.merchant),
        category: row.category,
        // The line as printed is kept (sealed) for the person's own fixes; the tidy name is what they see.
        statement: row.description ?? row.merchant,
        keep: true,
      })),
    );
  }

  async function chooseFile() {
    setBusy("file");
    setProblem(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel"], multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if ((asset.size ?? 0) > 2_000_000) return setProblem("That file is too big. Export a shorter time from your banking app.");
      const body = Platform.OS === "web" && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      setText("");
      readText(body);
    } catch {
      setProblem("That file could not be read. Try the CSV export from your banking app.");
    } finally {
      setBusy(null);
    }
  }

  function update(index: number, change: Partial<Line>) {
    setLines((current) => current?.map((line, i) => (i === index ? { ...line, ...change } : line)) ?? null);
  }

  async function send(rows: (Line & { keepBoth?: boolean })[]) {
    let count = 0;
    const found: Clash[] = [];
    for (let start = 0; start < rows.length; start += MAX_BATCH) {
      const part = rows.slice(start, start + MAX_BATCH);
      const res = await api<BatchAnswer>("/me/payments/batch", {
        body: {
          source: "statement",
          rows: part.map((row) => ({
            amount: row.amount,
            spentOn: row.spentOn,
            shopName: row.shopName.trim() || null,
            category: row.category,
            statement: row.statement.slice(0, 500),
            ...(row.keepBoth ? { keepBoth: true } : {}),
          })),
        },
      });
      count += res.saved;
      for (const clash of res.clashes) found.push({ line: part[clash.index], saved: clash.saved, reason: clash.reason, keepBoth: null });
    }
    return { count, found };
  }

  async function save() {
    if (!lines) return;
    const kept = lines.filter((line) => line.keep);
    if (kept.length === 0) return setProblem("Keep at least one payment, or go back.");
    setBusy("save");
    setProblem(null);
    try {
      const { count, found } = await send(kept);
      setSaved(count);
      setClashes(found);
      if (found.length === 0) setDone(true);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Those did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function settleClashes() {
    const both = clashes.filter((clash) => clash.keepBoth).map((clash) => ({ ...clash.line, keepBoth: true }));
    setBusy("save");
    try {
      const { count } = both.length > 0 ? await send(both) : { count: 0 };
      setSaved((n) => n + count);
      setClashes([]);
      setDone(true);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Those did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <Screen>
        <PageHead title="Statement" fallback="/add" />
        <Card tone="brand">
          <T kind="heading">{`${saved} payment${saved === 1 ? "" : "s"} saved`}</T>
          <T>{`They are in Activity and count towards this pay. Change any one there, and ${APP_NAME} remembers it for payments like it.`}</T>
          <Button label="See them in Activity" onPress={() => router.replace("/activity")} />
          <Button label="Back to Home" kind="quiet" onPress={() => router.replace("/")} />
        </Card>
      </Screen>
    );
  }

  if (clashes.length > 0) {
    const answered = clashes.every((clash) => clash.keepBoth !== null);
    return (
      <Screen>
        <PageHead title="Already saved?" sub={`${saved} saved. These look like payments already in ${APP_NAME}. Saving both would count them twice.`} fallback="/add" />
        {clashes.map((clash, index) => (
          <Card key={`${clash.line.spentOn}-${clash.line.amount}-${index}`}>
            <T kind="strong">{`${clash.line.shopName || "Payment"} · ${pounds(clash.line.amount)} · ${dayText(clash.line.spentOn)}`}</T>
            <T kind="small">
              {clash.reason === "posted-later"
                ? `Already saved as ${clash.saved.shopName ?? "a payment to a person"} on ${dayText(clash.saved.spentOn)}. Banks often show a payment a day or two later.`
                : `Already saved as ${clash.saved.shopName ?? "a payment to a person"}.`}
            </T>
            <View style={styles.choices}>
              <Button
                label="Skip it"
                kind={clash.keepBoth === false ? "primary" : "secondary"}
                style={{ flex: 1 }}
                onPress={() => setClashes((list) => list.map((c, i) => (i === index ? { ...c, keepBoth: false } : c)))}
              />
              <Button
                label="Keep both"
                kind={clash.keepBoth === true ? "primary" : "secondary"}
                style={{ flex: 1 }}
                onPress={() => setClashes((list) => list.map((c, i) => (i === index ? { ...c, keepBoth: true } : c)))}
              />
            </View>
          </Card>
        ))}
        <Problem>{problem}</Problem>
        <Button label="Done" busy={busy === "save"} disabled={!answered} onPress={settleClashes} />
      </Screen>
    );
  }

  if (lines) {
    const kept = lines.filter((line) => line.keep);
    const total = kept.reduce((sum, line) => sum + line.amount, 0);
    return (
      <Screen
        footer={
          <>
            <Problem>{problem}</Problem>
            <Button label={`Save ${kept.length} payment${kept.length === 1 ? "" : "s"} · ${pounds(total)}`} busy={busy === "save"} onPress={save} />
          </>
        }
      >
        <PageHead
          title="Check the payments"
          sub={[
            `${lines.length} paid out.`,
            read && read.moneyIn.length > 0 ? `${read.moneyIn.length} coming in left out.` : "",
            read?.truncated ? "The file was long, so only the newest are here." : "",
            "Untick any you don't want; change a category if it's wrong.",
          ]
            .filter(Boolean)
            .join(" ")}
          fallback="/add"
        />
        <List>
          {lines.map((line, index) => (
            <Row key={`${line.spentOn}-${line.amount}-${index}`} style={{ alignItems: "flex-start" }}>
              <Pressable
                onPress={() => update(index, { keep: !line.keep })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: line.keep }}
                accessibilityLabel={`Keep ${line.shopName}, ${pounds(line.amount)}`}
                style={[styles.check, line.keep && styles.checkOn]}
                hitSlop={8}
              >
                {line.keep ? <CheckIcon size={18} color={c.onAction} /> : null}
              </Pressable>
              <View style={{ flex: 1, gap: 6, opacity: line.keep ? 1 : 0.5 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <T kind="strong" numberOfLines={2} style={{ flex: 1 }}>
                    {line.shopName || "Payment"}
                  </T>
                  <T kind="money">{pounds(line.amount)}</T>
                </View>
                <T kind="small">{dayText(line.spentOn)}</T>
                <CategoryPicker value={line.category} onChange={(category) => update(index, { category })} label={`Category for ${line.shopName}`} />
              </View>
            </Row>
          ))}
        </List>
        <Button
          label="Start again"
          kind="quiet"
          onPress={() => {
            setLines(null);
            setRead(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHead title="Bank or card statement" sub="Only payments out are read. Money coming in is left out." fallback="/add" />
      <Card>
        <T kind="heading">From your banking app</T>
        <T kind="small">Most UK banking apps can export a CSV file of your payments.</T>
        <Button label="Choose a CSV file" busy={busy === "file"} onPress={chooseFile} />
      </Card>
      <Card>
        <T kind="heading">Or paste the lines</T>
        <Field
          label="Payments"
          value={text}
          onChangeText={setText}
          multiline
          placeholder={"01/10/2026, Tesco, -42.16\n02/10/2026, Uber, -9.60"}
          style={{ minHeight: 120, paddingTop: 12, textAlignVertical: "top" }}
          autoCorrect={false}
        />
        <Button label="Read them" kind="secondary" onPress={() => readText(text)} />
      </Card>
      <View style={styles.cardRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <T kind="strong">Credit card</T>
          <T kind="small">On a card statement, payments show as plus, not minus.</T>
        </View>
        <Switch
          value={card}
          onValueChange={(on) => {
            setCard(on);
            if (text.trim()) readText(text, on);
          }}
          accessibilityLabel="Credit card statement"
          trackColor={{ true: c.action, false: c.lineStrong }}
        />
      </View>
      <Problem>{problem}</Problem>
      <T kind="small" style={{ fontFamily: font.semibold }}>
        {`${APP_NAME} keeps the statement line sealed, so only you can read it. Payments to people keep no name.`}
      </T>
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  choices: { flexDirection: "row", gap: 10 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: c.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkOn: { backgroundColor: c.action, borderColor: c.action },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: touch },
}),
);
