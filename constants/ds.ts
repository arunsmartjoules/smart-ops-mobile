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
 * Dark palette.
 *
 * Values are the carbon scheme from Claude Design "JouleOps App.dc.html":
 * page #0A0A0C, card #141418, raised #1C1C22, track #26262E, ink #F4F4F6,
 * muted #8A8A96, faint #5A5A66, alert coral #FF6B57. Ramp steps the artboard
 * doesn't state are interpolated between those. (Screens rebuilt on that
 * artboard use constants/jo.ts directly; this keeps the older screens on the
 * same canvas.)
 *
 * Deliberately keyed to the SAME token names as the light set, because the
 * screens use the brand scales semantically rather than literally: carbon 100
 * is always "primary text", carbon 1000 is always "the faintest fill", white
 * is always "card surface", flame is always "the accent". So the dark set
 * inverts the neutral ramps and every screen keeps reading the same token.
 */
export const dsDark: DsTheme = {
  isDark: true,
  tabBar: "#141418",
  cardBorder: "rgba(255,255,255,0.06)",
  field: "#1C1C22",
  fieldBorder: "rgba(255,255,255,0.08)",
  // Selected/primary controls follow the user's accent (Appearance › Accent):
  // useDs() swaps in the accent's deep step (constants/jo.ts `ink`). These
  // older screens put white text/ticks on controls — often hard-coded — and
  // the bright fills (lime especially) can't carry white, the deep step can.
  controlOn: "#D9531C",
  onControl: "#FFFFFF",
  onAccent: "#FFFFFF",
  onChrome: "#F4F4F6",

  // Chrome — header/tab surfaces stepping up from the page.
  thunder: {
    100: "#0A0A0C",
    200: "#141418",
    300: "#17171C",
    400: "#1C1C22",
    500: "#1F1F26",
    600: "#26262E",
    700: "#8A8A96",
    800: "#A9A9B3",
    900: "#C9C9D1",
    1000: "#F4F4F6",
  },
  // Secondary accent → info blue.
  sky: {
    100: "#4A91EA",
    200: "#3A7FD6",
    300: "#336FBD",
    400: "#2C60A3",
    500: "#9EC5FF",
    600: "#1F4A80",
    700: "#1A3D69",
    800: "#153152",
    900: "#10243D",
    1000: "#10243D",
  },
  // Danger / alert red, nudged to the artboard's coral #FF6B57 family.
  flame: {
    100: "#E5483A",
    200: "#EC5A49",
    300: "#FF6B57",
    400: "#FF8A7A",
    500: "#FFB3A8",
    600: "#B23A2E",
    700: "#862E26",
    800: "#5E231D",
    900: "#3A1714",
    1000: "#2A1210",
  },
  // Neutral ramp inverted: 100 = ink → 1000 = faintest fill.
  carbon: {
    100: "#F4F4F6",
    200: "#E2E2E7",
    300: "#C9C9D1",
    400: "#A9A9B3",
    500: "#8A8A96",
    600: "#6E6E7A",
    700: "#5A5A66",
    800: "#3A3A44",
    900: "rgba(255,255,255,0.08)",
    1000: "#1C1C22",
  },

  // Card surface — what every `ds.white` fill becomes on dark.
  white: "#141418",
  black: "#000000",

  pageBg: "#0A0A0C",
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

/**
 * Light palette — the light counterpart of the navy/red scheme above: white
 * cards on a pale blue-grey page, navy ink, the same red accent and info blue.
 * Chrome (`thunder`, e.g. module headers) is navy, so white text sits on it as
 * before. Same semantic token names as the dark set.
 */
export const dsLight: DsTheme = {
  isDark: false,
  tabBar: "#FFFFFF",
  cardBorder: "#D6DDE9",
  field: "#F1F4FA",
  fieldBorder: "#CFD7E4",
  // Selected/primary controls follow the user's accent (see dsDark / useDs()).
  controlOn: "#D9531C",
  onControl: "#FFFFFF",
  onAccent: "#FFFFFF",
  onChrome: "#FFFFFF",

  thunder: {
    100: "#0F1828",
    200: "#1A2742",
    300: "#25344F",
    400: "#3E506A",
    500: "#5D7196",
    600: "#7A91BB",
    700: "#93A6C8",
    800: "#B4C2DB",
    900: "#D6DEEF",
    1000: "#EEF2FF",
  },
  sky: {
    100: "#2F74C9",
    200: "#4A91EA",
    300: "#6AA5EE",
    400: "#8AB8F1",
    500: "#A6C9F4",
    600: "#BFD8F7",
    700: "#D3E4FA",
    800: "#E3EEFC",
    900: "#EEF5FD",
    1000: "#F6FAFE",
  },
  flame: {
    100: "#D43535",
    200: "#DB4E4E",
    300: "#E16767",
    400: "#E78080",
    500: "#EC9A9A",
    600: "#F2B5B5",
    700: "#F6CACA",
    800: "#F9DCDC",
    900: "#FCEBEB",
    1000: "#FDF4F4",
  },
  // Navy-tinted neutrals: 100 = ink → 1000 = faintest fill.
  carbon: {
    100: "#0F1828",
    200: "#1F2A40",
    300: "#33415B",
    400: "#4B5A76",
    500: "#5D6B86",
    600: "#7A869E",
    700: "#98A2B6",
    800: "#B8C0CF",
    900: "#D3DAE6",
    1000: "#EEF1F7",
  },

  white: "#FFFFFF",
  black: "#000000",

  pageBg: "#F4F4F6",
};
