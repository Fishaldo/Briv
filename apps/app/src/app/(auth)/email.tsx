import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform, type TextInput, View } from "react-native";
import { APP_NAME } from "@briv/core";
import { authClient } from "@/lib/auth-client";
import { BackIcon } from "@/ui/icons";
import { Button, Field, Problem, RoundButton, Screen, T } from "@/ui/kit";
import { color } from "@/ui/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function EmailSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      setProblem("Type your email address, like name@example.com.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setBusy(false);
    if (error) {
      setProblem("The code was not sent. Check the address and try again.");
      return;
    }
    setSentTo(address);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function signIn() {
    if (!sentTo) return;
    const otp = code.replace(/\D/g, "");
    if (otp.length !== 6) {
      setProblem("The code has 6 numbers.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const { error } = await authClient.signIn.emailOtp({ email: sentTo, otp });
    setBusy(false);
    if (error) setProblem("That code did not work. Check it, or ask for a new one.");
    // When it works, the session changes and Briv moves on by itself.
  }

  return (
    <Screen
      footer={
        <>
          <Problem>{problem}</Problem>
          {sentTo ? (
            <>
              <Button label="Sign in" busy={busy} onPress={signIn} />
              <Button label="Send a new code" kind="quiet" disabled={busy} onPress={sendCode} />
            </>
          ) : (
            <Button label="Send me a code" busy={busy} onPress={sendCode} />
          )}
        </>
      }
    >
      <RoundButton label="Back" onPress={() => (sentTo ? setSentTo(null) : router.back())}>
        <BackIcon size={22} />
      </RoundButton>
      <View style={{ gap: 6 }}>
        <T kind="title" accessibilityRole="header">
          {sentTo ? "Check your email" : "Your email"}
        </T>
        <T style={{ color: color.muted }}>
          {sentTo ? `We sent a 6-number code to ${sentTo}. It works for 5 minutes.` : `${APP_NAME} emails you a code. No password to remember.`}
        </T>
      </View>
      {sentTo ? (
        <Field
          ref={codeRef}
          label="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
          maxLength={6}
          onSubmitEditing={signIn}
          style={{ fontSize: 24, letterSpacing: 6 }}
        />
      ) : (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={sendCode}
          placeholder="name@example.com"
        />
      )}
    </Screen>
  );
}
