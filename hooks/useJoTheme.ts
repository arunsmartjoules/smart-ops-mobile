/**
 * Theme access for screens built on the "JouleOps App" artboard (carbon
 * canvas + user accent). See constants/jo.ts for the tokens.
 *
 *   const useStyles = makeJoStyles((t) => ({ card: { backgroundColor: t.card } }));
 *
 *   function Screen() {
 *     const t = useJoTheme();     // inline values (icon colours, accent…)
 *     const s = useStyles();      // memoised per (mode, accent)
 *   }
 */
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { joTheme, type JoTheme } from "@/constants/jo";

export type { JoTheme };

export function useJoTheme(): JoTheme {
  const { isDark, accent } = useTheme();
  return joTheme(isDark, accent);
}

type NamedStyles = Parameters<typeof StyleSheet.create>[0];

export function makeJoStyles<T extends NamedStyles>(factory: (t: JoTheme) => T) {
  const cache = new Map<JoTheme, T>();
  const resolve = (t: JoTheme): T => {
    const hit = cache.get(t);
    if (hit) return hit;
    const built = StyleSheet.create(factory(t)) as T;
    cache.set(t, built);
    return built;
  };
  return function useStyles(): T {
    const t = useJoTheme();
    return useMemo(() => resolve(t), [t]);
  };
}
