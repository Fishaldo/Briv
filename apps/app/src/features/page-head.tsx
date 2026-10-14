import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BackIcon, CloseIcon } from "@/ui/icons";
import { RoundButton, T } from "@/ui/kit";

/**
 * The top of a page opened from another one: Back (or Close) and the title,
 * with room for one action on the right. Back returns to where the person
 * came from; a page opened directly goes to `fallback`.
 */
export function PageHead({
  title,
  sub,
  fallback = "/",
  close = false,
  action,
}: {
  title: string;
  sub?: string;
  fallback?: Href;
  close?: boolean;
  action?: ReactNode;
}) {
  const leave = () => (router.canGoBack() ? router.back() : router.replace(fallback));
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <RoundButton label={close ? "Close" : "Back"} onPress={leave}>
          {close ? <CloseIcon size={22} /> : <BackIcon size={22} />}
        </RoundButton>
        <T kind="title" accessibilityRole="header" style={styles.title} numberOfLines={2}>
          {title}
        </T>
        {action}
      </View>
      {sub ? <T kind="small">{sub}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 24, flex: 1 },
});
