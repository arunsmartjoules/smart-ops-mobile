import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";

export default function TabsIndex() {
  const { user, isLoading } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Safety timeout: if loading takes > 5s, force a redirect based on current user state
    const timer = setTimeout(() => {
      if (!hasRedirected.current) {
        hasRedirected.current = true;
        if (user) {
          router.replace("/(tabs)/dashboard");
        } else {
          router.replace("/sign-in");
        }
      }
    }, 5000);

    if (!isLoading && !hasRedirected.current) {
      hasRedirected.current = true;
      clearTimeout(timer);
      if (user) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/sign-in");
      }
    }
    
    return () => clearTimeout(timer);
  }, [user, isLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-gray-50">
      <ActivityIndicator size="large" color="#dc2626" />
    </View>
  );
}
