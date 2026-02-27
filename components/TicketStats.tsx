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
}

const TicketStats = ({ stats, loading }: TicketStatsProps) => {
  if (loading && !stats) {
    return (
      <View className="px-5 mb-3">
        <View className="flex-row gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              height={80}
              style={{ flex: 1, borderRadius: 12 }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="px-5 mb-3">
      <View className="flex-row gap-2">
        <TouchableOpacity
          className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
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
            style={{ backgroundColor: "#ef444415" }}
          >
            <TicketIcon size={16} color="#ef4444" />
          </View>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
            {stats?.byStatus?.Open || 0}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs">
            Open
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
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
            style={{ backgroundColor: "#3b82f615" }}
          >
            <TrendingUp size={16} color="#3b82f6" />
          </View>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
            {stats?.byStatus?.Inprogress || 0}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs">
            In Progress
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
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
            style={{ backgroundColor: "#22c55e15" }}
          >
            <CheckCircle size={16} color="#22c55e" />
          </View>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
            {stats?.byStatus?.Resolved || 0}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs">
            Resolved
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
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
            style={{ backgroundColor: "#64748b15" }}
          >
            <X size={16} color="#64748b" />
          </View>
          <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
            {stats?.byStatus?.Cancelled || 0}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs">
            Cancelled
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default TicketStats;
