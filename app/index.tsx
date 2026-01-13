import { useEffect } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/sign-in");
      }
    }
  }, [user, isLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-slate-950">
      <ActivityIndicator size="large" color="#dc2626" />
    </View>
  );
}
