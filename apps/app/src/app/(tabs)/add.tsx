import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { APP_NAME, CATEGORIES, parseAlert, poundsToPence, type CategoryId } from "@briv/core";
import { readDay, shiftDay } from "@/features/days";
import { pounds } from "@/features/money";
import { api, ApiError, type Payment } from "@/lib/api";
import { CloseIcon } from "@/ui/icons";
import { Button, Card, Chip, Chips, Field, List, Problem, RoundButton, Row, Screen, T } from "@/ui/kit";
import { color, font, radius } from "@/ui/theme";

const SOON = [
  { title: "Scan a receipt", line: "Shop, items and total" },
  { title: "Photos, screenshots or PDF", line: "Receipts or bank screenshots, up to 8" },
  { title: "Say it", line: "“About £20 at ASDA, groceries”" },
  { title: "Connect your email", line: "Receipts read if you allow it" },
  { title: "Connect a bank or card", line: "Payments arrive by themselves" },
];

type Saved = Pick<Payment, "id" | "amount" | "shopName" | "spentOn">;

export default function Add() {
  const [amount, setAmount] = useState("");
  const [shop, setShop] = useState("");
  const [when, setWhen] = useState<"today" | "yesterday" | "other">("today");
  const [otherDay, setOtherDay] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; shop?: string; day?: string; category?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<Saved | null>(null);
  const [message, setMessage] = useState("");
  const [fromMessage, setFromMessage] = useState(false);
  const [messageNote, setMessageNote] = useState<string | null>(null);

  /** Reads a pasted payment message into the form, for the person to check before saving. */
  function readMessage() {
    const text = message.trim();
    if (!text) return setMessageNote("Paste the message first.");
    const read = parseAlert(text);
    if (!read.amountPence) return setMessageNote("No amount found in that message. Type the spend below instead.");
    setAmount((read.amountPence / 100).toFixed(2));
    if (read.merchant && read.merchant !== "Card payment") setShop(read.merchant);
    if (read.category !== "other") setCategory(read.category);
    setFromMessage(true);
    setMessageNote("Check the spend below, then save.");
  }

  function read() {
    const found: typeof errors = {};
    const pence = poundsToPence(amount);
    if (!pence || pence <= 0) found.amount = "Type the amount in pounds, like 12.50.";
    if (!shop.trim()) found.shop = "Type the shop, like Tesco.";
    const spentOn = when === "today" ? shiftDay(0) : when === "yesterday" ? shiftDay(-1) : readDay(otherDay);
    if (!spentOn) found.day = "Type the day like 13/10/2026.";
    if (!category) found.category = "Pick a category.";
    setErrors(found);
    if (Object.keys(found).length || !pence || !spentOn || !category) return null;
    return { amount: pence, shopName: shop.trim(), spentOn, category, source: fromMessage ? ("message" as const) : ("typed" as const) };
  }

  async function save(choice?: { choice: "keep_both" } | { choice: "replace"; savedId: string }) {
    const body = read();
    if (!body) return;
    setBusy(true);
    setProblem(null);
    try {
      await api<{ payment: Payment }>("/me/payments", { body: choice ? { ...body, duplicate: choice } : body });
      setDuplicate(null);
      setAmount("");
      setShop("");
      setCategory(null);
      setWhen("today");
      setOtherDay("");
      setMessage("");
      setFromMessage(false);
      setMessageNote(null);
      router.navigate("/");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.body.duplicate) {
        setDuplicate(error.body.duplicate as Saved);
      } else {
        setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <RoundButton label="Close" onPress={() => router.navigate("/")}>
          <CloseIcon size={22} />
        </RoundButton>
        <T kind="title" accessibilityRole="header" style={{ fontSize: 24 }}>
          Add a spend
        </T>
      </View>

      <List>
        <Row onPress={() => router.push("/statement")}>
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="strong">Bank or card statement</T>
            <T kind="small">A CSV from your banking app, or pasted lines. Check them, then save in one go.</T>
          </View>
          <T kind="label" style={{ color: color.green }}>
            Open
          </T>
        </Row>
      </List>

      <Card>
        <T kind="heading">Paste a payment message</T>
        <T kind="small">From Google Pay, Apple Pay, your bank or Uber.</T>
        <Field
          label="Message"
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            setMessageNote(null);
          }}
          placeholder="You paid £14.80 to Uber"
          multiline
          style={{ minHeight: 80, paddingTop: 12, textAlignVertical: "top" }}
        />
        {messageNote ? <T kind="small" accessibilityLiveRegion="polite">{messageNote}</T> : null}
        <Button label="Read it" kind="secondary" onPress={readMessage} />
      </Card>

      <Card>
        <T kind="heading">{fromMessage ? "Check and save" : "Type it in"}</T>
        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="£0.00"
          error={errors.amount}
        />
        <Field label="Shop" value={shop} onChangeText={setShop} autoCapitalize="words" placeholder="Tesco" error={errors.shop} />
        <View style={{ gap: 8 }}>
          <T kind="label">When</T>
          <Chips>
            <Chip label="Today" on={when === "today"} onPress={() => setWhen("today")} />
            <Chip label="Yesterday" on={when === "yesterday"} onPress={() => setWhen("yesterday")} />
            <Chip label="Another day" on={when === "other"} onPress={() => setWhen("other")} />
          </Chips>
          {when === "other" ? (
            <Field label="Day" value={otherDay} onChangeText={setOtherDay} placeholder="13/10/2026" inputMode="numeric" error={errors.day} />
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <T kind="label">Category</T>
          <Chips>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} label={c.label} on={category === c.id} onPress={() => setCategory(c.id)} />
            ))}
          </Chips>
          {errors.category ? (
            <T kind="small" style={{ color: color.danger }}>
              {errors.category}
            </T>
          ) : (
            <T kind="small">Savings, investments and transfers are kept apart from spending.</T>
          )}
        </View>
        <Problem>{problem}</Problem>
        {duplicate ? (
          <Card tone="amber">
            <T kind="heading" accessibilityRole="header">
              Already saved?
            </T>
            <T style={{ color: color.amberInk }}>
              {`${duplicate.shopName ?? "A payment"}, ${pounds(duplicate.amount)} on ${duplicate.spentOn.split("-").reverse().join("/")} is already in ${APP_NAME}.`}
            </T>
            <Button label="Keep the saved one" kind="secondary" disabled={busy} onPress={() => setDuplicate(null)} />
            <Button label="Replace it with this one" kind="secondary" busy={busy} onPress={() => save({ choice: "replace", savedId: duplicate.id })} />
            <Button label="Keep both" kind="quiet" disabled={busy} onPress={() => save({ choice: "keep_both" })} />
          </Card>
        ) : null}
        {duplicate ? null : <Button label="Save" busy={busy} onPress={() => save()} />}
      </Card>

      <View style={{ gap: 10 }}>
        <T kind="heading">Coming next</T>
        <View style={styles.grid}>
          {SOON.map((item) => (
            <View key={item.title} style={styles.soon} accessibilityState={{ disabled: true }}>
              <T kind="strong" style={{ fontFamily: font.heavy }}>
                {item.title}
              </T>
              <T kind="small">{item.line}</T>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  soon: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 96,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.line,
    borderStyle: "dashed",
    padding: 14,
    gap: 6,
  },
});
