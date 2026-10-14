import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { formatGBP, poundsToPence } from "@briv/core";
import type { PaydayRuleName } from "@briv/contract";
import { api, type Me } from "@/lib/api";
import { useMe, useSession } from "@/lib/session";
import { BackIcon, CloseIcon, PinIcon } from "@/ui/icons";
import { Button, Card, Chip, Chips, Field, List, Problem, RoundButton, Row, Screen, T } from "@/ui/kit";
import { color, font, touch } from "@/ui/theme";

const PAYDAY_CHOICES: { id: PaydayRuleName; label: string; line: string }[] = [
  { id: "day_of_month", label: "A day of the month", line: "Like the 25th. Each pay runs from payday to the day before the next." },
  { id: "last_working_day", label: "Last working day", line: "The last weekday of the month that is not a bank holiday." },
  { id: "last_friday", label: "Last Friday", line: "The last Friday of the month, or the working day before it." },
  { id: "none", label: "Not monthly", line: "Pays are counted as calendar months." },
];

export default function Settings() {
  const me = useMe();
  const { setMe, signOut } = useSession();
  const [name, setName] = useState(me.name);
  const [pay, setPay] = useState(me.profile.usualTakeHome ? formatGBP(me.profile.usualTakeHome).replace(/\.00$/, "") : "");
  const [payday, setPayday] = useState(me.profile.paydayDay ? String(me.profile.paydayDay) : "");
  const [rule, setRule] = useState<PaydayRuleName>(me.profile.paydayRule);
  const [town, setTown] = useState("");
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Deleting: closed, asked "are you sure", then waiting for the emailed code. */
  const [deleting, setDeleting] = useState<"closed" | "confirm" | "code">("closed");
  const [deleteCode, setDeleteCode] = useState("");

  async function run(what: string, job: () => Promise<Me | void>) {
    setBusy(what);
    setProblem(null);
    setSaved(false);
    try {
      const next = await job();
      if (next) setMe(next);
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveYou() {
    const takeHome = pay.trim() ? poundsToPence(pay) : null;
    if (pay.trim() && takeHome === null) return setProblem("Type the take-home in pounds, like 2,400.");
    const day = rule === "day_of_month" ? Number(payday) : null;
    if (rule === "day_of_month" && (!Number.isInteger(day) || !day || day < 1 || day > 31)) return setProblem("Type the day you are paid, from 1 to 31.");
    if (!name.trim()) return setProblem("Type your first name.");
    const ok = await run("you", () =>
      api<Me>("/me", { method: "PATCH", body: { name: name.trim(), usualTakeHome: takeHome, paydayRule: rule, paydayDay: day } }),
    );
    if (ok) setSaved(true);
  }

  async function addTown() {
    const t = town.trim();
    if (t.length < 2) return setProblem("Type a town or area.");
    const ok = await run("town", () => api<Me>("/me/places", { body: { town: t } }));
    if (ok) setTown("");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <RoundButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <BackIcon size={22} />
        </RoundButton>
        <T kind="title" accessibilityRole="header" style={{ fontSize: 24 }}>
          Settings
        </T>
      </View>
      <Problem>{problem}</Problem>

      <Card>
        <T kind="heading">You and your pay</T>
        <Field label="First name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Monthly take-home pay" value={pay} onChangeText={setPay} inputMode="decimal" keyboardType="decimal-pad" placeholder="£2,400" />
        <View style={{ gap: 8 }}>
          <T kind="label">When you are paid</T>
          <Chips>
            {PAYDAY_CHOICES.map((choice) => (
              <Chip key={choice.id} label={choice.label} on={rule === choice.id} onPress={() => setRule(choice.id)} />
            ))}
          </Chips>
          <T kind="small">{PAYDAY_CHOICES.find((choice) => choice.id === rule)?.line}</T>
        </View>
        {rule === "day_of_month" ? (
          <Field
            label="Payday, day of the month"
            value={payday}
            onChangeText={setPayday}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={2}
            hint="If it falls on a weekend or bank holiday, we count the working day before, as UK employers pay."
          />
        ) : null}
        <Button label={saved ? "Saved" : "Save"} busy={busy === "you"} onPress={saveYou} />
      </Card>

      <List>
        <Row onPress={() => router.push("/regulars")}>
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="strong">Regular payments</T>
            <T kind="small">Bills and subscriptions, and stopping one</T>
          </View>
        </Row>
        <Row onPress={() => router.push("/statement")}>
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="strong">Bank statements</T>
            <T kind="small">Upload a CSV from your banking app</T>
          </View>
        </Row>
      </List>

      <View style={{ gap: 10 }}>
        <T kind="heading">Places</T>
        <List>
          <Row onPress={() => router.push("/change-location")}>
            <PinIcon size={22} color={color.green} />
            <View style={{ flex: 1, gap: 2 }}>
              <T kind="strong">{me.profile.homeTown ?? "No town yet"}</T>
              <T kind="small">{me.profile.preciseLocation ? "This phone's location · precise" : "Your town"}</T>
            </View>
            <T kind="label" style={{ color: color.green }}>
              Change
            </T>
          </Row>
          {me.places.map((p) => (
            <Row key={p.id}>
              <View style={{ flex: 1 }}>
                <T kind="strong">{p.town}</T>
                <T kind="small">Typed by you</T>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.town}`}
                onPress={() => run(`remove-${p.id}`, () => api<Me>(`/me/places/${p.id}`, { method: "DELETE" }))}
                style={styles.remove}
              >
                <CloseIcon size={20} color={color.muted} />
              </Pressable>
            </Row>
          ))}
        </List>
        <Field label="Add a town" value={town} onChangeText={setTown} autoCapitalize="words" placeholder="Where you work, or visit often" onSubmitEditing={addTown} />
        <Button label="Add town" kind="secondary" busy={busy === "town"} onPress={addTown} />
      </View>

      <View style={{ gap: 10 }}>
        <T kind="heading">Account</T>
        <T kind="small">{`Signed in as ${me.email}`}</T>
        <Button label="Sign out" kind="secondary" onPress={signOut} />
        {deleting === "confirm" ? (
          <Card tone="amber">
            <T kind="strong">Delete your account?</T>
            <T style={{ color: color.amberInk }}>Every spend, place and setting is removed. This can't be undone.</T>
            <T style={{ color: color.amberInk }}>{`We'll email a code to ${me.email} to check it's you.`}</T>
            <Button
              label="Email me the code"
              kind="danger"
              busy={busy === "code"}
              onPress={async () => {
                const ok = await run("code", async () => {
                  await api("/me/delete-code", { body: {} });
                });
                if (ok) setDeleting("code");
              }}
            />
            <Button label="Keep my account" kind="quiet" onPress={() => setDeleting("closed")} />
          </Card>
        ) : deleting === "code" ? (
          <Card tone="amber">
            <T kind="strong">Enter the code from the email</T>
            <Field
              label="6-digit code"
              value={deleteCode}
              onChangeText={(text) => setDeleteCode(text.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
            />
            <Button
              label="Delete everything"
              kind="danger"
              busy={busy === "delete"}
              disabled={deleteCode.length !== 6}
              onPress={() =>
                run("delete", async () => {
                  await api("/me", { method: "DELETE", body: { code: deleteCode } });
                  await signOut();
                })
              }
            />
            <Button
              label="Keep my account"
              kind="quiet"
              onPress={() => {
                setDeleting("closed");
                setDeleteCode("");
              }}
            />
          </Card>
        ) : (
          <Button label="Delete my account" kind="quiet" onPress={() => setDeleting("confirm")} style={{ alignSelf: "flex-start" }} />
        )}
      </View>
      <T kind="small" style={{ fontFamily: font.semibold }}>
        Reminders and a weekly check-in come with the next update.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  remove: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
});
