import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { APP_NAME, nextPayday, poundsToPence, shortDate } from "@briv/core";
import { longDate, pounds } from "@/features/money";
import { PaymentRow } from "@/features/payment-row";
import { api, type Payment, type Summary } from "@/lib/api";
import { useMe } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { SettingsIcon } from "@/ui/icons";
import { Button, Card, Field, List, Problem, RoundButton, Row, Screen, T } from "@/ui/kit";
import { color, font, radius } from "@/ui/theme";

export default function Home() {
  const me = useMe();
  const summary = useLoad<Summary>("/me/summary");
  const s = summary.data;
  const latest = useLoad<{ payments: Payment[] }>("/me/payments?limit=8");
  const payments = latest.data?.payments ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ gap: 4, flex: 1 }}>
          <T kind="small" style={{ fontFamily: font.semibold }}>
            {longDate()}
          </T>
          <T kind="title" accessibilityRole="header" style={{ fontSize: 26 }}>
            {me.name ? `Hello, ${me.name}` : "Hello"}
          </T>
        </View>
        <RoundButton label="Settings" onPress={() => router.push("/settings")}>
          <SettingsIcon size={22} />
        </RoundButton>
      </View>

      <Problem>{summary.problem}</Problem>

      {s ? <SpentCard summary={s} hasPayday={me.profile.paydayRule !== "none"} /> : <View style={styles.heroPlaceholder} />}

      {s && s.safe ? <SafeCard summary={s} /> : null}

      {s && s.takeHome && !s.takeHomeConfirmed && me.profile.paydayRule !== "none" ? (
        <PayCheck usual={s.takeHome} onDone={() => summary.reload()} />
      ) : null}

      {s ? (
        <View style={styles.tiles}>
          <Tile label="Spending" value={pounds(s.spent)} />
          <Tile label="Put away" value={pounds(s.moved)} ink={color.blue} />
          <Tile label="Spends" value={String(s.count)} />
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={styles.sectionHead}>
          <T kind="heading" accessibilityRole="header" style={{ flex: 1 }}>
            Latest
          </T>
          {payments.length > 0 ? (
            <Pressable onPress={() => router.push("/activity")} accessibilityRole="link" hitSlop={10}>
              <T kind="label" style={{ color: color.green }}>
                See all
              </T>
            </Pressable>
          ) : null}
        </View>
        {payments.length > 0 ? (
          <List>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onPress={() => router.push({ pathname: "/payment/[id]", params: { id: p.id } })} />
            ))}
          </List>
        ) : latest.data ? (
          <Card>
            <T kind="strong">No spends yet</T>
            <T kind="small">{`Add your first one and ${APP_NAME} starts counting this pay.`}</T>
            <Button label="Add a spend" onPress={() => router.navigate("/add")} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

/** What is safe to spend until payday, after the bills still to come. */
function SafeCard({ summary: s }: { summary: Summary }) {
  const safe = s.safe;
  if (!safe) return null;
  const over = safe.safe < 0;
  const bills = safe.bills.reduce((sum, bill) => sum + bill.amount, 0);
  return (
    <List>
      <Row style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <T kind="small" style={{ fontFamily: font.semibold }}>
          {over ? "Over your take-home until payday" : "Safe to spend until payday"}
        </T>
        <T kind="money" style={{ fontSize: 26, color: over ? color.danger : color.ink }}>
          {pounds(Math.abs(safe.safe))}
        </T>
        <T kind="small">
          {over
            ? "Spending and bills to come are more than this pay."
            : `About ${pounds(safe.perDay)} a day for ${safe.daysLeft} day${safe.daysLeft === 1 ? "" : "s"}.`}
          {bills > 0 ? ` ${pounds(bills)} of bills still to come is already taken off.` : ""}
        </T>
      </Row>
      {safe.bills.slice(0, 3).map((bill) => (
        <Row key={`${bill.key}-${bill.due}`}>
          <T style={{ flex: 1 }} numberOfLines={1}>
            {bill.name}
          </T>
          <T kind="small">{shortDate(bill.due)}</T>
          <T kind="money">{pounds(bill.amount)}</T>
        </Row>
      ))}
      <Row onPress={() => router.push("/regulars")}>
        <T kind="label" style={{ color: color.green, flex: 1 }}>
          Regular payments
        </T>
      </Row>
    </List>
  );
}

/** "Did £2,400 come in this pay?" Asked once a pay, so safe to spend uses what really came in. */
function PayCheck({ usual, onDone }: { usual: number; onDone: () => void }) {
  const [other, setOther] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirm(takeHome: number | null) {
    if (takeHome === null || takeHome < 0) return setProblem("Type the amount in pounds, like 2,350.");
    setBusy(true);
    setProblem(null);
    try {
      await api("/me/pay", { method: "PUT", body: { takeHome } });
      onDone();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="green">
      <T kind="strong">{`Did ${pounds(usual)} come in this pay?`}</T>
      <T kind="small" style={{ color: color.inkSoft }}>
        Safe to spend uses what really came in.
      </T>
      {other ? (
        <>
          <Field label="What came in (£)" value={typed} onChangeText={setTyped} keyboardType="decimal-pad" inputMode="decimal" placeholder="£2,350" />
          <Button label="Save" busy={busy} onPress={() => confirm(poundsToPence(typed))} />
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Yes" busy={busy} style={{ flex: 1 }} onPress={() => confirm(usual)} />
          <Button label="A different amount" kind="secondary" style={{ flex: 1.4 }} onPress={() => setOther(true)} />
        </View>
      )}
      <Problem>{problem}</Problem>
    </Card>
  );
}

function SpentCard({ summary: s, hasPayday }: { summary: Summary; hasPayday: boolean }) {
  const share = s.takeHome ? Math.min(s.spent / s.takeHome, 1) : 0;
  const diff = s.spent - s.lastPaySameDay;
  const pace =
    s.lastPaySpent === 0
      ? `Your first pay period with ${APP_NAME}`
      : diff === 0
        ? "Same as this point last pay"
        : `${pounds(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than this point last pay`;
  const when = hasPayday
    ? `Day ${s.period.day} of ${s.period.days} · payday ${nextPayday(s.period)}`
    : `Day ${s.period.day} of ${s.period.days} · ${s.period.label}`;
  return (
    <View style={styles.hero} accessibilityRole="summary">
      <View style={{ gap: 4 }}>
        <T style={styles.heroLabel}>Spent so far this pay</T>
        <T style={styles.heroAmount}>{pounds(s.spent)}</T>
        {s.takeHome ? <T style={styles.heroLabel}>of {pounds(s.takeHome)} take-home</T> : null}
      </View>
      {s.takeHome ? (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={`${Math.round(share * 100)}% of take-home spent`}
        >
          <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
        </View>
      ) : null}
      <T style={styles.heroLabel}>{when}</T>
      <View style={styles.pace}>
        <T style={styles.paceText}>{pace}</T>
      </View>
    </View>
  );
}

function Tile({ label, value, ink = color.ink }: { label: string; value: string; ink?: string }) {
  return (
    <View style={styles.tile}>
      <T kind="small" style={{ fontFamily: font.semibold, fontSize: 12 }} numberOfLines={2}>
        {label}
      </T>
      <T kind="money" style={{ fontSize: value.length > 7 ? 15 : 17, color: ink }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroPlaceholder: { height: 220, borderRadius: radius.hero, backgroundColor: color.greenTint },
  hero: { backgroundColor: color.green, borderRadius: radius.hero, padding: 22, gap: 14 },
  heroLabel: { color: color.greenOnDark, fontFamily: font.semibold, fontSize: 14 },
  heroAmount: { color: color.white, fontFamily: font.heavy, fontSize: 42, lineHeight: 50, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.white },
  pace: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  paceText: { color: color.white, fontFamily: font.bold, fontSize: 13 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    minHeight: 92,
    justifyContent: "space-between",
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
});
