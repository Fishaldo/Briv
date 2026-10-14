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
import { font, makeStyles, maxWidth, radius, space, touch, useColors } from "./theme";

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const useTextStyles = makeStyles((c) =>
  StyleSheet.create({
    title: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.ink },
    heading: { fontFamily: font.heavy, fontSize: 17, lineHeight: 22, color: c.ink },
    body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: c.ink },
    strong: { fontFamily: font.bold, fontSize: 15, lineHeight: 21, color: c.ink },
    small: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: c.muted },
    label: { fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: c.ink },
    money: { fontFamily: font.heavy, fontSize: 15, color: c.ink, fontVariant: ["tabular-nums"] },
  }),
);

export type TextKind = "title" | "heading" | "body" | "strong" | "small" | "label" | "money";

export function T({ kind = "body", style, ...rest }: TextProps & { kind?: TextKind }) {
  const textStyles = useTextStyles();
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
  const styles = useStyles();
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

export function Card({
  children,
  style,
  tone = "plain",
  accessibilityLiveRegion,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** brand: the person's own money; warn: check this; saved: put away; offer: a deal. */
  tone?: "plain" | "brand" | "warn" | "saved" | "offer";
  /** Read out changes, for a total that updates as the person searches. */
  accessibilityLiveRegion?: "polite" | "assertive";
}) {
  const styles = useStyles();
  const toneStyle = useToneStyles();
  return (
    <View style={[styles.card, toneStyle[tone], style]} accessibilityLiveRegion={accessibilityLiveRegion}>
      {children}
    </View>
  );
}

const useToneStyles = makeStyles((c) =>
  StyleSheet.create({
    plain: {},
    brand: { backgroundColor: c.accentTint, borderColor: c.accentTint },
    warn: { backgroundColor: c.warnTint, borderColor: c.warnTint },
    saved: { backgroundColor: c.savedTint, borderColor: c.savedTint },
    offer: { backgroundColor: c.offerTint, borderColor: c.offerTint },
  }),
);

/** Rows in one card, with hairlines between them. */
export function List({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.list}>{children}</View>;
}

export function Row({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string }) {
  const styles = useStyles();
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed, style]} accessibilityRole="button" accessibilityLabel={label}>
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
  kind?: "primary" | "secondary" | "quiet" | "danger" | "contrast";
  busy?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, kind = "primary", busy, icon, disabled, style, ...rest }: ButtonProps) {
  const off = disabled || busy;
  const c = useColors();
  const styles = useStyles();
  const { buttonKind, buttonText } = useButtonStyles();
  return (
    <Pressable
      {...rest}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.button, buttonKind[kind], pressed && styles.pressed, off && styles.off, style]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? c.onAction : kind === "contrast" ? c.onChosen : c.accent} />
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

const useButtonStyles = makeStyles((c) => ({
  buttonKind: StyleSheet.create({
    primary: { backgroundColor: c.action },
    secondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.lineStrong },
    quiet: { backgroundColor: "transparent", minHeight: touch },
    danger: { backgroundColor: c.card, borderWidth: 1, borderColor: c.bad },
    contrast: { backgroundColor: c.chosen },
  }),
  buttonText: StyleSheet.create({
    primary: { color: c.onAction },
    secondary: { color: c.ink },
    quiet: { color: c.accent },
    danger: { color: c.bad },
    contrast: { color: c.onChosen },
  }),
}));

/** A round icon button, such as Back or Settings. */
export function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const styles = useStyles();
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

export function Chip({ label, on, onPress, wide }: { label: string; on?: boolean; onPress: () => void; wide?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [styles.chip, wide && styles.chipWide, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.chips}>{children}</View>;
}

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string | null };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, style, ...rest }, ref) {
  const c = useColors();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <T kind="label">{label}</T>
      <TextInput
        ref={ref}
        placeholderTextColor={c.placeholder}
        keyboardAppearance={c.scheme}
        accessibilityLabel={label}
        accessibilityHint={hint}
        maxFontSizeMultiplier={1.4}
        {...rest}
        style={[styles.input, error ? styles.inputError : null, style as StyleProp<TextStyle>]}
      />
      {error ? (
        <T kind="small" style={{ color: c.bad }} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T kind="small">{hint}</T>
      ) : null}
    </View>
  );
});

export function Problem({ children }: { children: ReactNode }) {
  const c = useColors();
  const styles = useStyles();
  if (!children) return null;
  return (
    <View style={styles.problem} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <T style={{ color: c.badInk, fontFamily: font.semibold }}>{children}</T>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.page, styles.center]}>
      <ActivityIndicator color={c.accent} size="large" />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  page: { flex: 1, backgroundColor: c.page },
  center: { alignItems: "center", justifyContent: "center" },
  column: { width: "100%", maxWidth, alignSelf: "center", paddingHorizontal: space.gutter, gap: space.gap },
  footer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.page, paddingTop: 12, paddingHorizontal: space.gutter },
  footerColumn: { width: "100%", maxWidth, alignSelf: "center", gap: 10 },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, padding: 16, gap: 10 },
  list: { backgroundColor: c.line, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, overflow: "hidden", gap: 1 },
  row: { backgroundColor: c.card, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 },
  pressed: { opacity: 0.75 },
  off: { opacity: 0.5 },
  button: { minHeight: 54, borderRadius: radius.button, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  buttonText: { fontFamily: font.bold, fontSize: 16 },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: touch, paddingHorizontal: 14, borderRadius: radius.chip, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.card, justifyContent: "center" },
  chipWide: { flex: 1, alignItems: "center" },
  chipOn: { backgroundColor: c.chosen, borderColor: c.chosen },
  chipText: { fontFamily: font.bold, fontSize: 14, color: c.ink },
  chipTextOn: { color: c.onChosen },
  field: { gap: 6 },
  input: {
    minHeight: 50,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.card,
    paddingHorizontal: 16,
    fontFamily: font.semibold,
    fontSize: 16,
    color: c.ink,
  },
  inputError: { borderColor: c.bad },
  problem: { backgroundColor: c.badTint, borderRadius: 12, padding: 12 },
}),
);
