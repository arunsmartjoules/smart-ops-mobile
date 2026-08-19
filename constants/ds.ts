/**
 * JouleOps design-system tokens (mobile).
 *
 * Mirrors the Claude Design "jouleops-design-system" token set
 * (_ds/.../tokens/colors.css) so native screens can be built against the same
 * palette the web app and the design mocks use. Values are copied verbatim —
 * keep them in sync with the design system rather than tweaking them here.
 */

export const ds = {
  // ── Brand scales (100 = Main → 1000 = Lightest) ───────────────────────────
  thunder: {
    100: "#072B31",
    200: "#1F3F44",
    300: "#38545A",
    400: "#56686E",
    500: "#6F7D81",
    600: "#889395",
    700: "#A2A9AB",
    800: "#BCC1C3",
    900: "#D5D9DA",
    1000: "#ECEDEE",
  },
  sky: {
    100: "#28939D",
    200: "#44A0A8",
    300: "#5DAEB4",
    400: "#76BABF",
    500: "#8EC6CA",
    600: "#A6D2D5",
    700: "#BEDEDF",
    800: "#D5E9EA",
    900: "#E9F3F4",
    1000: "#F4F9FA",
  },
  flame: {
    100: "#CA3604",
    200: "#D24F22",
    300: "#D9663F",
    400: "#DF7C5B",
    500: "#E59177",
    600: "#ECA694",
    700: "#F2BBB0",
    800: "#F7CFC9",
    900: "#FBE3E0",
    1000: "#FDF1EF",
  },
  carbon: {
    100: "#191312",
    200: "#2F2A29",
    300: "#454140",
    400: "#5C5857",
    500: "#74706F",
    600: "#8D8A89",
    700: "#A6A4A3",
    800: "#C1BFBE",
    900: "#DCDBDA",
    1000: "#EDECEC",
  },

  white: "#FFFFFF",
  black: "#000000",

  /** App canvas behind cards (the mocks use this for page + input fills). */
  pageBg: "#F5F6FB",
} as const;

/**
 * Shape scale derived from the design's `cornerRadius = 10` default, using the
 * same formulas the mock applies (rSm = r/2, rTile = r*1.6, rSheet = r*1.5,
 * rBox = r*0.6 for the "Rounded" checkbox shape).
 */
export const dsRadius = {
  sm: 5,
  box: 6,
  base: 10,
  sheet: 15,
  tile: 16,
  pill: 99,
} as const;

/** "Soft" surface style from the mock: 0 1px 2px rgba(25,19,18,.06). */
export const dsCardShadow = {
  shadowColor: "#191312",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 1,
} as const;

export default ds;
