import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react-native";
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
  currentStatus: _currentStatus,
  onStatusChange,
}: IncidentStatsProps) => {
  if (loading) {
    return (
      <View className="px-5 mb-3">
        <View className="flex-row gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={70} borderRadius={16} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
    );
  }

  const renderCard = (
    label: string,
    value: number,
    status: string,
    icon: React.ReactNode,
    bgColor: string,
  ) => (
    <TouchableOpacity
      key={status}
      onPress={() => onStatusChange(status)}
      activeOpacity={0.7}
      className="flex-1 rounded-xl p-3 bg-white dark:bg-slate-900"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View
        className="w-8 h-8 rounded-lg items-center justify-center mb-2"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </View>
      <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">{value}</Text>
      <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="px-5 mb-3">
      <View className="flex-row gap-2">
        {renderCard(
          "Open",
          stats.Open || 0,
          "Open",
          <AlertTriangle size={16} color="#ef4444" />,
          "#ef444415",
        )}
        {renderCard(
          "In Progress",
          stats.Inprogress || 0,
          "Inprogress",
          <TrendingUp size={16} color="#3b82f6" />,
          "#3b82f615",
        )}
        {renderCard(
          "Closed",
          stats.Resolved || 0,
          "Resolved",
          <CheckCircle2 size={16} color="#22c55e" />,
          "#22c55e15",
        )}
      </View>
    </View>
  );
};

export default IncidentStats;
