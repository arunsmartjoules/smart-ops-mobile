import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";

interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
}

export function EmptyState({
  icon: Icon,
  iconColor = "#cbd5e1",
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <View className="py-20 items-center justify-center px-6">
      {Icon ? (
        <View className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center mb-4">
          <Icon size={36} color={iconColor} />
        </View>
      ) : null}
      <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-slate-500 dark:text-slate-400 text-sm mt-2 text-center">
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.85}
          className="mt-4 bg-red-600 px-5 py-2.5 rounded-xl"
        >
          <Text className="text-white font-bold text-sm">{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default EmptyState;
