/**
 * Full-screen JouleOps logo with the splash's charge-up (components/
 * SplashOverlay): tiny gold sparks start crackling and build while the logo
 * fades in — for waits that happen after the launch splash has gone, e.g.
 * resolving the user's sites right after sign-in. Same canvas, logo and
 * position as the splash, so the two read as one continuous loader.
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
import LightningField from "@/components/LightningField";

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
      <LightningField active scheme={scheme} rampMs={CHARGE_MS} />
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
