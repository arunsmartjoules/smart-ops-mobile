/**
 * In-screen tabs drawn as the SLA screen's chips (Overall · Comfort · …):
 * a horizontally scrolling row of 36-high pills — icon, label and an optional
 * trailing figure (score / count). The selected chip takes the bright ink
 * fill; the row keeps it scrolled into view.
 *
 * Used by Reports (Modules · Daily · MTD) and Client comms (Action items ·
 * Feedback) so their tabs match SLA's.
 */
import React, { useEffect, useRef } from "react";
import { ScrollView, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

export interface ChipTab<K extends string> {
  key: K;
  label: string;
  icon: BxName;
  /** Icon colour when not selected (defaults to the secondary ink). */
  color?: string;
  /** Small trailing figure, e.g. a count or score. */
  meta?: string | number | null;
}

export function ChipTabs<K extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: ChipTab<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const scrollRef = useRef<ScrollView>(null);
  const xs = useRef<Partial<Record<K, number>>>({});

  useEffect(() => {
    const x = xs.current[value];
    if (x != null) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [value]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[s.scroll, style]}
      contentContainerStyle={s.row}
      accessibilityRole="tablist"
    >
      {items.map((it) => {
        const on = it.key === value;
        const meta = it.meta == null || it.meta === "" ? null : String(it.meta);
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            onLayout={(e) => {
              const x = e.nativeEvent.layout.x;
              xs.current[it.key] = x;
              if (on) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: false });
            }}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={meta ? `${it.label}, ${meta}` : it.label}
            style={[s.tab, on ? s.tabOn : null]}
          >
            {on ? <GlossFill color={t.selBg} fg={t.selFg} radius={18} bleed={1} /> : null}
            <Bx name={it.icon} size={15} color={on ? t.selFg : it.color ?? t.ink2} />
            <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]}>{it.label}</Text>
            {meta ? <Text style={[f.t(11, 600), { color: on ? t.faint : t.muted }]}>{meta}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  // Bleeds to the screen edges so chips scroll under the page padding.
  scroll: { marginHorizontal: -16, flexGrow: 0 },
  row: { gap: 6, paddingHorizontal: 16 },
  tab: {
    height: 36,
    paddingLeft: 11,
    paddingRight: 13,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
  },
  tabOn: { backgroundColor: t.selBg, borderColor: t.selBg },
}));
