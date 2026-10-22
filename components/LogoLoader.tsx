/**
 * Full-screen JouleOps logo fading in, like the launch splash
 * (components/SplashOverlay) — for waits that happen after the splash has
 * gone, e.g. resolving the user's sites right after sign-in. Same canvas, logo
 * and position as the splash, so the two read as one continuous loader.
 */
import { useEffect } from "react";
import { Image, StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { CHARGE_MS, LOGO_SIZE, SPLASH } from "@/components/SplashOverlay";

export default function LogoLoader({ label = "Loading JouleOps" }: { label?: string }) {
  // Follows the system scheme, like the native splash it continues.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const palette = SPLASH[scheme];
  const reduceMotion = useReducedMotion();
  const logoOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    logoOpacity.set(withDelay(150, withTiming(1, { duration: CHARGE_MS - 150, easing: Easing.inOut(Easing.cubic) })));
  }, [reduceMotion, logoOpacity]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.get() }));

  return (
    <View
      style={[styles.container, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Animated.View style={logoStyle}>
        <Image source={palette.logo} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
