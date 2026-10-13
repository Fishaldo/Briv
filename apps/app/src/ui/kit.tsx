import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, maxWidth, radius, space, touch } from "./theme";

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const textStyles = StyleSheet.create({
  title: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: color.ink },
  heading: { fontFamily: font.heavy, fontSize: 17, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.ink },
  strong: { fontFamily: font.bold, fontSize: 15, lineHeight: 21, color: color.ink },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: color.muted },
  label: { fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.ink },
  money: { fontFamily: font.heavy, fontSize: 15, color: color.ink, fontVariant: ["tabular-nums"] },
});

export type TextKind = keyof typeof textStyles;

export function T({ kind = "body", style, ...rest }: TextProps & { kind?: TextKind }) {
  return <Text {...rest} style={[textStyles[kind], style]} maxFontSizeMultiplier={1.6} />;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** A page that scrolls, with the phone's safe area and a centred column on wide screens. */
export function Screen({
  children,
  footer,
  scroll = true,
  style,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={[styles.column, { paddingTop: insets.top + 16 }, style]}>{children}</View>
  );
  return (
    <View style={styles.page}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: footer ? 16 : insets.bottom + 28 }}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerColumn}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style, tone = "plain" }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "plain" | "green" | "amber" | "blue" }) {
  return <View style={[styles.card, toneStyle[tone], style]}>{children}</View>;
}

const toneStyle = StyleSheet.create({
  plain: {},
  green: { backgroundColor: color.greenTint, borderColor: color.greenTint },
  amber: { backgroundColor: color.amberTint, borderColor: color.amberTint },
  blue: { backgroundColor: color.blueTint, borderColor: color.blueTint },
});

/** Rows in one card, with hairlines between them. */
export function List({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

export function Row({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed, style]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function Gap({ size = space.gap }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  busy?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, kind = "primary", busy, icon, disabled, style, ...rest }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      {...rest}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.button, buttonKind[kind], pressed && styles.pressed, off && styles.off, style]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? color.white : color.green} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, buttonText[kind]]} maxFontSizeMultiplier={1.4}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const buttonKind = StyleSheet.create({
  primary: { backgroundColor: color.green },
  secondary: { backgroundColor: color.card, borderWidth: 1, borderColor: color.lineStrong },
  quiet: { backgroundColor: "transparent", minHeight: touch },
  danger: { backgroundColor: color.card, borderWidth: 1, borderColor: color.danger },
});

const buttonText = StyleSheet.create({
  primary: { color: color.white },
  secondary: { color: color.ink },
  quiet: { color: color.green },
  danger: { color: color.danger },
});

/** A round icon button, such as Back or Settings. */
export function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.round, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string | null };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, style, ...rest }, ref) {
  return (
    <View style={styles.field}>
      <T kind="label">{label}</T>
      <TextInput
        ref={ref}
        placeholderTextColor={color.placeholder}
        accessibilityLabel={label}
        accessibilityHint={hint}
        maxFontSizeMultiplier={1.4}
        {...rest}
        style={[styles.input, error ? styles.inputError : null, style as StyleProp<TextStyle>]}
      />
      {error ? (
        <T kind="small" style={{ color: color.danger }} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T kind="small">{hint}</T>
      ) : null}
    </View>
  );
});

export function Problem({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.problem} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <T style={{ color: color.danger, fontFamily: font.semibold }}>{children}</T>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.page, styles.center]}>
      <ActivityIndicator color={color.green} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.page },
  center: { alignItems: "center", justifyContent: "center" },
  column: { width: "100%", maxWidth, alignSelf: "center", paddingHorizontal: space.gutter, gap: space.gap },
  footer: { borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.page, paddingTop: 12, paddingHorizontal: space.gutter },
  footerColumn: { width: "100%", maxWidth, alignSelf: "center", gap: 10 },
  card: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 16, gap: 10 },
  list: { backgroundColor: color.line, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: "hidden", gap: 1 },
  row: { backgroundColor: color.card, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 },
  pressed: { opacity: 0.75 },
  off: { opacity: 0.5 },
  button: { minHeight: 54, borderRadius: radius.button, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  buttonText: { fontFamily: font.bold, fontSize: 16 },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: touch, paddingHorizontal: 14, borderRadius: radius.chip, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.card, justifyContent: "center" },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  chipTextOn: { color: color.white },
  field: { gap: 6 },
  input: {
    minHeight: 50,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.card,
    paddingHorizontal: 16,
    fontFamily: font.semibold,
    fontSize: 16,
    color: color.ink,
  },
  inputError: { borderColor: color.danger },
  problem: { backgroundColor: color.dangerTint, borderRadius: 12, padding: 12 },
});
