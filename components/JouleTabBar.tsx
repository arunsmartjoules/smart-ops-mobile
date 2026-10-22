/**
 * Floating pill tab bar (Claude Design "JouleOps App" artboard styling):
 * Home · Ops · Resources · Settings, floating over the screen (left/right
 * 14, bottom 18, height 66). Every item shows its icon over its title; the
 * active one sits on an accent pill with the solid icon.
 *
 * "Ops" groups Tickets / PM / Site Logs / Incidents / Assets and "Resources"
 * groups SLA / Reports / Client comms; each switches via the sub-tab strip at
 * the top of its screens (components/jo/OpsTabs) and the bar opens the last
 * one used. Items the role can't view are not shown.
 * Screens pad their content with useNavInsets().clearance.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  BOTTOM_TABS,
  SUB_TABS,
  bottomKeyForRoute,
  getLastSubTab,
  type BottomKey,
} from "@/components/jo/modules";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useTabBarHidden } from "@/services/TabBarVisibility";
import { Bx, solidOf } from "@/components/jo/Bx";
import { f } from "@/components/jo/ui";
import { BAR_HEIGHT, useNavInsets } from "@/components/jo/navInsets";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";

export function JouleTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useJoTheme();
  const s = useStyles();
  const { barBottom } = useNavInsets();
  const { canView } = usePermissions();
  const hidden = useTabBarHidden();

  const opsTabs = SUB_TABS.ops.filter((o) => canView(o.perm));
  const resourceTabs = SUB_TABS.resources.filter((o) => canView(o.perm));
  const items = BOTTOM_TABS.filter((b) =>
    b.key === "ops"
      ? opsTabs.length > 0
      : b.key === "resources"
        ? resourceTabs.length > 0
        : !b.perm || canView(b.perm),
  );

  const currentRoute = state.routes[state.index]?.name ?? "dashboard";
  const activeKey = bottomKeyForRoute(currentRoute);

  /** Bottom item → the (tabs) route it opens. */
  const routeFor = (key: BottomKey): string => {
    if (key === "ops" || key === "resources") {
      const group = key === "ops" ? opsTabs : resourceTabs;
      const last = group.find((o) => o.key === getLastSubTab(key)) ?? group[0];
      return last?.tab ?? "dashboard";
    }
    return BOTTOM_TABS.find((b) => b.key === key)?.tab ?? "dashboard";
  };

  const onPress = (key: BottomKey) => {
    const name = routeFor(key);
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && state.routes[state.index]?.name !== name) navigation.navigate(name);
  };

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={[s.float, { bottom: barBottom }]}>
      <View style={s.bar}>
        {items.map((item) => {
          const on = item.key === activeKey;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onPress(item.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
              style={[s.item, on ? { backgroundColor: t.accent } : null]}
            >
              <Bx name={on ? solidOf(item.icon) : item.icon} size={21} color={on ? t.onAccent : t.navIdle} />
              <Text
                allowFontScaling={false}
                style={[f.t(10.5, on ? 700 : 500), { color: on ? t.onAccent : t.navIdle }]}
                numberOfLines={1}
                // Six items: long titles ("Client comms") shrink a touch on narrow phones.
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  float: {
    position: "absolute",
    left: 14,
    right: 14,
    // Android orders siblings by elevation before draw order, and the native
    // screen container otherwise paints the scene OVER the bar. The wrapper
    // has no background, so this lifts it without casting a shadow.
    zIndex: 20,
    elevation: 20,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: t.navBg,
    borderWidth: 1,
    borderColor: t.navBorder,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    // 0 18px 40px -12px rgba(0,0,0,.7)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: t.isDark ? 0.7 : 0.16,
    shadowRadius: 20,
    elevation: 12,
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 52,
    marginHorizontal: 1,
    paddingHorizontal: 2,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
}));
