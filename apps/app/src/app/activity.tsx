import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { APP_NAME, CATEGORIES, categoryLabel, dayLabel, type CategoryId, type SearchPeriodId } from "@briv/core";
import { pounds } from "@/features/money";
import { PageHead } from "@/features/page-head";
import { PaymentRow } from "@/features/payment-row";
import { PeriodPicker } from "@/features/pickers";
import { Sheet, SheetOption } from "@/features/sheet";
import type { Payment, PaymentList } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Card, Chip, Field, List, Problem, Screen, T } from "@/ui/kit";
import { color, font } from "@/ui/theme";

/** Every spend, searchable, with totals for what is shown. Tap one to change it. */
export default function Activity() {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<SearchPeriodId>("all");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [picking, setPicking] = useState(false);

  // Search a moment after typing stops, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const params = new URLSearchParams({ period, limit: "200" });
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  const list = useLoad<PaymentList>(`/me/payments?${params.toString()}`);
  const data = list.data;
  const groups = groupByDay(data?.payments ?? []);
  const periodWords = period === "all" ? "all time" : `the last ${periodLabel(period)}`;

  return (
    <Screen>
      <PageHead title="Activity" action={<PeriodPicker value={period} onChange={setPeriod} />} />
      <Field
        label="Search"
        value={typed}
        onChangeText={setTyped}
        placeholder="Shop, item or note, like Uber or nappies"
        returnKeyType="search"
        autoCorrect={false}
      />
      <View style={styles.filters}>
        <Chip label={category ? categoryLabel(category) : "All categories"} on={!!category} onPress={() => setPicking(true)} />
        {category ? <Chip label="Clear" onPress={() => setCategory(null)} /> : null}
      </View>
      <Sheet open={picking} title="Show one category" onClose={() => setPicking(false)}>
        <SheetOption
          label="All categories"
          on={!category}
          onPress={() => {
            setPicking(false);
            setCategory(null);
          }}
        />
        {CATEGORIES.map((c) => (
          <SheetOption
            key={c.id}
            label={c.label}
            on={c.id === category}
            onPress={() => {
              setPicking(false);
              setCategory(c.id);
            }}
          />
        ))}
      </Sheet>

      <Problem>{list.problem}</Problem>

      {data ? (
        <Card accessibilityLiveRegion="polite">
          <T kind="money" style={{ fontSize: 28 }}>
            {pounds(data.totals.spent)}
          </T>
          <T kind="small">
            {`${data.totals.count} spend${data.totals.count === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}, ${periodWords}.`}
            {data.totals.moved > 0 ? ` Plus ${pounds(data.totals.moved)} saved, invested or moved.` : ""}
          </T>
        </Card>
      ) : null}

      {data && data.payments.length === 0 ? (
        <Card>
          <T kind="strong">Nothing here</T>
          <T kind="small">{query ? "No spend matches that. Try a shop name or a simpler word." : `Add a spend and it shows here.`}</T>
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.day} style={{ gap: 8 }}>
          <T kind="small" style={{ fontFamily: font.bold }}>
            {group.label}
          </T>
          <List>
            {group.items.map((p) => (
              <PaymentRow key={p.id} payment={p} onPress={() => router.push({ pathname: "/payment/[id]", params: { id: p.id } })} />
            ))}
          </List>
        </View>
      ))}
      {data?.more ? <T kind="small">{`Showing the newest ${data.payments.length}. Search or pick a shorter time to see others.`}</T> : null}
      {data && data.payments.length > 0 ? (
        <T kind="small" style={{ color: color.muted }}>{`Tap a spend to change it. ${APP_NAME} remembers the change for payments like it.`}</T>
      ) : null}
    </Screen>
  );
}

function periodLabel(id: SearchPeriodId): string {
  return { "1w": "week", "1m": "month", "3m": "3 months", "6m": "6 months", "1y": "year", all: "" }[id];
}

function groupByDay(payments: Payment[]) {
  const groups: { day: string; label: string; items: Payment[] }[] = [];
  for (const p of payments) {
    const last = groups[groups.length - 1];
    if (last && last.day === p.spentOn) last.items.push(p);
    else groups.push({ day: p.spentOn, label: dayLabel(p.spentOn), items: [p] });
  }
  return groups;
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
