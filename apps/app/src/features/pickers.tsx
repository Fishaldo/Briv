import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { CATEGORIES, categoryLabel, SEARCH_PERIODS, type CategoryId, type SearchPeriodId } from "@briv/core";
import { font, makeStyles, radius, touch } from "@/ui/theme";
import { Sheet, SheetOption } from "./sheet";

/** One button that shows the choice, and opens the list of choices. */
function PickerButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}: ${label}`}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.text} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <Text style={styles.caret} accessibilityElementsHidden>
        ▾
      </Text>
    </Pressable>
  );
}

/** The time range for Activity: one button, then a list. */
export function PeriodPicker({ value, onChange }: { value: SearchPeriodId; onChange: (id: SearchPeriodId) => void }) {
  const [open, setOpen] = useState(false);
  const current = SEARCH_PERIODS.find((p) => p.id === value) ?? SEARCH_PERIODS[SEARCH_PERIODS.length - 1];
  return (
    <>
      <PickerButton label={current.label} a11y="Time range" onPress={() => setOpen(true)} />
      <Sheet open={open} title="Show spends from" onClose={() => setOpen(false)}>
        {SEARCH_PERIODS.map((p) => (
          <SheetOption
            key={p.id}
            label={p.label}
            on={p.id === value}
            onPress={() => {
              setOpen(false);
              onChange(p.id);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** A category, picked from a list of all of them. */
export function CategoryPicker({
  value,
  onChange,
  label = "Category",
}: {
  value: CategoryId | null;
  onChange: (id: CategoryId) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerButton label={value ? categoryLabel(value) : "Pick one"} a11y={label} onPress={() => setOpen(true)} />
      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        {CATEGORIES.map((c) => (
          <SheetOption
            key={c.id}
            label={c.label}
            line={c.spending ? undefined : "Kept, never counted as spending"}
            on={c.id === value}
            onPress={() => {
              setOpen(false);
              onChange(c.id);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  button: {
    minHeight: touch,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  text: { fontFamily: font.bold, fontSize: 14, color: c.ink },
  caret: { fontSize: 12, color: c.muted },
}),
);
