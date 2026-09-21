import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, useColorScheme } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

/**
 * Animated JS continuation of the native splash.
 *
 * The first frame is pixel-identical to the native launch screen, so the
 * handoff is invisible. These MUST stay in sync with app.json ->
 * expo-splash-screen (backgroundColor / dark.backgroundColor / imageWidth /
 * image), android/res/values{,-night}/colors.xml and the iOS
 * SplashScreenBackground colorset + SplashScreen.storyboard.
 *
 * The native splash follows the SYSTEM scheme, not the in-app theme override,
 * so this reads useColorScheme() rather than ThemeContext.
 */
const SPLASH = {
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
const LOGO_SIZE = 180; // = expo-splash-screen imageWidth
const ACCENT = "#C83E12"; // logo flame red
const TRACK_W = 96;
const BAR_W = 32;
// Only show the loader when loading is actually slow — a fast start should
// never flash it on and off.
const LOADER_DELAY_MS = 600;
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
  const hideRequested = useRef(false);

  const opacity = useSharedValue(1);
  const logoScale = useSharedValue(1);
  const loaderOpacity = useSharedValue(0);
  const barX = useSharedValue(0);

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

  // Idle animation: starts only after the handoff, so the frame the native
  // splash hands over to is the untouched logo.
  useEffect(() => {
    if (!nativeHidden || ready || reduceMotion) return;
    const ease = Easing.inOut(Easing.quad);
    logoScale.set(
      withRepeat(
        withSequence(
          withTiming(1.04, { duration: 900, easing: ease }),
          withTiming(1, { duration: 900, easing: ease }),
        ),
        -1,
      ),
    );
    loaderOpacity.set(
      withDelay(LOADER_DELAY_MS, withTiming(1, { duration: 250 })),
    );
    barX.set(
      withRepeat(
        withTiming(TRACK_W - BAR_W, {
          duration: 850,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true,
      ),
    );
  }, [nativeHidden, ready, reduceMotion, logoScale, loaderOpacity, barX]);

  // Exit: cross-fade onto the first real screen, which is already mounted and
  // painted underneath, so there is never an empty frame between the two.
  useEffect(() => {
    if (!ready || !nativeHidden) return;
    cancelAnimation(barX);
    loaderOpacity.set(withTiming(0, { duration: 150 }));
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
  }, [
    ready,
    nativeHidden,
    reduceMotion,
    onFinish,
    opacity,
    logoScale,
    loaderOpacity,
    barX,
  ]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.get() }],
  }));
  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.get(),
  }));
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: barX.get() }],
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
      {!reduceMotion && (
        // Absolutely positioned so the logo stays exactly where the native
        // splash drew it.
        <Animated.View
          style={[
            styles.loader,
            { backgroundColor: palette.track },
            loaderStyle,
          ]}
        >
          <Animated.View style={[styles.bar, barStyle]} />
        </Animated.View>
      )}
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
  loader: {
    position: "absolute",
    top: "50%",
    marginTop: 56,
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  bar: {
    width: BAR_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
});
