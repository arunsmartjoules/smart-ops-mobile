/**
 * Appearance — app theme settings: light / dark / system mode and the accent
 * colour every screen picks up (the artboard's flame / lime / violet / mint,
 * plus sky, rose and amber). Built in the "JouleOps App" visual language; the
 * artboard itself only names the setting ("Appearance" in Profile › App).
 *
 * Saved per device (ThemeContext → AsyncStorage) and applied instantly.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronLeft, Monitor, Moon, Sun, type LucideIcon } from "@/components/jo/bxIcons";
import { useTheme } from "@/contexts/ThemeContext";
import { ACCENTS } from "@/constants/jo";
import {
  HeroCard,
  HeroTag,
  IconButton,
  JoPage,
  ProgressBar,
  SectionCaption,
  Card,
  f,
  capsStyle,
} from "@/components/jo/ui";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";

const MODES: { key: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { key: "dark", label: "Dark", icon: Moon },
  { key: "light", label: "Light", icon: Sun },
  { key: "system", label: "System", icon: Monitor },
];

export default function AppearanceScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { theme, setTheme, accent, setAccent } = useTheme();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profile");
  };

  return (
    <JoPage>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.headRow}>
          <IconButton icon={ChevronLeft} label="Back" onPress={back} iconSize={22} />
        </View>
        <Text style={[f.t(13), { color: t.muted, paddingHorizontal: 4, marginTop: 14 }]}>App settings</Text>
        <Text style={[f.d(28, -0.025), { color: t.ink, paddingHorizontal: 4, marginTop: 4 }]}>Appearance</Text>

        {/* Live preview of the chosen accent. */}
        <HeroCard style={{ marginTop: 16, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[capsStyle(12), { color: t.onAccent, opacity: 0.7 }]}>Preview</Text>
            <HeroTag label="SLA 4.52 · On target" color={t.isDark ? t.ok : "#5EEAD4"} dot />
          </View>
          <Text style={[f.d(40, -0.045, 1), { color: t.onAccent, marginTop: 10 }]}>2h 14m</Text>
          <Text style={[f.t(12), { color: t.onAccent, opacity: 0.68, marginTop: 5 }]}>
            Your accent colours buttons, highlights and the active tab.
          </Text>
        </HeroCard>

        <SectionCaption>Accent</SectionCaption>
        <Card radius={26} style={{ padding: 14 }}>
          <View style={s.swatchGrid}>
            {ACCENTS.map((a) => {
              const on = a.key === accent;
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => setAccent(a.key)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${a.label} accent`}
                  style={s.swatchCell}
                >
                  <View style={[s.swatchRing, { borderColor: on ? a.color : "transparent" }]}>
                    <View style={[s.swatch, { backgroundColor: a.color }]}>
                      {on ? <Check size={20} color="#0A0A0C" strokeWidth={2.8} /> : null}
                    </View>
                  </View>
                  <Text style={[f.t(12, on ? 600 : 500), { color: on ? t.ink : t.muted, marginTop: 6 }]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={[f.t(11.5), { color: t.muted }]}>Sample progress</Text>
            <ProgressBar pct={68} color={t.accent} height={6} />
          </View>
        </Card>

        <SectionCaption>Mode</SectionCaption>
        <Card radius={26} style={{ padding: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {MODES.map((m) => {
              const on = m.key === theme;
              const Icon = m.icon;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setTheme(m.key)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${m.label} mode`}
                  style={[s.mode, { backgroundColor: on ? t.selBg : t.raised }]}
                >
                  <Icon size={20} color={on ? t.selFg : t.ink2} />
                  <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
        <Text style={[f.t(11.5), { color: t.muted, paddingHorizontal: 6, marginTop: 8, lineHeight: 16 }]}>
          System follows your phone&apos;s setting. The JouleOps design is made for dark mode.
        </Text>
      </ScrollView>
    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  headRow: { flexDirection: "row", paddingTop: 12 },
  swatchGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  swatchCell: { width: "25%", alignItems: "center" },
  swatchRing: {
    padding: 3,
    borderRadius: 32,
    borderWidth: 2,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  mode: {
    flex: 1,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
}));
