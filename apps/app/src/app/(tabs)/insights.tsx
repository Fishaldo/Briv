import { StyleSheet, View } from "react-native";
import { APP_NAME, categoryLabel, type CategoryId } from "@briv/core";
import { pounds } from "@/features/money";
import type { Summary } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Card, List, Problem, Row, Screen, T } from "@/ui/kit";
import { font, makeStyles, useColors } from "@/ui/theme";

export default function Insights() {
  const c = useColors();
  const styles = useStyles();
  const { data: s, problem } = useLoad<Summary>("/me/summary");

  const rows = s ? categoryRows(s) : [];
  const base = s?.takeHome || s?.spent || 1;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T kind="title" accessibilityRole="header">
          Insights
        </T>
        {s ? <T style={{ color: c.muted }}>This pay: {s.period.label}</T> : null}
      </View>
      <Problem>{problem}</Problem>

      {s ? (
        <View style={styles.compare}>
          <Card style={{ flex: 1 }}>
            <T kind="small" style={{ fontFamily: font.semibold }}>
              This pay so far
            </T>
            <T kind="money" style={{ fontSize: 22 }}>
              {pounds(s.spent)}
            </T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T kind="small" style={{ fontFamily: font.semibold }}>
              Last pay, same day
            </T>
            {s.lastPaySpent > 0 ? (
              <T kind="money" style={{ fontSize: 22 }}>
                {pounds(s.lastPaySameDay)}
              </T>
            ) : (
              <T kind="small">Nothing saved for last pay yet</T>
            )}
          </Card>
        </View>
      ) : null}

      {s && rows.length === 0 ? (
        <Card>
          <T kind="strong">Nothing to compare yet</T>
          <T kind="small">{`Add a few spends and ${APP_NAME} shows where the money went, by category.`}</T>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <View style={{ gap: 10 }}>
          <T kind="heading" accessibilityRole="header">
            By category
          </T>
          <T kind="small">{s?.takeHome ? "Share of your take-home this pay." : "Share of what you spent this pay."}</T>
          <List>
            {rows.map((row) => {
              const share = Math.min(row.now / base, 1);
              const percent = row.now > 0 && share < 0.005 ? "under 1%" : `${Math.round(share * 100)}%`;
              const change = row.now - row.last;
              return (
                <Row key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <View style={styles.rowTop}>
                    <T kind="strong" style={{ flex: 1 }}>
                      {categoryLabel(row.id)}
                    </T>
                    <T kind="money">{pounds(row.now)}</T>
                  </View>
                  <View style={styles.track} accessibilityLabel={percent}>
                    <View style={[styles.fill, { width: `${Math.max(Math.round(share * 100), row.now > 0 ? 2 : 0)}%` }]} />
                  </View>
                  <T kind="small">
                    {percent}
                    {row.last > 0
                      ? ` · ${change === 0 ? "same as" : `${pounds(Math.abs(change))} ${change > 0 ? "more than" : "less than"}`} last pay (${pounds(row.last)})`
                      : " · nothing last pay"}
                  </T>
                </Row>
              );
            })}
          </List>
        </View>
      ) : null}

      {s && s.moved > 0 ? (
        <Card tone="saved">
          <T kind="strong" style={{ color: c.saved }}>
            {pounds(s.moved)} saved, invested or moved
          </T>
          <T kind="small" style={{ color: c.saved }}>
            Not counted as spending.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}

function categoryRows(s: Summary) {
  const ids = new Set<CategoryId>([...s.byCategory.map((c) => c.id), ...s.lastPayByCategory.map((c) => c.id)]);
  return [...ids]
    .map((id) => ({
      id,
      now: s.byCategory.find((c) => c.id === id)?.amount ?? 0,
      last: s.lastPayByCategory.find((c) => c.id === id)?.amount ?? 0,
    }))
    .sort((a, b) => b.now - a.now || b.last - a.last);
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  compare: { flexDirection: "row", gap: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  track: { height: 8, borderRadius: 4, backgroundColor: c.rule, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
}),
);
