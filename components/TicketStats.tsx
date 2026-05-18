import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
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
        <View className="flex-row gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              height={62}
              borderRadius={12}
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
    status: string | null,
    color: string,
  ) => {
    const isActive = status !== null && status === currentStatus;
    const cardBody = (
      <>
        <Text
          className="text-[17px] font-bold leading-tight"
          style={{ color }}
        >
          {value}
        </Text>
        <Text
          className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5"
          numberOfLines={1}
        >
          {label}
        </Text>
      </>
    );

    const cardClass =
      "flex-1 rounded-xl py-2.5 px-1.5 items-center bg-white dark:bg-slate-900";
    const cardStyle = {
      borderWidth: 1,
      borderColor: isActive ? color : `${color}33`,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    };

    // status === null → display-only card (e.g. Total): not tappable.
    if (status === null) {
      return (
        <View className={cardClass} style={cardStyle}>
          {cardBody}
        </View>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => onStatusChange(status)}
        activeOpacity={0.7}
        className={cardClass}
        style={cardStyle}
      >
        {cardBody}
      </TouchableOpacity>
    );
  };

  return (
    <View className="px-5 mb-3">
      <View className="flex-row gap-1.5">
        {renderStatCard("Total", stats?.total || 0, null, "#64748b")}
        {renderStatCard(
          "Open",
          stats?.byStatus?.Open || 0,
          "Open",
          "#ef4444",
        )}
        {renderStatCard(
          "In prog.",
          stats?.byStatus?.Inprogress || 0,
          "Inprogress",
          "#3b82f6",
        )}
        {renderStatCard(
          "Resolved",
          stats?.byStatus?.Resolved || 0,
          "Resolved",
          "#22c55e",
        )}
      </View>
    </View>
  );
};

export default TicketStats;
