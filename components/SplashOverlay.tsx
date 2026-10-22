import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Animated JS continuation of the native splash.
 *
 * The first frame is pixel-identical to the native launch screen (the logo on
 * the splash background), so the handoff is invisible. These MUST stay in
 * sync with app.json -> expo-splash-screen (backgroundColor /
 * dark.backgroundColor / imageWidth / image), android/res/values{,-night}/
 * colors.xml and the iOS SplashScreenBackground colorset +
 * SplashScreen.storyboard.
 *
 * After the handoff the logo stays put and a slim loading bar slides under it
 * until the app underneath is ready (services/LaunchHold).
 *
 * The native splash follows the SYSTEM scheme, not the in-app theme override,
 * so this reads useColorScheme() rather than ThemeContext.
 */
export const SPLASH = {
  light: {
    bg: "#FFFFFF",
    logo: require("@/assets/images/jouleops-splash-light.png"),
    track: "rgba(10, 42, 51, 0.10)",
  },
  dark: {
    bg: "#060C1A",
    logo: require("@/assets/images/jouleops-splash-dark.png"),
    track: "rgba(255, 255, 255, 0.14)",
  },
} as const;
export const LOGO_SIZE = 180; // = expo-splash-screen imageWidth
/** Logo flame red — the bar's colour. */
const ACCENT = "#C83E12";
const ACCENT_LIGHT = "#E57A55";
const TRACK_W = 120;
const BAR_W = 40;
// Never hold the native splash hostage if the image load event is lost.
const NATIVE_HIDE_FALLBACK_MS = 1500;

SplashScreen.setOptions({ fade: true, duration: 150 });

/**
 * Indeterminate loading bar under the splash logo: a short segment sliding
 * back and forth along a faint track. Positioned like the splash logo's
 * centre, just below it. A still, full-width bar when motion is reduced.
 */
export function SplashLoadingBar({ scheme, visible = true }: { scheme: "dark" | "light"; visible?: boolean }) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    shown.set(withTiming(1, { duration: 200 }));
    if (reduceMotion) return;
    x.set(withRepeat(withTiming(TRACK_W - BAR_W, { duration: 850, easing: Easing.inOut(Easing.cubic) }), -1, true));
  }, [visible, reduceMotion, x, shown]);

  const trackStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <Animated.View
      style={[styles.track, { backgroundColor: SPLASH[scheme].track }, trackStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Animated.View style={[reduceMotion ? { width: TRACK_W } : { width: BAR_W }, styles.bar, barStyle]}>
        <LinearGradient
          colors={[ACCENT_LIGHT, ACCENT]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

export default function SplashOverlay({
  ready,
  onFinish,
}: {
  /** The app underneath has what it needs; start the exit transition. */
  ready: boolean;
  /** Exit animation finished — unmount the overlay. */
  onFinish: () => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const palette = SPLASH[scheme];
  const reduceMotion = useReducedMotion();
  const [nativeHidden, setNativeHidden] = useState(false);
  const hideRequested = useRef(false);

  const opacity = useSharedValue(1);
  const logoScale = useSharedValue(1);

  // Hide the native splash only once our logo has decoded AND painted —
  // hiding earlier shows a frame of bare background (the flicker).
  const hideNative = useCallback(() => {
    if (hideRequested.current) return;
    hideRequested.current = true;
    requestAnimationFrame(() => {
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setNativeHidden(true));
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(hideNative, NATIVE_HIDE_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [hideNative]);

  // Exit: cross-fade onto the first real screen, which is already mounted and
  // painted underneath, so there is never an empty frame between the two.
  useEffect(() => {
    if (!ready || !nativeHidden) return;
    logoScale.set(
      withTiming(reduceMotion ? 1 : 1.08, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      }),
    );
    opacity.set(
      withDelay(
        60,
        withTiming(
          0,
          { duration: 300, easing: Easing.out(Easing.quad) },
          (finished) => {
            if (finished) scheduleOnRN(onFinish);
          },
        ),
      ),
    );
  }, [ready, nativeHidden, reduceMotion, onFinish, opacity, logoScale]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.get() }],
  }));

  return (
    <Animated.View
      pointerEvents={ready ? "none" : "auto"}
      accessible
      accessibilityLabel="Loading JouleOps"
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { backgroundColor: palette.bg },
        containerStyle,
      ]}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Animated.View style={logoStyle}>
        <Image
          source={palette.logo}
          style={styles.logo}
          resizeMode="contain"
          // Android fades images in over 300ms by default — that fade IS a
          // flicker against the native splash.
          fadeDuration={0}
          onLoadEnd={hideNative}
        />
      </Animated.View>
      {/* Absolutely positioned so the logo stays exactly where the native
          splash drew it; appears only after the handoff. */}
      <View style={styles.barSlot} pointerEvents="none">
        <SplashLoadingBar scheme={scheme} visible={nativeHidden} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  barSlot: { position: "absolute", top: "50%", marginTop: 52, alignItems: "center", left: 0, right: 0 },
  track: { width: TRACK_W, height: 4, borderRadius: 2, overflow: "hidden" },
  bar: { height: 4, borderRadius: 2, overflow: "hidden" },
});
