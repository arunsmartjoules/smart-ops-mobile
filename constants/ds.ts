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
 * Dark palette — Claude Design "JouleOps Dark Mode.dc.html".
 *
 * Deliberately keyed to the SAME token names as the light set, because the
 * screens use the brand scales semantically rather than literally: carbon 100
 * is always "primary text", carbon 1000 is always "the faintest fill", white
 * is always "card surface". So the dark set inverts the neutral ramps and
 * brightens the accents, and every screen keeps reading the same token.
 *
 * Values are the artboard's, verbatim; the few that it doesn't state outright
 * are interpolated along the ramp it does state.
 */
export const dsDark: DsTheme = {
  isDark: true,
  tabBar: "#0A1D21",
  cardBorder: "rgba(255,255,255,0.07)",
  field: "#0A1D21",
  fieldBorder: "rgba(255,255,255,0.08)",
  controlOn: "#4FC0C9",
  onControl: "#04171A",
  onAccent: "#170804",
  onChrome: "#F1F4F4",

  // Chrome. The artboard's header/tabbar surfaces, stepping up from near-black.
  thunder: {
    100: "#0A2126",
    200: "#0E2429",
    300: "#122A2E",
    400: "#14343A",
    500: "#1A3339",
    600: "#2A4A50",
    700: "#7FA9AD",
    800: "#9FB0B3",
    900: "#B9C7C9",
    1000: "#F1F4F4",
  },
  // Sky brightens so it still reads on a dark ground.
  sky: {
    100: "#4FC0C9",
    200: "#28939D",
    300: "#2E8891",
    400: "#2A7A82",
    500: "#7FA9AD",
    600: "#1F656D",
    700: "#1A555C",
    800: "#14434A",
    900: "#0F3238",
    1000: "#0F3238",
  },
  // Flame brightens to #E4551F; #F5A87F is its on-dark text weight.
  flame: {
    100: "#E4551F",
    200: "#EA6A38",
    300: "#EE7F52",
    400: "#F1936B",
    500: "#F5A87F",
    600: "#C4713F",
    700: "#8E4F2C",
    800: "#63361E",
    900: "#3A1A10",
    1000: "#3A1A10",
  },
  // Neutral ramp inverted: 100 = brightest text → 1000 = faintest fill.
  carbon: {
    100: "#F1F4F4",
    200: "#DCE4E5",
    300: "#C8D3D5",
    400: "#9FB0B3",
    500: "#8EA1A4",
    600: "#6C8589",
    700: "#6C8589",
    800: "#4A6266",
    900: "rgba(255,255,255,0.10)",
    1000: "#1A3339",
  },

  // Card surface — what every `ds.white` fill becomes on dark.
  white: "#0E2429",
  black: "#000000",

  pageBg: "#061417",
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

