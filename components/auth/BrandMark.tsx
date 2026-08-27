import React from "react";
import { Text, View } from "react-native";
import { Zap } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { authRadius, useAuthPalette } from "./authTheme";

/**
 * Sign-in lockup from the auth mock: a flame square with the bolt glyph and
 * the wordmark, left-aligned above the heading. The mark stays flame on both
 * the dark and light artboards; only the wordmark flips.
 */
export function BrandMark() {
  const styles = useStyles();
  const ds = useDs();
  const t = useAuthPalette();

  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        <Zap size={18} color={ds.onAccent} fill={ds.onAccent} strokeWidth={1.5} />
      </View>
      <Text style={[styles.word, { color: t.text }]}>JouleOps</Text>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: authRadius.mark,
    backgroundColor: ds.flame[100],
    alignItems: "center",
    justifyContent: "center",
  },
  word: { fontSize: 17, fontWeight: "600", letterSpacing: 0.51 },
}));
