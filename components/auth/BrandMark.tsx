import React from "react";
import { View, Text } from "react-native";
import { Zap } from "lucide-react-native";

export function BrandMark({
  subtitle,
  size = "md",
}: {
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? 56 : size === "sm" ? 40 : 48;
  const iconSize = size === "lg" ? 28 : size === "sm" ? 20 : 24;

  return (
    <View className="items-center">
      <View
        style={{
          width: dims,
          height: dims,
          shadowColor: "#072B31",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 4,
        }}
        className="rounded-2xl bg-red-600 items-center justify-center mb-3"
      >
        <Zap size={iconSize} color="#ffffff" strokeWidth={2.5} fill="#ffffff" />
      </View>
      <Text className="text-zinc-900 text-xl font-bold tracking-tight">
        JouleOps
      </Text>
      {subtitle ? (
        <Text className="text-zinc-500 text-[13px] mt-0.5">{subtitle}</Text>
      ) : null}
    </View>
  );
}
