import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";

interface LogTypeTabProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const LOG_TYPES = [
  "Temp RH",
  "Water Parameters",
  "Chemical Dosing",
  "Chiller Logs",
];

export const LogTypeTab: React.FC<LogTypeTabProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.tabWrapper}>
          {LOG_TYPES.map((type) => {
            const isActive = activeTab === type;
            return (
              <Pressable
                key={type}
                onPress={() => onTabChange(type)}
                style={[styles.tab, isActive && styles.tabActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  tabWrapper: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 4,
    borderRadius: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  tabTextActive: {
    color: "#2563eb",
  },
});
