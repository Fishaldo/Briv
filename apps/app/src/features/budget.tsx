import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { APP_NAME, categoryLabel, NEVER_CUT, poundsToPence, type CategoryId } from "@briv/core";
import { MAX_BUDGET_LINES } from "@briv/contract";
import { api, type BudgetAnswer, type BudgetDraft } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Button, Card, Field, List, Problem, Row, T } from "@/ui/kit";
import { font, makeStyles, useColors } from "@/ui/theme";
import { pounds } from "./money";
import { CategoryPicker } from "./pickers";

type DraftLine = { key: string; name: string; category: CategoryId | null; amount: string; neverCut: boolean; usual: number; kind?: string };

let nextKey = 0;
const keyed = (line: Omit<DraftLine, "key">): DraftLine => ({ ...line, key: `l${(nextKey += 1)}` });
const SAVING = new Set<CategoryId | null>(["savings", "investments"]);

/** An amount for a form: 900 for £900, 10.99 for £10.99. */
function poundsField(pence: number): string {
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

function lineName(line: { name: string; category: CategoryId | null }): string {
  return line.name || (line.category ? categoryLabel(line.category) : "Line");
}

/**
 * This pay's budget, on Plan beside "Plan a spend". Made from the person's
 * last pays, never more than the take-home, savings first. They change any line.
 */
export function BudgetPanel() {
  const c = useColors();
  const styles = useStyles();
  const budget = useLoad<BudgetAnswer>("/me/budget");
  const [draft, setDraft] = useState<DraftLine[] | null>(null);
  const [plan, setPlan] = useState<BudgetDraft | null>(null);
  const [busy, setBusy] = useState<"make" | "fit" | "save" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const b = budget.data;

  async function make(fit = false) {
    setBusy(fit ? "fit" : "make");
    setProblem(null);
    try {
      const made = await api<BudgetDraft>(`/me/budget/draft${fit ? "?fit=1" : ""}`);
      setPlan(made);
      setDraft(
        made.lines.length > 0
          ? made.lines.map((line) =>
              keyed({ name: line.name, category: line.category, amount: poundsField(line.amount), neverCut: line.neverCut, usual: line.usual, kind: line.kind }),
            )
          : [keyed({ name: "", category: "groceries", amount: "", neverCut: false, usual: 0 })],
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function edit() {
    if (!b) return;
    setPlan(null);
    setDraft(b.lines.map((line) => keyed({ name: line.name, category: line.category, amount: poundsField(line.amount), neverCut: line.neverCut, usual: 0 })));
  }

  function update(key: string, change: Partial<DraftLine>) {
    setDraft((list) => list?.map((line) => (line.key === key ? { ...line, ...change } : line)) ?? null);
  }

  async function save() {
    if (!draft) return;
    const lines = [];
    for (const line of draft) {
      const amount = poundsToPence(line.amount);
      if (!line.category && !line.name.trim()) return setProblem("Give your own line a name, like Perfume, or pick a category.");
      if (!amount || amount <= 0) return setProblem(`Add an amount for ${lineName(line)}.`);
      lines.push({ name: line.category ? "" : line.name.trim(), category: line.category, amount, neverCut: line.neverCut });
    }
    setBusy("save");
    setProblem(null);
    try {
      await api("/me/budget", { method: "PUT", body: { lines } });
      setDraft(null);
      setPlan(null);
      await budget.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (draft) {
    const total = draft.reduce((sum, line) => sum + (poundsToPence(line.amount) ?? 0), 0);
    const takeHome = plan?.takeHome ?? b?.takeHome ?? null;
    return (
      <View style={{ gap: 16 }}>
        <T kind="small">Built from your last pays and fitted to your take-home, with savings first. Change any amount.</T>
        {plan ? <PlanSummary plan={plan} /> : null}
        {draft.map((line) => {
          const saving = SAVING.has(line.category);
          const typed = poundsToPence(line.amount) ?? 0;
          return (
            <Card key={line.key}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <T kind="label">What</T>
                  <CategoryPicker
                    value={line.category}
                    onChange={(category) => update(line.key, { category, neverCut: NEVER_CUT.has(category) })}
                    label="Budget line"
                  />
                </View>
                <View style={{ width: 120 }}>
                  <Field label="£ a pay" value={line.amount} onChangeText={(amount) => update(line.key, { amount })} keyboardType="decimal-pad" inputMode="decimal" />
                </View>
              </View>
              {line.category === null ? (
                <Field label="Name" value={line.name} onChangeText={(name) => update(line.key, { name })} placeholder="Perfume, driving lessons" maxLength={40} />
              ) : null}
              {saving ? (
                <T kind="small" style={{ color: c.saved }}>
                  {line.usual >= 100 ? `Put away first, on payday. You usually put away ${pounds(Math.round(line.usual / 100) * 100)}.` : "Put away first, on payday."}
                </T>
              ) : line.usual >= 500 && Math.abs(line.usual - typed) >= 500 ? (
                <T kind="small">{`Usually ${pounds(Math.round(line.usual / 100) * 100)} a pay`}</T>
              ) : null}
              <View style={styles.lineFoot}>
                {saving ? (
                  <View />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Switch
                      value={line.neverCut}
                      onValueChange={(neverCut) => update(line.key, { neverCut })}
                      accessibilityLabel={`Never cut ${lineName(line)}`}
                      trackColor={{ true: c.action, false: c.lineStrong }}
                    />
                    <T>Never cut</T>
                  </View>
                )}
                <Pressable
                  onPress={() => setDraft((list) => list?.filter((l) => l.key !== line.key) ?? null)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${lineName(line)}`}
                  hitSlop={10}
                >
                  <T kind="label" style={{ color: c.muted }}>
                    Remove
                  </T>
                </Pressable>
              </View>
            </Card>
          );
        })}
        {draft.length < MAX_BUDGET_LINES ? (
          <Button
            label="Add a line"
            kind="secondary"
            onPress={() => setDraft((list) => [...(list ?? []), keyed({ name: "", category: null, amount: "", neverCut: false, usual: 0 })])}
          />
        ) : null}
        <T accessibilityLiveRegion="polite">
          {`${pounds(total)} planned${takeHome ? ` of ${pounds(takeHome)} take-home` : ""}.`}
          {takeHome && total > takeHome ? <T style={{ color: c.warn }}> That is more than you take home.</T> : null}
          {takeHome && total < takeHome ? <T style={{ color: c.muted }}>{` ${pounds(takeHome - total)} spare.`}</T> : null}
        </T>
        <Problem>{problem}</Problem>
        <Button label="Save budget" busy={busy === "save"} onPress={save} />
        <Button
          label="Cancel"
          kind="quiet"
          onPress={() => {
            setDraft(null);
            setPlan(null);
          }}
        />
      </View>
    );
  }

  if (!b) return <Problem>{budget.problem}</Problem>;

  if (b.lines.length === 0) {
    return (
      <Card>
        <T kind="heading">No budget yet</T>
        <T kind="small">{`${APP_NAME} makes one from what you spent in your last pays, fitted to your take-home, with money put away first. You change any line.`}</T>
        <Problem>{problem}</Problem>
        <Button label="Make my budget" busy={busy === "make"} onPress={() => make()} />
      </Card>
    );
  }

  const over = b.takeHome != null && b.planned > b.takeHome;
  return (
    <View style={{ gap: 16 }}>
      <T kind="small">This pay's plan for your take-home, with savings first. Change any line.</T>
      {over && b.takeHome ? (
        <Card tone="warn">
          <T kind="strong" style={{ color: c.warnInk }}>{`This budget is ${pounds(b.planned - b.takeHome)} more than your ${pounds(b.takeHome)} take-home.`}</T>
          <T kind="small" style={{ color: c.warnInk }}>
            {`${APP_NAME} can fit it: savings first, rent and bills kept, the lines that bend most trimmed most.`}
          </T>
          <Button label="Fit it to my take-home" busy={busy === "fit"} onPress={() => make(true)} />
        </Card>
      ) : null}
      <List>
        {b.lines.map((line) => {
          const saving = SAVING.has(line.category);
          const share = line.amount > 0 ? Math.min(line.spent / line.amount, 1) : 0;
          const lineOver = !saving && line.spent > line.amount;
          return (
            <Row key={line.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T kind="strong" style={{ flex: 1 }} numberOfLines={1}>
                  {lineName(line)}
                </T>
                {line.neverCut && !saving ? (
                  <View style={styles.badge}>
                    <T style={styles.badgeText}>Never cut</T>
                  </View>
                ) : null}
                <T kind="money">{pounds(line.amount)}</T>
              </View>
              {line.category ? (
                <>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.max(Math.round(share * 100), 2)}%` },
                        saving ? { backgroundColor: c.saved } : lineOver ? { backgroundColor: c.warn } : null,
                      ]}
                    />
                  </View>
                  <T kind="small" style={lineOver ? { color: c.warn } : undefined}>
                    {saving
                      ? line.spent >= line.amount
                        ? `Done: ${pounds(line.spent)} put away this pay`
                        : `${pounds(line.spent)} put away, ${pounds(line.amount - line.spent)} to go`
                      : lineOver
                        ? `${pounds(line.spent)} spent, ${pounds(line.spent - line.amount)} over`
                        : `${pounds(line.spent)} spent, ${pounds(line.amount - line.spent)} left`}
                  </T>
                </>
              ) : (
                <T kind="small">{`Your own line. ${APP_NAME} keeps it in the plan.`}</T>
              )}
            </Row>
          );
        })}
      </List>
      <Card>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <T kind="strong" style={{ flex: 1 }}>
            Planned
          </T>
          <T kind="money">{`${pounds(b.planned)}${b.takeHome ? ` of ${pounds(b.takeHome)}` : ""}`}</T>
        </View>
        {b.takeHome ? (
          <T kind="small" style={over ? { color: c.warn } : undefined}>
            {over ? `${pounds(b.planned - b.takeHome)} more than your take-home.` : `${pounds(b.takeHome - b.planned)} spare for the unexpected.`}
          </T>
        ) : null}
      </Card>
      <Problem>{problem}</Problem>
      <Button label="Change the budget" kind="secondary" onPress={edit} />
      <Button label="Make it again from my pays" kind="quiet" busy={busy === "make"} onPress={() => make()} />
    </View>
  );
}

/** What the budget maker did, in plain words. */
function PlanSummary({ plan }: { plan: BudgetDraft }) {
  const c = useColors();
  if (!plan.takeHome) {
    return (
      <Card>
        <T kind="small">{`Add your take-home in Settings and ${APP_NAME} will fit this to it, with savings first.`}</T>
      </Card>
    );
  }
  const everyday = plan.lines.filter((line) => line.kind === "flexible").reduce((sum, line) => sum + line.amount, 0);
  const usualSpend = plan.lines.filter((line) => line.kind !== "savings").reduce((sum, line) => sum + line.usual, 0);
  const saved = Math.round(plan.usualSavings / 100) * 100;
  const rows: [string, number][] = [
    ["Savings", plan.savings],
    ["Never cut: rent, bills and the like", plan.fixed],
    ["Everyday spending", everyday],
  ];
  if (plan.spare > 0) rows.push(["Spare", plan.spare]);
  return (
    <Card>
      <T kind="strong">{`${pounds(plan.planned)} planned of your ${pounds(plan.takeHome)} take-home`}</T>
      {rows.map(([label, pence]) => (
        <View key={label} style={{ flexDirection: "row", gap: 10 }}>
          <T style={{ flex: 1, color: label === "Savings" ? c.saved : c.inkSoft, fontFamily: label === "Savings" ? font.bold : font.regular }}>{label}</T>
          <T kind="money" style={label === "Savings" ? { color: c.saved } : undefined}>
            {pounds(pence)}
          </T>
        </View>
      ))}
      <T kind="small" style={{ color: c.inkSoft }}>
        {saved > 0
          ? plan.savings > saved
            ? `You usually put away ${pounds(saved)} a pay. This plan puts away ${pounds(plan.savings)}.`
            : `You usually put away ${pounds(saved)} a pay. This plan keeps that.`
          : plan.savings > 0
            ? `You haven't been putting money away. This plan starts with ${pounds(plan.savings)} a pay.`
            : "There is no room to put money away this pay."}
      </T>
      {plan.trimmed.length > 0 ? (
        <View style={{ gap: 4 }}>
          <T kind="label">{`To fit, ${APP_NAME} trimmed`}</T>
          {plan.trimmed.slice(0, 6).map((row) => (
            <View key={row.name} style={{ flexDirection: "row", gap: 10 }}>
              <T style={{ flex: 1, color: c.inkSoft }} numberOfLines={1}>
                {row.name}
              </T>
              <T kind="small" style={{ textDecorationLine: "line-through" }}>
                {pounds(row.from)}
              </T>
              <T kind="money">{pounds(row.to)}</T>
            </View>
          ))}
        </View>
      ) : null}
      {plan.fixedOver ? (
        <T kind="small" style={{ color: c.warn }}>
          Rent, bills and your other never-cut lines are more than your take-home on their own. Check your take-home in Settings, or turn off Never cut on
          anything that can change.
        </T>
      ) : plan.tight ? (
        <T kind="small" style={{ color: c.warn }}>
          {`You usually spend ${pounds(Math.round(usualSpend / 100) * 100)} a pay, more than your take-home. To fit, the lines that can bend go well below usual.`}
        </T>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  lineFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  track: { height: 8, borderRadius: 4, backgroundColor: c.rule, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  badge: { backgroundColor: c.accentTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: font.bold, fontSize: 12, color: c.accent },
}),
);
