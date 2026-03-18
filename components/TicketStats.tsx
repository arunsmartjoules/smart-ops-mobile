import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Ticket as TicketIcon,
  TrendingUp,
  CheckCircle,
  X,
} from "lucide-react-native";
import Skeleton from "./Skeleton";

interface TicketStatsProps {
  stats: any;
  loading: boolean;
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

const TicketStats = ({
  stats,
  loading,
  currentStatus,
  onStatusChange,
}: TicketStatsProps) => {
  if (loading || !stats || Object.keys(stats).length === 0) {
    return (
      <View className="px-5 mb-3">
        <View className="flex-row gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              height={70}
              borderRadius={16}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
    );
  }

  const renderStatCard = (
    label: string,
    value: number,
    status: string,
    icon: React.ReactNode,
    color: string,
    bgColor: string,
  ) => {
    const isActive = currentStatus === status;

    return (
      <TouchableOpacity
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
        <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
          {value}
        </Text>
        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="px-5 mb-3">
      <View className="flex-row gap-2">
        {renderStatCard(
          "Open",
          stats?.byStatus?.Open || 0,
          "Open",
          <TicketIcon size={16} color="#ef4444" />,
          "#ef4444",
          "#ef444415",
        )}

        {renderStatCard(
          "In Progress",
          stats?.byStatus?.Inprogress || 0,
          "Inprogress",
          <TrendingUp size={16} color="#3b82f6" />,
          "#3b82f6",
          "#3b82f615",
        )}

        {renderStatCard(
          "Resolved",
          stats?.byStatus?.Resolved || 0,
          "Resolved",
          <CheckCircle size={16} color="#22c55e" />,
          "#22c55e",
          "#22c55e15",
        )}

        {renderStatCard(
          "Cancelled",
          stats?.byStatus?.Cancelled || 0,
          "Cancelled",
          <X size={16} color="#64748b" />,
          "#64748b",
          "#64748b15",
        )}
      </View>
    </View>
  );
};

export default TicketStats;
