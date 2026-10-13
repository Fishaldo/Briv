import { Stack } from "expo-router";
import { color } from "@/ui/theme";

export const unstable_settings = { initialRouteName: "about-you" };

export default function SetupLayout() {
  return (
    <Stack initialRouteName="about-you" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.page } }}>
      <Stack.Screen name="about-you" />
      <Stack.Screen name="location" />
    </Stack>
  );
}
