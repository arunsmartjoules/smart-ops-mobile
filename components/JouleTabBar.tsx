/**
 * Floating pill tab bar from the Claude Design "JouleOps App" artboard:
 * Home · three user-pinned modules · More, floating over the screen
 * (left/right 14, bottom 18, height 66). Every item shows its icon over its
 * title; the active one sits on an accent pill with the solid icon. More
 * opens the "All modules" drawer, where "Edit bar" re-picks the three pins.
 *
 * Modules the role can't VIEW (contexts/PermissionsContext) are never shown.
 * Screens pad their content with useNavInsets().clearance.
 */
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import {
  DEFAULT_PINS,
  HOME,
  MAX_PINS,
  MODULES,
  MORE_GROUPS,
  MORE_ICON,
  moduleForTab,
  type ModuleKey,
} from "@/components/jo/modules";
import { togglePin, useNavPins, visiblePins } from "@/services/NavPins";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useTabBarHidden } from "@/services/TabBarVisibility";
import { Bx, solidOf, type BxName } from "@/components/jo/Bx";
import { capsStyle, f } from "@/components/jo/ui";
import { BAR_HEIGHT, useNavInsets } from "@/components/jo/navInsets";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";

interface BarItem {
  key: ModuleKey | "home" | "more";
  label: string;
  icon: BxName;
}

/** Order used to top the bar up when a pinned module is hidden by permissions. */
const FALLBACK_PINS: ModuleKey[] = [
  ...DEFAULT_PINS,
  ...MORE_GROUPS.flatMap((g) => g.keys).filter((k) => !DEFAULT_PINS.includes(k)),
];

export function useModuleVisible() {
  const { canView } = usePermissions();
  return (key: ModuleKey) => {
    const perm = MODULES[key].perm;
    return !perm || canView(perm);
  };
}

export function JouleTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useJoTheme();
  const s = useStyles();
  const { barBottom } = useNavInsets();
  const saved = useNavPins();
  const visible = useModuleVisible();
  const pins = visiblePins(saved, visible, FALLBACK_PINS);
  const [moreOpen, setMoreOpen] = useState(false);
  const hidden = useTabBarHidden();

  const items: BarItem[] = [
    { key: "home", label: HOME.label, icon: HOME.icon },
    ...pins.map((k) => ({ key: k, label: MODULES[k].label, icon: MODULES[k].icon })),
    { key: "more", label: "More", icon: MORE_ICON },
  ];

  const currentRoute = state.routes[state.index]?.name ?? "dashboard";
  const current = moduleForTab(currentRoute);
  // A module that isn't on the bar lights up "More", as in the artboard.
  const activeKey =
    moreOpen ? "more" : current && items.some((i) => i.key === current) ? current : "more";

  const openModule = (key: ModuleKey | "home") => {
    setMoreOpen(false);
    if (key === "home") {
      navigation.navigate(HOME.tab);
      return;
    }
    const m = MODULES[key];
    if (m.tab && state.routes.some((r) => r.name === m.tab)) {
      navigation.navigate(m.tab);
    } else {
      router.push(m.href as any);
    }
  };

  const onPress = (item: BarItem) => {
    if (item.key === "more") {
      setMoreOpen((o) => !o);
      return;
    }
    const tab = item.key === "home" ? HOME.tab : MODULES[item.key].tab;
    const route = tab ? state.routes.find((r) => r.name === tab) : undefined;
    if (route) {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
    }
    openModule(item.key);
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
              onPress={() => onPress(item)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
              style={[s.item, on ? { backgroundColor: t.accent } : null]}
            >
              <Bx name={on ? solidOf(item.icon) : item.icon} size={21} color={on ? t.onAccent : t.navIdle} />
              {/* Every tab carries its title (user request) — the artboard
                  showed it on the active pill only. */}
              <Text
                allowFontScaling={false}
                style={[f.t(10.5, on ? 700 : 500), { color: on ? t.onAccent : t.navIdle }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <MoreDrawer
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpen={(k) => openModule(k)}
        bottomOffset={barBottom + BAR_HEIGHT + 10}
        pins={pins}
        isVisible={visible}
      />
    </View>
  );
}

/* ── All modules drawer ────────────────────────────────────────────────── */

function MoreDrawer({
  visible,
  onClose,
  onOpen,
  bottomOffset,
  pins,
  isVisible,
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (k: ModuleKey) => void;
  bottomOffset: number;
  pins: ModuleKey[];
  isVisible: (k: ModuleKey) => boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [editing, setEditing] = useState(false);

  const close = () => {
    setEditing(false);
    onClose();
  };

  const groups = MORE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter(isVisible) })).filter(
    (g) => g.keys.length > 0,
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[StyleSheet.absoluteFill, { backgroundColor: t.isDark ? "rgba(0,0,0,0.55)" : t.scrim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close modules" />
      </Animated.View>
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(240)} style={[s.drawer, { marginBottom: bottomOffset }]}>
          <View style={s.grabber} />
          <View style={s.drawerHead}>
            <Text style={[f.d(22, -0.02), { color: t.ink }]}>All modules</Text>
            <TouchableOpacity
              onPress={() => setEditing((e) => !e)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: editing }}
              style={[s.editBtn, { backgroundColor: editing ? t.accent : t.track }]}
            >
              <Bx name={editing ? "bx-check" : "bx-pin"} size={15} color={editing ? t.onAccent : t.ink} />
              <Text style={[f.t(12.5, 600), { color: editing ? t.onAccent : t.ink }]}>
                {editing ? "Done" : "Edit bar"}
              </Text>
            </TouchableOpacity>
          </View>
          {editing ? (
            <Text style={[f.t(12), { color: t.muted, paddingTop: 6, paddingHorizontal: 4 }]}>
              Tap to pin up to {MAX_PINS} modules to the bar. Home and More stay fixed.
            </Text>
          ) : null}

          {groups.map((g) => {
            const rows: (ModuleKey | null)[][] = [];
            for (let i = 0; i < g.keys.length; i += 4) {
              const row: (ModuleKey | null)[] = g.keys.slice(i, i + 4);
              while (row.length < 4) row.push(null);
              rows.push(row);
            }
            return (
              <View key={g.label}>
                <Text style={[capsStyle(11.5, 0.06), s.groupLabel, { color: t.muted }]}>{g.label}</Text>
                <View style={{ gap: 6 }}>
                  {rows.map((row, ri) => (
                    <View key={ri} style={{ flexDirection: "row", gap: 6 }}>
                      {row.map((k, ci) =>
                        k ? (
                          <ModuleTile
                            key={k}
                            moduleKey={k}
                            pinned={pins.includes(k)}
                            editing={editing}
                            onPress={() => (editing ? togglePin(k) : onOpen(k))}
                          />
                        ) : (
                          <View key={`pad-${ci}`} style={{ flex: 1 }} />
                        ),
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

function ModuleTile({
  moduleKey,
  pinned,
  editing,
  onPress,
}: {
  moduleKey: ModuleKey;
  pinned: boolean;
  editing: boolean;
  onPress: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const m = MODULES[moduleKey];
  const lit = editing && pinned;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={editing ? `${pinned ? "Unpin" : "Pin"} ${m.label}` : m.label}
      accessibilityState={editing ? { selected: pinned } : undefined}
      style={[
        s.tile,
        {
          backgroundColor: lit ? (t.isDark ? "rgba(255,255,255,0.06)" : t.accentTint) : t.raised,
          borderColor: lit ? t.accent : t.isDark ? "rgba(255,255,255,0.05)" : t.line,
        },
      ]}
    >
      <View style={[s.tileIcon, { backgroundColor: pinned ? t.accent : t.track }]}>
        <Bx name={m.icon} size={20} color={pinned ? t.onAccent : t.ink2} />
      </View>
      <Text style={[f.t(11.5, 600), { color: t.ink, textAlign: "center", lineHeight: 14 }]} numberOfLines={2}>
        {m.label}
      </Text>
      {lit ? (
        <View style={[s.pinBadge, { backgroundColor: t.accent }]}>
          <Bx name="bxs-pin" size={11} color={t.onAccent} />
        </View>
      ) : null}
    </TouchableOpacity>
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
    justifyContent: "space-between",
    paddingHorizontal: 8,
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
    marginHorizontal: 2,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  drawer: {
    marginHorizontal: 8,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    borderRadius: 34,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.handle,
    alignSelf: "center",
    marginBottom: 14,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  editBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  groupLabel: {
    paddingTop: 16,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 4,
    paddingBottom: 10,
    alignItems: "center",
    gap: 7,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
}));
