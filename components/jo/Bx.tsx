/**
 * Boxicons glyph — the icon set the Claude Design artboards use, rendered
 * from the bundled font (assets/fonts/boxicons.ttf, loaded in app/_layout as
 * "boxicons"). Pass the artboard's class name verbatim:
 *
 *   <Bx name="bx-receipt" size={22} color={t.ink} />
 *   <Bx name="bxs-home-alt-2" … />   // solid variant (active tab)
 */
import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { BOXICONS_GLYPHS, type BxName } from "@/constants/boxiconsGlyphs";

export type { BxName };

export function Bx({
  name,
  size = 20,
  color,
  style,
  accessibilityLabel,
}: {
  name: BxName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const code = BOXICONS_GLYPHS[name];
  return (
    <Text
      allowFontScaling={false}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
      style={[
        {
          fontFamily: "boxicons",
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          textAlign: "center",
          includeFontPadding: false,
          color,
        },
        style,
      ]}
    >
      {String.fromCodePoint(code)}
    </Text>
  );
}

/** Solid counterpart used for the active tab (artboard SOLID map), when one exists. */
export function solidOf(name: BxName): BxName {
  if (!name.startsWith("bx-")) return name;
  const solid = `bxs-${name.slice(3)}` as BxName;
  return solid in BOXICONS_GLYPHS ? solid : name;
}
