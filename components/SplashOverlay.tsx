import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, useColorScheme } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";

/**
 * Animated JS continuation of the native splash.
 *
 * The first frame is pixel-identical to the native launch screen, so the
 * handoff is invisible. These MUST stay in sync with app.json ->
 * expo-splash-screen (backgroundColor / dark.backgroundColor / image),
 * android/res/values{,-night}/colors.xml and the iOS
 * SplashScreenBackground colorset + SplashScreen.storyboard.
 *
 * From 1.1.8 the native splash is the background only (a transparent
 * image), so the launch opens dark and the logo fades in here; the splash
 * stays until the app underneath is ready and always lets the fade finish.
 * Older binaries — which still get this JS over the air — already show the
 * logo natively, so there it simply stays as drawn.
 *
 * The native splash follows the SYSTEM scheme, not the in-app theme override,
 * so this reads useColorScheme() rather than ThemeContext.
 */
export const SPLASH = {
  light: {
    bg: "#FFFFFF",
    logo: require("@/assets/images/jouleops-splash-light.png"),
  },
  dark: {
    bg: "#060C1A",
    logo: require("@/assets/images/jouleops-splash-dark.png"),
  },
} as const;
export const LOGO_SIZE = 180; // = expo-splash-screen imageWidth
/** Logo fade-in on a dark launch (1.1.8+), including its short lead-in. */
export const CHARGE_MS = 1600;

/**
 * Binaries before this version draw the logo on the native splash. The
 * version is the binary's: runtimeVersion follows appVersion, so an OTA
 * bundle only ever runs on a binary with the same version.
 */
const LOGOLESS_NATIVE_SPLASH_SINCE = "1.1.8";
function versionAtLeast(version: string, min: string): boolean {
  const a = version.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}
const NATIVE_SPLASH_HAS_LOGO = !versionAtLeast(Constants.expoConfig?.version ?? "0", LOGOLESS_NATIVE_SPLASH_SINCE);
// Never hold the native splash hostage if the image load event is lost.
const NATIVE_HIDE_FALLBACK_MS = 1500;

SplashScreen.setOptions({ fade: true, duration: 150 });

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
  const [charged, setCharged] = useState(false);
  const hideRequested = useRef(false);

  const opacity = useSharedValue(1);
  const logoScale = useSharedValue(1);
  // Match the native splash's first frame: logo shown on older binaries,
  // background only from 1.1.8 (with reduced motion the logo simply appears).
  const logoOpacity = useSharedValue(NATIVE_SPLASH_HAS_LOGO || reduceMotion ? 1 : 0);

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

  // Fade-in: starts only after the handoff, so the frame the native splash
  // hands over to is untouched (empty from 1.1.8).
  const fadeIn = !NATIVE_SPLASH_HAS_LOGO && !reduceMotion;
  useEffect(() => {
    if (!nativeHidden || !fadeIn) return;
    logoOpacity.set(withDelay(250, withTiming(1, { duration: CHARGE_MS - 250, easing: Easing.inOut(Easing.cubic) })));
    const t = setTimeout(() => setCharged(true), CHARGE_MS);
    return () => clearTimeout(t);
  }, [nativeHidden, fadeIn, logoOpacity]);

  // Nothing to wait for when the logo isn't fading in.
  const chargeDone = charged || !fadeIn;

  // Exit: cross-fade onto the first real screen, which is already mounted and
  // painted underneath, so there is never an empty frame between the two.
  useEffect(() => {
    if (!ready || !nativeHidden || !chargeDone) return;
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
  }, [ready, nativeHidden, chargeDone, reduceMotion, onFinish, opacity, logoScale]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.get(),
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
});
