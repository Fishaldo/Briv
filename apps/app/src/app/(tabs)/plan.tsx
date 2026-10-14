import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { APP_NAME } from "@briv/core";
import { BudgetPanel } from "@/features/budget";
import { Card, Chip, Screen, T } from "@/ui/kit";
import { color } from "@/ui/theme";

const SOON = [
  "Pick what you are planning, then up to 3 quick questions.",
  "Deals in your town first, then across the UK.",
  "Only offers a public page actually states.",
  `Add it to your Watchlist: ${APP_NAME} keeps looking every day.`,
];

/** Plan: a spend before you make it, or this pay's budget. Budget sits here so it is easy to find. */
export default function Plan() {
  const { part } = useLocalSearchParams<{ part?: string }>();
  const onBudget = part === "budget";
  const show = (budget: boolean) => router.setParams({ part: budget ? "budget" : undefined });

  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Plan
      </T>
      <View style={styles.switch}>
        <Chip label="Plan a spend" on={!onBudget} onPress={() => show(false)} wide />
        <Chip label="Budget" on={onBudget} onPress={() => show(true)} wide />
      </View>
      {onBudget ? (
        <BudgetPanel />
      ) : (
        <>
          <T style={{ color: color.muted }}>Before you buy: deals near you first, then across the UK.</T>
          <Card>
            <T kind="strong">Coming next</T>
            {SOON.map((line) => (
              <T key={line} kind="small" style={{ color: color.inkSoft }}>
                {`• ${line}`}
              </T>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: "row", gap: 10 },
});
