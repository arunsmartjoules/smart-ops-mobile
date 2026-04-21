import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

interface IncidentTopFiltersProps {
  selected: string;
  onChange: (value: string) => void;
  canEdit: boolean;
}

const FILTERS = ["Open", "RCA Under Review", "RCA Submitted"];

const IncidentTopFilters = ({ selected, onChange, canEdit }: IncidentTopFiltersProps) => {
  return (
    <View className="px-5 mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 20 }}
      >
        {FILTERS.map((item) => {
          const active = selected === item;
          return (
            <TouchableOpacity
              key={item}
              disabled={!canEdit}
              onPress={() => onChange(item)}
              className={`px-4 py-2 rounded-xl ${
                active
                  ? "bg-red-600"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              }`}
              style={{
                opacity: canEdit ? 1 : 0.65,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.03,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? "text-white" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default IncidentTopFilters;
