import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { APP_NAME } from "@briv/core";
import { reportAppError } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { Button, Screen, T } from "@/ui/kit";
import { color } from "@/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsReady] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      {fontsReady ? <Navigator /> : null}
    </SessionProvider>
  );
}

/**
 * When a screen crashes: a plain message and a way back, never a white
 * screen. The crash is reported (without what it said) so it gets fixed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportAppError(error);
    SplashScreen.hideAsync().catch(() => undefined);
  }, [error]);
  return (
    <Screen>
      <T kind="title">Something went wrong</T>
      <T style={{ color: color.muted }}>{`${APP_NAME} hit a problem on this screen. It has been reported. Your spends are safe.`}</T>
      <Button label="Try again" onPress={() => retry()} />
    </Screen>
  );
}

function Navigator() {
  const { stage, refresh, problem } = useSession();

  useEffect(() => {
    if (stage !== "loading") SplashScreen.hideAsync().catch(() => undefined);
  }, [stage]);

  if (stage === "loading") return <View style={{ flex: 1, backgroundColor: color.page }} />;

  if (stage === "problem") {
    return (
      <Screen>
        <T kind="title">{`${APP_NAME} can't connect`}</T>
        <T style={{ color: color.muted }}>{problem}</T>
        <Button label="Try again" onPress={() => refresh()} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.page } }}>
      <Stack.Protected guard={stage === "signed-out"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={stage === "setup"}>
        <Stack.Screen name="(setup)" />
      </Stack.Protected>
      <Stack.Protected guard={stage === "ready"}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="change-location" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="payment/[id]" />
        <Stack.Screen name="statement" />
        <Stack.Screen name="regulars" />
      </Stack.Protected>
    </Stack>
  );
}
