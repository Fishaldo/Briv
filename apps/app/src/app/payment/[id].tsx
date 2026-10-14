import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { APP_NAME, countsAsSpending, poundsToPence, type CategoryId } from "@briv/core";
import { dayText, readDay } from "@/features/days";
import { pounds } from "@/features/money";
import { PageHead } from "@/features/page-head";
import { CategoryPicker } from "@/features/pickers";
import { api, type Payment } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Button, Card, Field, Problem, Screen, T } from "@/ui/kit";
import { color } from "@/ui/theme";

/** One spend: change its amount, shop, day, category or note, or delete it. */
export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useLoad<{ payment: Payment }>(id ? `/me/payments/${id}` : null);
  const payment = loaded.data?.payment;

  const [amount, setAmount] = useState("");
  const [shop, setShop] = useState("");
  const [day, setDay] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [note, setNote] = useState("");
  const [applyToSame, setApplyToSame] = useState(true);
  const [errors, setErrors] = useState<{ amount?: string; day?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Fill the form once the spend has loaded.
  useEffect(() => {
    if (!payment) return;
    setAmount((payment.amount / 100).toFixed(2));
    setShop(payment.shopName ?? "");
    setDay(dayText(payment.spentOn));
    setCategory(payment.category);
    setNote(payment.note ?? "");
  }, [payment]);

  if (!payment) {
    return (
      <Screen>
        <PageHead title="Spend" fallback="/activity" />
        <Problem>{loaded.problem}</Problem>
      </Screen>
    );
  }

  const renamed = !payment.toPerson && shop.trim() !== (payment.shopName ?? "");
  const refiled = category !== payment.category;

  async function save() {
    if (!payment || !category) return;
    const found: typeof errors = {};
    const pence = poundsToPence(amount);
    if (!pence || pence <= 0) found.amount = "Type the amount in pounds, like 12.50.";
    const spentOn = readDay(day);
    if (!spentOn) found.day = "Type the day like 13/10/2026.";
    setErrors(found);
    if (!pence || !spentOn) return;
    setBusy("save");
    setProblem(null);
    try {
      const res = await api<{ payment: Payment; alsoChanged: number }>(`/me/payments/${payment.id}`, {
        method: "PATCH",
        body: {
          amount: pence,
          spentOn,
          ...(payment.toPerson ? {} : { shopName: shop.trim() || null }),
          category,
          note: note.trim() || null,
          applyToSame: (renamed || refiled) && applyToSame,
        },
      });
      setDone(res.alsoChanged > 0 ? `Saved, and ${res.alsoChanged} other payment${res.alsoChanged === 1 ? "" : "s"} like it changed too.` : "Saved.");
      setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace("/activity");
      }, 1500);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!payment) return;
    setBusy("delete");
    setProblem(null);
    try {
      await api(`/me/payments/${payment.id}`, { method: "DELETE" });
      if (router.canGoBack()) router.back();
      else router.replace("/activity");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not delete. Try again.");
      setBusy(null);
    }
  }

  return (
    <Screen>
      <PageHead
        title={payment.toPerson ? "Paid to a person" : payment.shopName || "Card payment"}
        sub={`${pounds(payment.amount)} · ${dayText(payment.spentOn)}`}
        fallback="/activity"
      />
      <Card>
        <Field label="Amount (£)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" error={errors.amount} />
        {payment.toPerson ? (
          <T kind="small">{`Money sent to a person. ${APP_NAME} keeps the amount and the day, never their name.`}</T>
        ) : (
          <Field label="Shop or payee" value={shop} onChangeText={setShop} autoCapitalize="words" />
        )}
        <Field label="Day" value={day} onChangeText={setDay} placeholder="13/10/2026" inputMode="numeric" error={errors.day} />
        <View style={{ gap: 8 }}>
          <T kind="label">Category</T>
          <CategoryPicker value={category} onChange={setCategory} />
          {category && !countsAsSpending(category) ? <T kind="small">Kept, but never counted as spending.</T> : null}
        </View>
        {(renamed || refiled) && !payment.toPerson ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.greenTint, borderRadius: 12, padding: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T kind="strong">Change payments like this too</T>
              <T kind="small">Past ones with the same statement text, and future ones.</T>
            </View>
            <Switch
              value={applyToSame}
              onValueChange={setApplyToSame}
              accessibilityLabel="Change payments like this too"
              trackColor={{ true: color.green, false: color.lineStrong }}
            />
          </View>
        ) : null}
        <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional, like for mum's birthday" maxLength={280} />
        <Problem>{problem}</Problem>
        {done ? (
          <T kind="strong" style={{ color: color.green }} accessibilityLiveRegion="polite">
            {done}
          </T>
        ) : null}
        <Button label="Save changes" busy={busy === "save"} onPress={save} />
      </Card>

      {confirmDelete ? (
        <Card tone="amber">
          <T kind="strong">Delete this spend?</T>
          <T style={{ color: color.amberInk }}>{`${pounds(payment.amount)} on ${dayText(payment.spentOn)} is removed. This can't be undone.`}</T>
          <Button label="Delete it" kind="danger" busy={busy === "delete"} onPress={remove} />
          <Button label="Keep it" kind="quiet" onPress={() => setConfirmDelete(false)} />
        </Card>
      ) : (
        <Button label="Delete spend" kind="quiet" onPress={() => setConfirmDelete(true)} style={{ alignSelf: "flex-start" }} />
      )}
    </Screen>
  );
}
