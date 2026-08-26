/**
 * Bottom bar from the Claude Design "JouleOps Home Redesign" artboard: five
 * labelled tabs on a white surface, the active one carried by the flame accent
 * alone — no pill. Profile is deliberately absent; it lives in the Home hero's
 * avatar.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  CircleAlert,
  LayoutDashboard,
  Sheet,
  SquareCheck,
  Wrench,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ds } from "@/constants/ds";

interface TabDef {
  name: string;
  label: string;
  icon: LucideIcon;
}

/** Order and labels are the mock's. */
const TABS: TabDef[] = [
  { name: "dashboard", label: "Home", icon: LayoutDashboard },
  { name: "tickets", label: "Tickets", icon: Wrench },
  { name: "incidents", label: "Incidents", icon: CircleAlert },
  { name: "site-logs", label: "Logs", icon: Sheet },
  { name: "preventive-maintenance", label: "PM", icon: SquareCheck },
];

export function JouleTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // The mock's 26px bottom padding stands in for the home indicator; on a
  // device the real inset takes over, with a floor for hardware-button phones.
  const paddingBottom = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.bar, { paddingBottom }]}>
      {TABS.map((tab) => {
        const index = state.routes.findIndex((r) => r.name === tab.name);
        if (index === -1) return null;

        const route = state.routes[index];
        const focused = state.index === index;
        const color = focused ? ds.flame[100] : ds.carbon[700];
        const Icon = tab.icon;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({ type: "tabLongPress", target: route.key })
            }
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            style={styles.tab}
          >
            <Icon
              size={21}
              color={color}
              strokeWidth={focused ? 2.4 : 2}
              fill={focused ? color : "transparent"}
              fillOpacity={focused ? 0.16 : 0}
            />
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.label,
                { color, fontWeight: focused ? "600" : "500" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: ds.white,
    paddingTop: 9,
    paddingHorizontal: 8,
    shadowColor: ds.carbon[100],
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    paddingTop: 5,
    paddingBottom: 2,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.54,
    textTransform: "uppercase",
  },
});
