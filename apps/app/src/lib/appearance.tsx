import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { isLook, paletteFor, ThemeContext, type LookId, type Scheme } from "@/ui/theme";

/*
 * Light or dark: the phone's setting by default, or what the person chose in
 * Settings, kept on this phone only.
 */

export type AppearanceChoice = "system" | "light" | "dark";

const KEY = "briv.appearance";

async function readChoice(): Promise<AppearanceChoice> {
  try {
    const saved = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

async function writeChoice(choice: AppearanceChoice): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, choice);
    else await SecureStore.setItemAsync(KEY, choice);
  } catch {
    // Not kept this time; the phone's setting still applies.
  }
}

/**
 * Which look: the one chosen for the build. Looks still being compared can be
 * tried on the website with ?look=emerald, in builds made for that only.
 */
function lookOfBuild(): LookId {
  const fromBuild = process.env.EXPO_PUBLIC_LOOK;
  let look: LookId = isLook(fromBuild) ? fromBuild : "forest";
  if (Platform.OS === "web" && (__DEV__ || process.env.EXPO_PUBLIC_ALLOW_LOOK === "1")) {
    try {
      const asked = new URLSearchParams(globalThis.location?.search ?? "").get("look");
      if (isLook(asked)) look = asked;
    } catch {
      // No address to read.
    }
  }
  return look;
}

type AppearanceState = { choice: AppearanceChoice; setChoice: (choice: AppearanceChoice) => void; scheme: Scheme };

const AppearanceContext = createContext<AppearanceState>({ choice: "system", setChoice: () => undefined, scheme: "light" });

export function useAppearance(): AppearanceState {
  return useContext(AppearanceContext);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const phone = useColorScheme();
  const [choice, setChoiceState] = useState<AppearanceChoice>("system");
  const [look] = useState<LookId>(lookOfBuild);

  useEffect(() => {
    readChoice().then(setChoiceState);
  }, []);

  const setChoice = useCallback((next: AppearanceChoice) => {
    setChoiceState(next);
    writeChoice(next);
  }, []);

  const scheme: Scheme = choice === "system" ? (phone === "dark" ? "dark" : "light") : choice;
  const palette = useMemo(() => paletteFor(look, scheme), [look, scheme]);

  // The colour behind the app (seen while it opens, and around the page on the website).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.page).catch(() => undefined);
    if (Platform.OS === "web" && globalThis.document) {
      globalThis.document.documentElement.style.backgroundColor = palette.page;
      globalThis.document.documentElement.style.colorScheme = scheme;
      globalThis.document.body.style.backgroundColor = palette.page;
      globalThis.document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.page);
    }
  }, [palette.page, scheme]);

  const state = useMemo(() => ({ choice, setChoice, scheme }), [choice, setChoice, scheme]);
  return (
    <AppearanceContext.Provider value={state}>
      <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>
    </AppearanceContext.Provider>
  );
}
