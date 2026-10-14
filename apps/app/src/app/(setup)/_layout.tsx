import { Stack } from "expo-router";
import { useColors } from "@/ui/theme";

export const unstable_settings = { initialRouteName: "about-you" };

export default function SetupLayout() {
  const c = useColors();
  return (
    <Stack initialRouteName="about-you" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
      <Stack.Screen name="about-you" />
      <Stack.Screen name="location" />
    </Stack>
  );
}
