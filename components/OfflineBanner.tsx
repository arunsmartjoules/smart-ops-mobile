import React from "react";
import { View, Text } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const OfflineBanner = React.memo(() => {
  const { isConnected } = useNetworkStatus();

  if (isConnected) {
    return null;
  }

  return (
    <View className="bg-amber-500 px-4 py-3 flex-row items-center">
      <WifiOff size={20} color="white" />
      <View className="ml-3 flex-1">
        <Text className="text-white font-bold text-sm">You're Offline</Text>
        <Text className="text-white text-xs mt-0.5">
          Changes will sync when you're back online
        </Text>
      </View>
    </View>
  );
});

export default OfflineBanner;
