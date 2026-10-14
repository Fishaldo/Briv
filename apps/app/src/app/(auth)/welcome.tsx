import { router } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { APP_NAME } from "@briv/core";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_PROVIDERS } from "@/lib/config";
import { CheckIcon } from "@/ui/icons";
import { Button, Problem, Screen, T } from "@/ui/kit";
import { font, makeStyles, useColors } from "@/ui/theme";

const POINTS = [
  "Bank, receipts, alerts or your voice",
  "What is safe to spend until payday",
  "Real UK deals for the shops you use, local first",
];

export default function Welcome() {
  const c = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState<"apple" | "google" | "passkey" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function social(provider: "apple" | "google") {
    setBusy(provider);
    setProblem(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
    setBusy(null);
    if (error) setProblem(`${provider === "apple" ? "Apple" : "Google"} sign-in did not finish. Try again, or use email.`);
  }

  return (
    <Screen
      footer={
        <>
          <Problem>{problem}</Problem>
          {SIGN_IN_PROVIDERS.has("apple") && Platform.OS !== "android" ? (
            <Button label="Continue with Apple" busy={busy === "apple"} onPress={() => social("apple")} kind="contrast" />
          ) : null}
          {SIGN_IN_PROVIDERS.has("google") ? (
            <Button label="Continue with Google" kind="secondary" busy={busy === "google"} onPress={() => social("google")} />
          ) : null}
          <Button label="Continue with email" kind={SIGN_IN_PROVIDERS.size ? "secondary" : "primary"} onPress={() => router.push("/email")} />
          <Button label="I already have an account" kind="quiet" onPress={() => router.push("/email")} />
          <T kind="small" style={{ textAlign: "center" }}>
            By continuing you agree to the Terms and Privacy policy.
          </T>
        </>
      }
    >
      <View style={styles.brand}>
        <View style={styles.mark} accessibilityElementsHidden>
          <T style={styles.markText}>{APP_NAME.charAt(0).toLowerCase()}</T>
        </View>
        <T style={styles.brandText}>{APP_NAME}</T>
      </View>
      <View style={{ gap: 10, marginTop: 24 }}>
        <T kind="title" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          See where your pay goes.
        </T>
        <T style={{ color: c.muted, fontSize: 16, lineHeight: 24 }}>
          {`${APP_NAME} tracks your spending with almost no typing, then finds real deals before your next spend.`}
        </T>
      </View>
      <View style={{ gap: 12, marginTop: 8 }}>
        {POINTS.map((point) => (
          <View key={point} style={styles.point}>
            <View style={styles.tick}>
              <CheckIcon size={16} color={c.accent} />
            </View>
            <T kind="strong" style={{ flex: 1 }}>
              {point}
            </T>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.hero, alignItems: "center", justifyContent: "center" },
  markText: { color: c.onHero, fontFamily: font.heavy, fontSize: 22, lineHeight: 26 },
  brandText: { fontFamily: font.heavy, fontSize: 20 },
  point: { flexDirection: "row", alignItems: "center", gap: 12 },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentTint, alignItems: "center", justifyContent: "center" },
}),
);
