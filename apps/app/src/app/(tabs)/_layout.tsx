import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from "expo-router/ui";
import { forwardRef, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeIcon, InsightsIcon, OffersIcon, PlanIcon, PlusIcon } from "@/ui/icons";
import { font, makeStyles, maxWidth, useColors } from "@/ui/theme";

type IconType = ComponentType<{ size?: number; color?: string }>;

/** Home, Plan, Add, Insights, Offers. Add sits raised in the middle. */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton label="Home" Icon={HomeIcon} />
        </TabTrigger>
        <TabTrigger name="plan" href="/plan" asChild>
          <TabButton label="Plan" Icon={PlanIcon} />
        </TabTrigger>
        <TabTrigger name="add" href="/add" asChild>
          <TabButton label="Add" Icon={PlusIcon} raised />
        </TabTrigger>
        <TabTrigger name="insights" href="/insights" asChild>
          <TabButton label="Insights" Icon={InsightsIcon} />
        </TabTrigger>
        <TabTrigger name="offers" href="/offers" asChild>
          <TabButton label="Offers" Icon={OffersIcon} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const TabButton = forwardRef<View, TabTriggerSlotProps & { label: string; Icon: IconType; raised?: boolean }>(
  function TabButton({ label, Icon, raised, isFocused, ...props }, ref) {
    const c = useColors();
    const styles = useStyles();
    const tint = isFocused ? c.accent : c.muted;
    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!isFocused }}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
      >
        {raised ? (
          <View style={styles.raised}>
            <Icon size={26} color={c.onAction} />
          </View>
        ) : (
          <Icon size={24} color={tint} />
        )}
        <Text
          style={[styles.label, { color: raised && !isFocused ? c.ink : tint, fontFamily: isFocused ? font.heavy : font.semibold }]}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      </Pressable>
    );
  },
);

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 8,
    paddingHorizontal: 8,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
  },
  tab: { flex: 1, maxWidth: maxWidth / 5, minHeight: 52, alignItems: "center", justifyContent: "flex-end", gap: 4 },
  raised: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
  },
  label: { fontSize: 12 },
}),
);
