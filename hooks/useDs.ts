/**
 * Theme-aware access to the JouleOps design-system palette.
 *
 * The DS screens reference tokens semantically (`carbon[100]` is "primary
 * text", `white` is "card surface"), so light and dark are the same token
 * names with different values — see `dsDark` in constants/ds.
 *
 * `StyleSheet.create` captures its values at module-eval time, so a screen
 * whose stylesheet lives at module scope can never react to a theme change.
 * `makeThemedStyles` moves that one level up: the style factory takes the
 * palette, and the returned hook memoizes one stylesheet per theme.
 *
 *   const useStyles = makeThemedStyles((d) => ({
 *     card: { backgroundColor: d.white },
 *   }));
 *
 *   function Screen() {
 *     const styles = useStyles();
 *     const d = useDs();          // for inline values (icon colours, etc.)
 *     ...
 *   }
 */
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { dsDark, dsLight, type DsTheme } from "@/constants/ds";
import { accentDef, type AccentKey } from "@/constants/jo";

export type { DsTheme };

const PALETTES = new Map<string, DsTheme>();

/** One object per (mode, accent) — `makeThemedStyles` caches on identity. */
function palette(isDark: boolean, accent: AccentKey): DsTheme {
  const id = `${isDark ? "d" : "l"}:${accent}`;
  const hit = PALETTES.get(id);
  if (hit) return hit;
  const base = isDark ? dsDark : dsLight;
  // The accent's deep step: white text on it stays readable for every accent.
  const a = accentDef(accent);
  // Legacy screens put white text on controlOn; a dark accent (Thunder) uses
  // its lifted dark-mode fill there so the control still shows on dark pages.
  const built: DsTheme = { ...base, controlOn: isDark && a.dark ? a.dark.color : a.ink };
  PALETTES.set(id, built);
  return built;
}

/** The palette for the active theme, with the user's accent (deep step) as the primary control colour. */
export function useDs(): DsTheme {
  const { isDark, accent } = useTheme();
  return palette(isDark, accent);
}

/** True when the dark palette is active — for the rare either/or branch. */
export function useIsDark(): boolean {
  return useTheme().isDark;
}

type NamedStyles = Parameters<typeof StyleSheet.create>[0];

/**
 * Builds a stylesheet per theme and caches both, so switching themes doesn't
 * re-create styles on every render and screens keep referential stability.
 */
export function makeThemedStyles<T extends NamedStyles>(
  factory: (d: DsTheme) => T,
) {
  const cache = new Map<DsTheme, T>();

  const resolve = (d: DsTheme): T => {
    const hit = cache.get(d);
    if (hit) return hit;
    const built = StyleSheet.create(factory(d)) as T;
    cache.set(d, built);
    return built;
  };

  return function useStyles(): T {
    const d = useDs();
    return useMemo(() => resolve(d), [d]);
  };
}
