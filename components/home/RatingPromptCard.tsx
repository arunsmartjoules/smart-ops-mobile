/**
 * "Enjoying JouleOps?" five star card, floating just above the tab bar on
 * Home. Tapping any star opens the Play Store listing (no review gating).
 *
 * Built not to interrupt work:
 *  - lives only on Home, never on a form or a task screen;
 *  - RatingPromptService decides if it is due at all (a week of real use,
 *    30 day cooldown, 3 asks max, never after rating);
 *  - waits until Home has sat settled for a few seconds with no sheet or
 *    picker open (`enabled`), and goes away for good once Home loses focus.
 */
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Bx } from "@/components/jo/Bx";
import { f } from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";
import RatingPromptService from "@/services/RatingPromptService";

/** How long Home must sit settled before the card slides in. */
const SETTLE_MS = 5000;
/** Lets the filled stars register before the store opens. */
const STORE_HANDOFF_MS = 350;
const STARS = [1, 2, 3, 4, 5] as const;

export function RatingPromptCard({ enabled }: { enabled: boolean }) {
  const t = useJoTheme();
  const s = useStyles();
  const { fabBottom } = useNavInsets();
  const reduceMotion = useReducedMotion();

  const [due, setDue] = useState(false);
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    let alive = true;
    RatingPromptService.isDue().then((d) => {
      if (alive) setDue(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Any change to `enabled` (a sheet opens, a refresh starts) restarts the wait.
  const armed = due && enabled && !shown && !closed;
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => {
      setShown(true);
      RatingPromptService.markShown();
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [armed]);

  // Leaving Home (or opening a sheet) after it appeared counts as "not now".
  // Adjusted during render (React's "store info from previous renders").
  if (shown && !enabled && !closed) setClosed(true);

  useEffect(() => {
    if (picked === 0) return;
    const id = setTimeout(() => {
      setClosed(true);
      void RatingPromptService.rate(picked);
    }, STORE_HANDOFF_MS);
    return () => clearTimeout(id);
  }, [picked]);

  const visible = shown && !closed && enabled;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion ? (visible ? 1 : 0) : withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible, reduceMotion, progress]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[s.card, { bottom: fabBottom }, animStyle]} accessibilityLiveRegion="polite">
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[f.t(14.5, 700), { color: t.ink }]}>Enjoying JouleOps?</Text>
          <Text style={[f.t(12.5), { color: t.muted, marginTop: 2 }]}>
            Tap a star to rate us on the Play Store.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setClosed(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={s.close}
        >
          <Bx name="bx-x" size={18} color={t.ink3} />
        </TouchableOpacity>
      </View>
      <View style={s.stars}>
        {STARS.map((n) => {
          const on = n <= picked;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => setPicked(n)}
              disabled={picked > 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${n} star${n === 1 ? "" : "s"} out of 5`}
              style={s.star}
            >
              <Bx name={on ? "bxs-star" : "bx-star"} size={30} color={on ? t.warn : t.ink3} />
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

const useStyles = makeJoStyles((t) => ({
  card: {
    position: "absolute",
    left: 14,
    right: 14,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    zIndex: 10,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: t.isDark ? 0.4 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  stars: { flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 6 },
  star: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
}));
