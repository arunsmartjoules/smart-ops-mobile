/**
 * Full-screen JouleOps logo with the splash's loading bar under it
 * (components/SplashOverlay) — for waits that happen after the launch splash
 * has gone, e.g. resolving the user's sites right after sign-in. Same canvas,
 * logo and position as the splash, so the two read as one continuous loader.
 */
import { Image, StyleSheet, useColorScheme, View } from "react-native";
import { LOGO_SIZE, SPLASH, SplashLoadingBar } from "@/components/SplashOverlay";

export default function LogoLoader({ label = "Loading JouleOps" }: { label?: string }) {
  // Follows the system scheme, like the native splash it continues.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const palette = SPLASH[scheme];

  return (
    <View
      style={[styles.container, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Image source={palette.logo} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      <View style={styles.barSlot} pointerEvents="none">
        <SplashLoadingBar scheme={scheme} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  barSlot: { position: "absolute", top: "50%", marginTop: 52, alignItems: "center", left: 0, right: 0 },
});
