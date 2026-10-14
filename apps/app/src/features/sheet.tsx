import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckIcon } from "@/ui/icons";
import { T } from "@/ui/kit";
import { color, font, maxWidth, radius, touch } from "@/ui/theme";

/**
 * A list of choices that slides up from the bottom. Tapping outside it, or the
 * phone's Back button, closes it without choosing.
 */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
        <T kind="heading" accessibilityRole="header" style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
          {title}
        </T>
        <ScrollView style={{ maxHeight: 460 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function SheetOption({ label, line, on, onPress }: { label: string; line?: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: color.rule }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontFamily: on ? font.heavy : font.semibold, fontSize: 16 }}>{label}</T>
        {line ? <T kind="small">{line}</T> : null}
      </View>
      {on ? <CheckIcon size={20} color={color.green} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(23,33,28,0.4)" },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    width: "100%",
    maxWidth,
    alignSelf: "center",
  },
  option: { minHeight: touch + 8, paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
});
