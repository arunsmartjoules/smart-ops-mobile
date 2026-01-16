import { Stack } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  console.log("RootLayout: Rendering");
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="sign-in"
              options={{ title: "Sign In", headerShown: false }}
            />
            <Stack.Screen
              name="sign-up"
              options={{ title: "Sign Up", headerShown: false }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="forgot-password"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="all-tasks" options={{ headerShown: false }} />
            <Stack.Screen name="attendance" options={{ headerShown: false }} />
            <Stack.Screen
              name="privacy-security"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="app-settings"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="notification-settings"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: false }}
            />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
