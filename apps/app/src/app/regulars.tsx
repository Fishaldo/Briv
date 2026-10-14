import { useState } from "react";
import { View } from "react-native";
import { APP_NAME, FREQ_LABEL, isFreq } from "@briv/core";
import { dayText } from "@/features/days";
import { pounds } from "@/features/money";
import { PageHead } from "@/features/page-head";
import { api, type RegularItem } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Button, Card, List, Problem, Row, Screen, T } from "@/ui/kit";
import { useColors } from "@/ui/theme";

function when(item: RegularItem): string {
  if (item.stopped) return "Stopped";
  if (item.lapsed) return "Not paid for a while: maybe cancelled";
  if (!item.nextDue || item.daysLeft == null) return "";
  if (item.daysLeft === 0) return "Due today";
  if (item.daysLeft === 1) return "Due tomorrow";
  return `Next ${dayText(item.nextDue)}, in ${item.daysLeft} days`;
}

/** What comes out regularly: bills, subscriptions and rent, found in the person's own payments. */
export default function Regulars() {
  const c = useColors();
  const list = useLoad<{ items: RegularItem[] }>("/me/regulars");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const items = list.data?.items ?? [];
  const live = items.filter((item) => !item.stopped && !item.lapsed);
  const monthly = live.reduce((sum, item) => sum + item.monthly, 0);

  async function change(item: RegularItem, body: { stopped?: boolean; remind?: boolean }) {
    setBusy(item.key);
    setProblem(null);
    try {
      await api(`/me/regulars/${encodeURIComponent(item.key)}`, { method: "PATCH", body });
      await list.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <PageHead title="Regular payments" sub="Bills, subscriptions and rent, found in your own payments." />
      <Problem>{problem ?? list.problem}</Problem>
      {list.data && items.length === 0 ? (
        <Card>
          <T kind="strong">None found yet</T>
          <T kind="small">{`Once a payment comes out the same way two or three times, ${APP_NAME} lists it here and counts it before payday.`}</T>
        </Card>
      ) : null}
      {live.length > 0 ? (
        <Card tone="brand">
          <T kind="small" style={{ color: c.accent }}>
            About this much a month
          </T>
          <T kind="money" style={{ fontSize: 26, color: c.accent }}>
            {pounds(monthly)}
          </T>
        </Card>
      ) : null}
      {items.length > 0 ? (
        <List>
          {items.map((item) => (
            <Row key={item.key} onPress={() => setOpen(open === item.key ? null : item.key)} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <T kind="strong" style={{ flex: 1, opacity: item.stopped ? 0.6 : 1 }} numberOfLines={1}>
                  {item.name}
                </T>
                <T kind="money">{pounds(item.amount)}</T>
              </View>
              <T kind="small">
                {[isFreq(item.freq) ? FREQ_LABEL[item.freq] : "", when(item)].filter(Boolean).join(" · ")}
              </T>
              {item.rise ? (
                <T kind="small" style={{ color: c.warn }}>{`Went up from ${pounds(item.rise.from)} to ${pounds(item.rise.to)} on ${dayText(item.rise.on)}`}</T>
              ) : null}
              {item.paidAfterStop ? <T kind="small" style={{ color: c.bad }}>Marked as stopped, but paid again since.</T> : null}
              {open === item.key ? (
                <View style={{ gap: 8, paddingTop: 6 }}>
                  <Button
                    label={item.stopped ? "It's still going" : "I've cancelled this"}
                    kind="secondary"
                    busy={busy === item.key}
                    onPress={() => change(item, { stopped: !item.stopped })}
                  />
                  {item.stopped ? null : (
                    <T kind="small">{`Stopped payments are left out of what's safe to spend.`}</T>
                  )}
                </View>
              ) : null}
            </Row>
          ))}
        </List>
      ) : null}
    </Screen>
  );
}
