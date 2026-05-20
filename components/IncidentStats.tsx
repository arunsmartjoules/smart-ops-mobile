import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Skeleton from "./Skeleton";

interface IncidentStatsProps {
  stats: Record<string, number>;
  loading: boolean;
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

const IncidentStats = ({
  stats,
  loading,
  currentStatus,
  onStatusChange,
}: IncidentStatsProps) => {
  if (loading) {
    return (
      <View className="px-5 mb-3">
        <View className="flex-row gap-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={62} borderRadius={12} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
    );
  }

  const renderCard = (
    label: string,
    value: number,
    status: string,
    color: string,
  ) => {
    const isActive = status === currentStatus;
    return (
      <TouchableOpacity
        key={status}
        onPress={() => onStatusChange(status)}
        activeOpacity={0.7}
        className="flex-1 rounded-xl py-2.5 px-1.5 items-center bg-white dark:bg-slate-900"
        style={{
          borderWidth: 1,
          borderColor: isActive ? color : `${color}33`,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <Text className="text-[17px] font-bold leading-tight" style={{ color }}>
          {value}
        </Text>
        <Text
          className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5"
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="px-5 mb-3">
      <View className="flex-row gap-1.5">
        {renderCard("Open", stats.Open || 0, "Open", "#ef4444")}
        {renderCard(
          "In prog.",
          stats.Inprogress || 0,
          "Inprogress",
          "#3b82f6",
        )}
        {renderCard("Completed", stats.Resolved || 0, "Resolved", "#22c55e")}
      </View>
    </View>
  );
};

export default IncidentStats;
