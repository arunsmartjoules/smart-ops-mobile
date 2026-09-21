/**
 * Bottom bar from the Claude Design "JouleOps Role Dashboard v2" artboard: a
 * navy #0B1220 bar (white in light mode) under a hairline, labelled tabs, the active one carried by
 * the web app's primary alone and the rest in the artboard's faint #3E506A. Profile
 * is deliberately absent; it lives in the Home header's avatar button.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  CircleAlert,
  LayoutDashboard,
  ScanText,
  Sheet,
  SquareCheck,
  Wrench,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";

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
  // Asset Mapping (nameplate verification) — appended after the mock's five.
  { name: "asset-mapping", label: "Assets", icon: ScanText },
];

export function JouleTabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const ds = useDs();
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
        // Inactive is the artboard's faint #3E506A on navy; on the white light bar
        // that step is too pale, so light mode takes a darker one.
        const idle = ds.isDark ? ds.carbon[800] : ds.carbon[600];
        const color = focused ? ds.controlOn : idle;
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
              size={19}
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
                { color },
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

const useStyles = makeThemedStyles((ds) => ({
  bar: {
    flexDirection: "row",
    gap: 2,
    // The artboard's dark tab bar sits a step below the card surface, with a
    // hairline instead of the light build's lifted shadow.
    backgroundColor: ds.tabBar,
    borderTopWidth: 1,
    borderTopColor: ds.cardBorder,
    paddingTop: 9,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    paddingBottom: 2,
  },
  label: {
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
}));
