import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { nextPayday } from "@briv/core";
import { longDate, pounds } from "@/features/money";
import { PaymentRow } from "@/features/payment-row";
import type { Payment, Summary } from "@/lib/api";
import { useMe } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { SettingsIcon } from "@/ui/icons";
import { Button, Card, List, Problem, RoundButton, Screen, T } from "@/ui/kit";
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

      {s ? <SpentCard summary={s} hasPayday={me.profile.paydayRule === "day_of_month"} /> : <View style={styles.heroPlaceholder} />}

      {s ? (
        <View style={styles.tiles}>
          <Tile label="Spending" value={pounds(s.spent)} />
          <Tile label="Saved, invested" value={pounds(s.moved)} ink={color.blue} />
          <Tile label="Spends" value={String(s.count)} />
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <T kind="heading" accessibilityRole="header">
          Latest
        </T>
        {payments.length > 0 ? (
          <List>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </List>
        ) : latest.data ? (
          <Card>
            <T kind="strong">No spends yet</T>
            <T kind="small">Add your first one and Briv starts counting this pay.</T>
            <Button label="Add a spend" onPress={() => router.navigate("/add")} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function SpentCard({ summary: s, hasPayday }: { summary: Summary; hasPayday: boolean }) {
  const share = s.takeHome ? Math.min(s.spent / s.takeHome, 1) : 0;
  const diff = s.spent - s.lastPaySameDay;
  const pace =
    s.lastPaySpent === 0
      ? "Your first pay period with Briv"
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
      <T kind="money" style={{ fontSize: 17, color: ink }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
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
