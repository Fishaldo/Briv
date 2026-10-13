import { Stack } from "expo-router";
import { color } from "@/ui/theme";

export const unstable_settings = { initialRouteName: "welcome" };

export default function AuthLayout() {
  return (
    <Stack initialRouteName="welcome" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.page } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="email" />
    </Stack>
  );
}
