/**
 * Floating pill tab bar from the Claude Design "JouleOps App" artboard:
 * Home · three user-pinned modules · More. The active item grows into an
 * accent pill with its label; the rest are bare grey icons. More opens the
 * "All modules" drawer, where "Edit bar" re-picks the three pins.
 *
 * The bar sits in layout flow under the scene (not over it), so screens that
 * predate this design never have their last rows hidden behind it.
 */
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import { Check, Ellipsis, Pin, type LucideIcon } from "lucide-react-native";
import {
  HOME,
  MODULES,
  MORE_GROUPS,
  moduleForTab,
  type ModuleKey,
} from "@/components/jo/modules";
import { togglePin, useNavPins } from "@/services/NavPins";
import { capsStyle, f } from "@/components/jo/ui";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";

const BAR_HEIGHT = 66;

interface BarItem {
  key: ModuleKey | "home" | "more";
  label: string;
  icon: LucideIcon;
}

export function JouleTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useJoTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const pins = useNavPins();
  const [moreOpen, setMoreOpen] = useState(false);

  const items: BarItem[] = [
    { key: "home", label: HOME.label, icon: HOME.icon },
    ...pins.map((k) => ({ key: k, label: MODULES[k].label, icon: MODULES[k].icon })),
    { key: "more", label: "More", icon: Ellipsis },
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

  // The artboard's bottom: 18 stands in for the home indicator; on a device
  // the real inset takes over, with a floor for hardware-button phones.
  const bottomPad = Math.max(insets.bottom, 12) + 6;

  return (
    <View style={[s.wrap, { paddingBottom: bottomPad }]}>
      <View style={s.bar}>
        {items.map((item) => {
          const on = item.key === activeKey;
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onPress(item)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
              style={[
                s.item,
                on ? { backgroundColor: t.accent, paddingHorizontal: 15 } : null,
              ]}
            >
              <Icon size={22} color={on ? t.onAccent : t.navIdle} strokeWidth={on ? 2.4 : 2} />
              {on ? (
                <Text style={[f.t(13, 600), { color: t.onAccent }]} numberOfLines={1}>
                  {item.label}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <MoreDrawer
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpen={(k) => openModule(k)}
        bottomOffset={bottomPad + BAR_HEIGHT + 10}
        pins={pins}
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
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (k: ModuleKey) => void;
  bottomOffset: number;
  pins: ModuleKey[];
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [editing, setEditing] = useState(false);

  const close = () => {
    setEditing(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: t.isDark ? "rgba(0,0,0,0.55)" : t.scrim }]}>
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
              {editing ? <Check size={15} color={t.onAccent} /> : <Pin size={15} color={t.ink} />}
              <Text style={[f.t(12.5, 600), { color: editing ? t.onAccent : t.ink }]}>
                {editing ? "Done" : "Edit bar"}
              </Text>
            </TouchableOpacity>
          </View>
          {editing ? (
            <Text style={[f.t(12), { color: t.muted, paddingTop: 6, paddingHorizontal: 4 }]}>
              Tap to pin up to 3 modules to the bar. Home and More stay fixed.
            </Text>
          ) : null}

          {MORE_GROUPS.map((g) => {
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
  const Icon = m.icon;
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
        <Icon size={20} color={pinned ? t.onAccent : t.ink2} />
      </View>
      <Text style={[f.t(11.5, 600), { color: t.ink, textAlign: "center", lineHeight: 14 }]} numberOfLines={2}>
        {m.label}
      </Text>
      {lit ? (
        <View style={[s.pinBadge, { backgroundColor: t.accent }]}>
          <Pin size={11} color={t.onAccent} fill={t.onAccent} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const useStyles = makeJoStyles((t) => ({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: t.page,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: t.isDark ? 0.7 : 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  item: {
    height: 50,
    minWidth: 46,
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
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
