import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

interface TicketFiltersProps {
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  /** Optional stats payload ({ byStatus: Record<string, number> }) for count chips. */
  stats?: any;
}

const STATUSES: { value: string; label: string }[] = [
  { value: "Open", label: "Open" },
  { value: "Inprogress", label: "In progress" },
  { value: "Resolved", label: "Resolved" },
  { value: "Hold", label: "Hold" },
  { value: "Waiting", label: "Waiting" },
  { value: "Cancelled", label: "Cancelled" },
];

const TicketFilters = ({
  statusFilter,
  setStatusFilter,
  stats,
}: TicketFiltersProps) => {
  const byStatus = stats?.byStatus as Record<string, number> | undefined;

  return (
    <View className="px-5 mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 20 }}
      >
        {STATUSES.map(({ value, label }) => {
          const active = statusFilter === value;
          const count = byStatus ? byStatus[value] ?? 0 : undefined;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setStatusFilter(value)}
              activeOpacity={0.7}
              className={`flex-row items-center px-3.5 py-2 rounded-xl ${
                active
                  ? "bg-red-600"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              }`}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.03,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <Text
                className={`text-xs font-semibold ${
                  active
                    ? "text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {label}
              </Text>
              {count !== undefined && count > 0 ? (
                <View
                  className={`ml-1.5 px-1.5 rounded ${
                    active ? "bg-white/25" : "bg-slate-100 dark:bg-slate-800"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      active
                        ? "text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default TicketFilters;
