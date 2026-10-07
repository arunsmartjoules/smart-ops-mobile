import React from "react";
import { Text } from "react-native";
import { useDs } from "@/hooks/useDs";

/**
 * Renders a field label, turning a trailing " *" into a red required marker.
 *
 * Labels across the app carry their asterisk inline ("Site *") and are drawn
 * in the label's own colour, which in dark mode is white — so the marker read
 * as part of the word. Rendering it through here, inside the caller's existing
 * `<Text>`, keeps every label's font and colour and recolours only the star.
 */
export function splitRequired(label: string): { base: string; required: boolean } {
  const m = /^(.*?)\s*\*\s*$/.exec(label);
  return m ? { base: m[1] ?? "", required: true } : { base: label, required: false };
}

export default function RequiredMark({ label }: { label: string }) {
  const ds = useDs();
  const { base, required } = splitRequired(label);
  return (
    <>
      {base}
      {required ? (
        <Text style={{ color: ds.flame[100] }} accessibilityLabel="required">
          {" *"}
        </Text>
      ) : null}
    </>
  );
}
