import { Stack } from "expo-router";
import { useColors } from "@/ui/theme";

export const unstable_settings = { initialRouteName: "welcome" };

export default function AuthLayout() {
  const c = useColors();
  return (
    <Stack initialRouteName="welcome" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="email" />
    </Stack>
  );
}
