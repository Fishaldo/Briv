import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { APP_NAME, formatGBP, poundsToPence } from "@briv/core";
import { api, type Me } from "@/lib/api";
import { useMe, useSession } from "@/lib/session";
import { Button, Chip, Chips, Field, Problem, Screen, T } from "@/ui/kit";
import { color, font } from "@/ui/theme";

export default function AboutYou() {
  const me = useMe();
  const { setMe, signOut } = useSession();
  const [name, setName] = useState(me.name);
  const [pay, setPay] = useState(me.profile.usualTakeHome ? formatGBP(me.profile.usualTakeHome).replace(/\.00$/, "") : "");
  const [payday, setPayday] = useState(me.profile.paydayDay ? String(me.profile.paydayDay) : "");
  const [errors, setErrors] = useState<{ name?: string; pay?: string; payday?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function next() {
    const found: typeof errors = {};
    const first = name.trim();
    if (!first) found.name = "Type your first name.";
    const takeHome = pay.trim() ? poundsToPence(pay) : null;
    if (pay.trim() && takeHome === null) found.pay = "Type an amount in pounds, like 2,400.";
    const day = payday.trim() ? Number(payday) : null;
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) found.payday = "Type a day from 1 to 31, or leave it empty.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setProblem(null);
    try {
      const updated = await api<Me>("/me", {
        method: "PATCH",
        body: { name: first, usualTakeHome: takeHome, paydayDay: day, country: "GB" },
      });
      setMe(updated);
      router.push("/location");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Problem>{problem}</Problem>
          <Button label="Continue" busy={busy} onPress={next} />
          <Button label="Use a different email" kind="quiet" disabled={busy} onPress={signOut} />
        </>
      }
    >
      <T kind="small" style={{ fontFamily: font.bold, color: color.green }}>
        Step 1 of 2
      </T>
      <View style={{ gap: 6 }}>
        <T kind="title" accessibilityRole="header">
          A little about you
        </T>
        <T style={{ color: color.muted }}>{`So ${APP_NAME} can set your pay period. You can change this later.`}</T>
      </View>
      <Field
        label="First name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        error={errors.name}
      />
      <Field
        label="Monthly take-home pay"
        value={pay}
        onChangeText={setPay}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="£2,400"
        hint={`After tax. ${APP_NAME} asks you to confirm it each payday.`}
        error={errors.pay}
      />
      <Field
        label="Payday, day of the month"
        value={payday}
        onChangeText={setPayday}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        placeholder="25"
        hint={`No fixed payday? Leave it empty and ${APP_NAME} uses calendar months.`}
        error={errors.payday}
      />
      <View style={{ gap: 8 }}>
        <T kind="label">Country</T>
        <Chips>
          <Chip label="United Kingdom" on onPress={() => undefined} />
        </Chips>
        <T kind="small">More countries come later.</T>
      </View>
    </Screen>
  );
}
