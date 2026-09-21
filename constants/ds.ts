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

/**
 * Dark palette — the app's only live palette (ThemeContext pins dark).
 *
 * Values are the navy/red scheme from Claude Design "JouleOps Role Dashboard
 * v2.dc.html": page #060C1A, card #0F1828, tile #152038, ink #EEF2FF, muted
 * #7A91BB, faint #3E506A, accent red #D43535, info blue #4A91EA. Ramp steps the
 * artboard doesn't state are interpolated between those.
 *
 * Deliberately keyed to the SAME token names as the light set, because the
 * screens use the brand scales semantically rather than literally: carbon 100
 * is always "primary text", carbon 1000 is always "the faintest fill", white
 * is always "card surface", flame is always "the accent". So the dark set
 * inverts the neutral ramps and every screen keeps reading the same token.
 */
export const dsDark: DsTheme = {
  isDark: true,
  tabBar: "#0B1220",
  cardBorder: "rgba(230,240,255,0.10)",
  field: "#152038",
  fieldBorder: "rgba(230,240,255,0.10)",
  controlOn: "#D43535",
  onControl: "#FFFFFF",
  onAccent: "#FFFFFF",
  onChrome: "#EEF2FF",

  // Chrome — header/tab surfaces stepping up from the page.
  thunder: {
    100: "#0B1220",
    200: "#0F1828",
    300: "#121C2F",
    400: "#152038",
    500: "#1A2742",
    600: "#25344F",
    700: "#7A91BB",
    800: "#93A6C8",
    900: "#B4C2DB",
    1000: "#EEF2FF",
  },
  // Secondary accent → the artboard's info blue.
  sky: {
    100: "#4A91EA",
    200: "#3A7FD6",
    300: "#336FBD",
    400: "#2C60A3",
    500: "#7FB4F2",
    600: "#1F4A80",
    700: "#1A3D69",
    800: "#153152",
    900: "#10243D",
    1000: "#10243D",
  },
  // Primary accent → the artboard's red; #F2A7A7 is its on-dark text weight.
  flame: {
    100: "#D43535",
    200: "#DB4E4E",
    300: "#E16767",
    400: "#E78080",
    500: "#F2A7A7",
    600: "#B03A3A",
    700: "#862E2E",
    800: "#5E2323",
    900: "#3A1616",
    1000: "#3A1616",
  },
  // Neutral ramp inverted: 100 = ink → 1000 = faintest fill.
  carbon: {
    100: "#EEF2FF",
    200: "#D6DEEF",
    300: "#BCC8E0",
    400: "#93A6C8",
    500: "#7A91BB",
    600: "#5D7196",
    700: "#4B5E80",
    800: "#3E506A",
    900: "rgba(230,240,255,0.10)",
    1000: "#152038",
  },

  // Card surface — what every `ds.white` fill becomes on dark.
  white: "#0F1828",
  black: "#000000",

  pageBg: "#060C1A",
};

/** The shape both palettes share, so a screen can take either. */
export type DsTheme = {
  /** True for the dark palette — for the rare either/or branch. */
  isDark: boolean;
  /** Tab-bar surface: it sits a step below the card on dark. */
  tabBar: string;
  /**
   * Dark cards are separated by a hairline, not a shadow — a drop shadow is
   * invisible on a near-black ground. Transparent in light mode, where the
   * existing `soShadow` does the work.
   */
  cardBorder: string;
  /**
   * Inset field / well INSIDE a card — a reading box, a text input, a
   * disabled input. Light mode steps slightly down from white; dark mode
   * steps DOWN from the card surface rather than up, so it never reads as a
   * white patch on a dark card.
   */
  field: string;
  /** Hairline around an inset field. */
  fieldBorder: string;
  /**
   * Fill for a SELECTED or PRIMARY control (a ticked checkbox, a primary CTA).
   * Light mode fills thunder; dark mode CANNOT — thunder there is #0A2126,
   * within a hair of the #0E2429 card such controls sit on, so the control
   * vanishes. Dark takes the bright sky accent instead.
   */
  controlOn: string;
  /** Text/icons sitting ON `controlOn`. */
  onControl: string;
  /** Text/icons sitting ON a filled flame or sky chip. */
  onAccent: string;
  /**
   * Text/icons sitting ON the thunder chrome (headers, hero, filled buttons).
   * Distinct from `white`, which is the CARD SURFACE — on the dark palette
   * that is #0E2429, so using it as a foreground would be invisible.
   */
  onChrome: string;
  thunder: Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000, string>;
  sky: Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000, string>;
  flame: Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000, string>;
  carbon: Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000, string>;
  white: string;
  black: string;
  pageBg: string;
};

/** The light set, typed as a palette so the two are interchangeable. */
export const dsLight: DsTheme = {
  ...ds,
  isDark: false,
  tabBar: ds.white,
  cardBorder: "transparent",
  field: "#F7F7F8",
  fieldBorder: "#ECECED",
  controlOn: ds.thunder[100],
  onControl: ds.white,
  onAccent: ds.white,
  onChrome: ds.white,
};

