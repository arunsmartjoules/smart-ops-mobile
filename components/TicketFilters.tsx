import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

interface TicketFiltersProps {
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}

const TicketFilters = ({
  statusFilter,
  setStatusFilter,
}: TicketFiltersProps) => {
  const statuses = [
    "Open",
    "Inprogress",
    "Resolved",
    "Hold",
    "Waiting",
    "Cancelled",
    "All",
  ];

  return (
    <View className="px-5 mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {statuses.map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() => setStatusFilter(item)}
            className={`px-4 py-2 rounded-xl ${
              statusFilter === item
                ? "bg-red-600"
                : "bg-white border border-slate-200"
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
                statusFilter === item ? "text-white" : "text-slate-500"
              }`}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default TicketFilters;
