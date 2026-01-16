import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";

export default function TabsIndex() {
  const { user, isLoading } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!isLoading && !hasRedirected.current) {
      hasRedirected.current = true;
      if (user) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/sign-in");
      }
    }
  }, [user, isLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-gray-50">
      <ActivityIndicator size="large" color="#dc2626" />
    </View>
  );
}
