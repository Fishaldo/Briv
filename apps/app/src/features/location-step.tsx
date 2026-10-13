import * as Location from "expo-location";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { APP_NAME } from "@briv/core";
import { api, type Me } from "@/lib/api";
import { CheckIcon, PinIcon } from "@/ui/icons";
import { Button, Field, Problem, Screen, T } from "@/ui/kit";
import { color } from "@/ui/theme";

type Answer = { allowed: boolean; precise: boolean };

/**
 * The location question. Asked once after the first sign-in, and again only
 * when the person chooses to in Settings. The point is sent once, turned into
 * a town on the server, and never kept.
 */
export function LocationStep({
  stepLabel,
  header,
  onDone,
}: {
  stepLabel?: string;
  header?: React.ReactNode;
  onDone: (me: Me) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"ask" | "type">("ask");
  const [answer, setAnswer] = useState<Answer>({ allowed: false, precise: false });
  const [town, setTown] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    const result = await api<{ town: string | null; me: Me }>("/me/location", { body });
    return result;
  }

  async function allow() {
    setBusy(true);
    setProblem(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setAnswer({ allowed: false, precise: false });
        setMode("type");
        setProblem(`Location is off for ${APP_NAME}. Type your town instead.`);
        return;
      }
      const precise =
        Platform.OS === "ios"
          ? permission.ios?.accuracy === "full"
          : Platform.OS === "android"
            ? permission.android?.accuracy === "fine"
            : true;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await save({
        allowed: true,
        precise,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      if (result.town) {
        await onDone(result.me);
      } else {
        setAnswer({ allowed: true, precise });
        setMode("type");
        setProblem(`${APP_NAME} couldn't find your town. Type it instead.`);
      }
    } catch (error) {
      setMode("type");
      setProblem(error instanceof Error && error.message ? error.message : "Location did not work. Type your town instead.");
    } finally {
      setBusy(false);
    }
  }

  async function typed() {
    const name = town.trim();
    if (name.length < 2) {
      setProblem("Type the town or area, like Selly Oak or Leeds.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await save({ ...answer, town: name });
      await onDone(result.me);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      const result = await save({ allowed: false });
      await onDone(result.me);
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
          {mode === "ask" ? (
            <>
              <Button label="Allow location" busy={busy} onPress={allow} />
              <Button label="Type my town instead" kind="secondary" disabled={busy} onPress={() => setMode("type")} />
              <T kind="small" style={{ textAlign: "center" }}>
                Your phone asks next.
              </T>
            </>
          ) : (
            <>
              <Button label="Save my town" busy={busy} onPress={typed} />
              <Button label="Not now" kind="quiet" disabled={busy} onPress={skip} />
            </>
          )}
        </>
      }
    >
      {header}
      {stepLabel ? (
        <T kind="small" style={{ fontFamily: "Manrope_700Bold", color: color.green }}>
          {stepLabel}
        </T>
      ) : null}
      <View style={styles.badge} accessibilityElementsHidden>
        <PinIcon size={34} color={color.green} />
      </View>
      <View style={{ gap: 8 }}>
        <T kind="title" accessibilityRole="header">
          Deals near you first
        </T>
        <T style={{ color: color.muted, fontSize: 16, lineHeight: 24 }}>
          {`${APP_NAME} uses your location to put nearby shops and deals at the top. Only your town is saved, never where you are.`}
        </T>
      </View>
      {mode === "ask" ? (
        <View style={{ gap: 10 }}>
          {["Precise location finds shops on your street.", "Change it any time in Settings."].map((line) => (
            <View key={line} style={styles.point}>
              <CheckIcon size={18} color={color.green} />
              <T kind="strong" style={{ flex: 1 }}>
                {line}
              </T>
            </View>
          ))}
        </View>
      ) : (
        <Field
          label="Your town or area"
          value={town}
          onChangeText={setTown}
          placeholder="Selly Oak, Birmingham"
          autoCapitalize="words"
          autoComplete="postal-address-locality"
          textContentType="addressCity"
          returnKeyType="done"
          onSubmitEditing={typed}
          autoFocus
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 84, height: 84, borderRadius: 42, backgroundColor: color.greenTint, alignItems: "center", justifyContent: "center", marginVertical: 8 },
  point: { flexDirection: "row", alignItems: "center", gap: 10 },
});
