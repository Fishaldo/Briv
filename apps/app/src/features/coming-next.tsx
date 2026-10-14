import { View } from "react-native";
import { Card, Screen, T } from "@/ui/kit";
import { useColors } from "@/ui/theme";

/** A tab whose real screen is built in a later phase. Says so plainly. */
export function ComingNext({ title, line, points }: { title: string; line: string; points: string[] }) {
  const c = useColors();
  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T kind="title" accessibilityRole="header">
          {title}
        </T>
        <T style={{ color: c.muted }}>{line}</T>
      </View>
      <Card>
        <T kind="strong">Coming next</T>
        {points.map((p) => (
          <T key={p} kind="small" style={{ color: c.inkSoft }}>
            {`• ${p}`}
          </T>
        ))}
      </Card>
    </Screen>
  );
}
