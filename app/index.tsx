import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthPalette } from "@/components/auth/authTheme";

export default function Index() {
  const { user, isLoading } = useAuth();
  const t = useAuthPalette();

  if (isLoading) {
    // Painted in the auth canvas so there's no colour flash into /sign-in.
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.bg,
        }}
      >
        <ActivityIndicator size="large" color={t.ctaBg} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/sign-in" />;
}
