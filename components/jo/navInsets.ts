/**
 * Geometry of the floating tab bar (components/JouleTabBar.tsx). The bar
 * floats OVER the scene like the artboard (left/right 14, bottom 18, height
 * 66), so every tab screen pads its scroll content by `clearance` and sits
 * floating buttons at `fabBottom` (the artboard's bottom: 96 — 12 above the bar).
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const BAR_HEIGHT = 66;

export function useNavInsets() {
  const insets = useSafeAreaInsets();
  // The artboard's bottom: 18 stands in for the home indicator; on a device
  // the real inset takes over, with a floor for hardware-button phones.
  const barBottom = Math.max(insets.bottom, 12) + 6;
  const barTop = barBottom + BAR_HEIGHT;
  return {
    barBottom,
    barTop,
    /** Bottom padding for scroll content so the last row clears the bar (artboard: 110). */
    clearance: barTop + 26,
    /** Bottom offset for a floating action button. */
    fabBottom: barTop + 12,
  };
}
