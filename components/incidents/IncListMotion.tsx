/**
 * List motion for the incidents tab — a module-local copy of the shared
 * ListChrome behaviour (that file belongs to the other module lists):
 *
 *  - `useListSlide`: the list slides in from the right when moving to a later
 *    status tab and from the left when moving back.
 *  - `SwipeTabs`: a horizontal swipe moves to the next / previous status tab.
 *    Vertical-first drags fail the pan, so scrolling and pull-to-refresh are
 *    untouched; it stops at the first and last tab rather than wrapping.
 */
import React, { useEffect, useMemo } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

const MOTION = { duration: 220, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const SLIDE_DISTANCE = 26;

export function useListSlide(seq: number, direction: number) {
  const offset = useSharedValue(0);
  useEffect(() => {
    if (seq === 0) return;
    offset.value = direction >= 0 ? SLIDE_DISTANCE : -SLIDE_DISTANCE;
    offset.value = withTiming(0, MOTION);
  }, [seq, direction, offset]);
  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: 1 - Math.min(Math.abs(offset.value) / SLIDE_DISTANCE, 1),
  }));
}

/** Horizontal travel (px) before a drag counts as a swipe rather than a scroll. */
const SWIPE_ACTIVATE_X = 24;
/** Vertical travel (px) that hands the touch back to the list's own scroll. */
const SWIPE_FAIL_Y = 14;
/** Distance or flick speed that commits the swipe on release. */
const SWIPE_COMMIT_X = 60;
const SWIPE_COMMIT_VX = 500;

export function SwipeTabs({
  keys,
  active,
  onSelect,
  style,
  children,
}: {
  keys: string[];
  active: string;
  onSelect: (key: string) => void;
  style?: React.ComponentProps<typeof Animated.View>["style"];
  children: React.ReactNode;
}) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
        .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
        .onEnd((e) => {
          const committed =
            Math.abs(e.translationX) >= SWIPE_COMMIT_X || Math.abs(e.velocityX) >= SWIPE_COMMIT_VX;
          if (!committed || Math.abs(e.translationX) < Math.abs(e.translationY)) return;
          const idx = keys.indexOf(active);
          if (idx < 0) return;
          const next = keys[idx + (e.translationX < 0 ? 1 : -1)];
          if (!next) return;
          Haptics.selectionAsync().catch(() => {});
          onSelect(next);
        }),
    [keys, active, onSelect],
  );
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
