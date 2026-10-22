/**
 * JouleOps app design tokens — Claude Design "JouleOps App.dc.html".
 *
 * The artboard is dark-only: a near-black carbon canvas (#0A0A0C), #141418
 * cards, Bricolage Grotesque display numbers over Geist text, and ONE accent
 * colour the user picks (flame / lime / violet / mint …). Dark values below
 * are copied verbatim from the artboard. The light set is our counterpart so
 * the existing Light / System appearance setting keeps working — it is not in
 * the design, so tune it here rather than per screen.
 *
 * Text that sits ON the accent is always near-black (#0A0A0C): every accent is
 * a light, saturated colour, exactly as the artboard renders its buttons.
 */

export type AccentKey =
  | "flame"
  | "lime"
  | "violet"
  | "mint"
  | "sky"
  | "rose"
  | "amber"
  | "thunder";

export interface AccentDef {
  key: AccentKey;
  label: string;
  /** Fill colour — buttons, active pill, hero card. */
  color: string;
  /**
   * The accent when it is used as TEXT or an icon on the light page. The fill
   * colours are too pale to read on white (lime especially), so light mode
   * takes a deeper step of the same hue. Dark mode always uses `color`.
   */
  ink: string;
  /** "r,g,b" of `color`, for the glow / tint alphas. */
  rgb: string;
  /**
   * Text/icons ON a fill of this accent. Omitted = the palette's dark
   * `onAccent` (every pastel accent); a dark accent needs light text.
   */
  onColor?: string;
  /**
   * Dark-mode replacements for a dark accent, which would vanish on the carbon
   * page: a lifted fill, a light ink for text/icons, and their "r,g,b".
   */
  dark?: { color: string; ink: string; rgb: string };
}

/** Order = the order the Appearance picker shows them. The first four are the artboard's. */
export const ACCENTS: AccentDef[] = [
  { key: "flame", label: "Flame", color: "#FF7A45", ink: "#D9531C", rgb: "255,122,69" },
  { key: "lime", label: "Lime", color: "#D7FF3D", ink: "#5F7A00", rgb: "215,255,61" },
  { key: "violet", label: "Violet", color: "#A99BFF", ink: "#5B47E0", rgb: "169,155,255" },
  { key: "mint", label: "Mint", color: "#5EEAD4", ink: "#0B8F7E", rgb: "94,234,212" },
  { key: "sky", label: "Sky", color: "#7CC4FF", ink: "#1F78C8", rgb: "124,196,255" },
  { key: "rose", label: "Rose", color: "#FF8FB8", ink: "#C93670", rgb: "255,143,184" },
  { key: "amber", label: "Amber", color: "#FFC145", ink: "#A06A00", rgb: "255,193,69" },
  // SJ Thunder — the brand teal (web ds-tokens --sj-thunder = --thunder-100).
  // Dark mode lifts it to --thunder-300 for fills and --thunder-700 for text.
  {
    key: "thunder",
    label: "Thunder",
    color: "#072B31",
    ink: "#072B31",
    rgb: "7,43,49",
    onColor: "#FFFFFF",
    dark: { color: "#38545A", ink: "#A2A9AB", rgb: "86,104,110" },
  },
];

export const DEFAULT_ACCENT: AccentKey = "flame";

export function accentDef(key: string | null | undefined): AccentDef {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0]!;
}

/** Font families — loaded in app/_layout.tsx. Never pair these with `fontWeight` (Android drops the face). */
export const JF = {
  display: "BricolageGrotesque_700Bold",
  displayX: "BricolageGrotesque_800ExtraBold",
  displayM: "BricolageGrotesque_600SemiBold",
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular",
  monoM: "GeistMono_500Medium",
  monoSB: "GeistMono_600SemiBold",
} as const;

export interface JoPalette {
  isDark: boolean;
  /** App canvas. */
  page: string;
  /** Card surface (#141418). */
  card: string;
  /** Hairline around a card. */
  cardBorder: string;
  /** Raised control inside a card / idle chip (#1C1C22). */
  raised: string;
  /** Header buttons, search fields, sheet surface (#17171C). */
  input: string;
  /** Field inside a sheet (#1F1F26). */
  sheetField: string;
  /** Progress-bar track, idle pin (#26262E). */
  track: string;
  /** Sheet grabber (#33333C). */
  handle: string;
  /** Disabled chevron (#3A3A44). */
  disabled: string;
  /** Row divider inside a card. */
  line: string;
  /** Chip / input outline. */
  lineMid: string;
  /** Secondary-button outline, dashed photo slots. */
  lineStrong: string;
  ink: string;
  /** Secondary text, idle chip label (#C9C9D1). */
  ink2: string;
  /** Tertiary text (#A9A9B3). */
  ink3: string;
  muted: string;
  faint: string;
  /** Selected chip / segmented tab: fill + text. */
  selBg: string;
  selFg: string;
  /** Floating tab bar. */
  navBg: string;
  navBorder: string;
  navIdle: string;
  scrim: string;
  /** Text on accent / on the bright "selected" chip. */
  onAccent: string;
  ok: string;
  warn: string;
  bad: string;
  info: string;
  mute: string;
  /** Soft text on a bad tint (e.g. breach banner subtitle). */
  badSoft: string;
  okTint: string;
  warnTint: string;
  badTint: string;
  infoTint: string;
  muteTint: string;
  badBorder: string;
  badWash: string;
  /** Hero card's inner rings. */
  heroRing: string;
  heroDivider: string;
  heroWell: string;
  /** Avatar fills — picked by a hash of the name. */
  avatars: string[];
  /** Profile avatar fill. */
  avatarSelf: string;
}

export const JO_DARK: JoPalette = {
  isDark: true,
  page: "#0A0A0C",
  card: "#141418",
  cardBorder: "rgba(255,255,255,0.06)",
  raised: "#1C1C22",
  input: "#17171C",
  sheetField: "#1F1F26",
  track: "#26262E",
  handle: "#33333C",
  disabled: "#3A3A44",
  line: "rgba(255,255,255,0.06)",
  lineMid: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.18)",
  ink: "#F4F4F6",
  ink2: "#C9C9D1",
  ink3: "#A9A9B3",
  muted: "#8A8A96",
  faint: "#5A5A66",
  selBg: "#F4F4F6",
  selFg: "#0A0A0C",
  // Opaque: the artboard's rgba(24,24,30,.86) relies on a 22px backdrop blur
  // RN can't do without a native module; translucent without blur lets the
  // text underneath show through the bar.
  navBg: "#18181E",
  navBorder: "rgba(255,255,255,0.08)",
  navIdle: "#8A8A96",
  scrim: "rgba(0,0,0,0.6)",
  onAccent: "#0A0A0C",
  ok: "#5EEAD4",
  warn: "#FBBF24",
  bad: "#FF6B57",
  info: "#9EC5FF",
  mute: "#C9C9D1",
  badSoft: "#FFB3A8",
  okTint: "rgba(94,234,212,0.14)",
  warnTint: "rgba(251,191,36,0.14)",
  badTint: "rgba(255,107,87,0.14)",
  infoTint: "rgba(158,197,255,0.14)",
  muteTint: "rgba(138,138,150,0.16)",
  badBorder: "rgba(255,107,87,0.28)",
  badWash: "rgba(255,107,87,0.10)",
  heroRing: "rgba(10,10,12,0.10)",
  heroDivider: "rgba(10,10,12,0.14)",
  heroWell: "rgba(10,10,12,0.08)",
  avatars: ["#FFB38A", "#A5B4FF", "#7EE8C9", "#F9D976", "#F7A8D8", "#9EE3FF"],
  avatarSelf: "#FFB38A",
};

export const JO_LIGHT: JoPalette = {
  isDark: false,
  page: "#F4F4F6",
  card: "#FFFFFF",
  cardBorder: "rgba(10,10,12,0.07)",
  raised: "#F0F0F3",
  input: "#FFFFFF",
  sheetField: "#F0F0F3",
  track: "#E4E4E9",
  handle: "#D2D2DA",
  disabled: "#C4C4CC",
  line: "rgba(10,10,12,0.07)",
  lineMid: "rgba(10,10,12,0.10)",
  lineStrong: "rgba(10,10,12,0.22)",
  ink: "#0A0A0C",
  ink2: "#3A3A44",
  ink3: "#55555F",
  muted: "#6B6B76",
  faint: "#9A9AA6",
  selBg: "#0A0A0C",
  selFg: "#F4F4F6",
  navBg: "#FFFFFF",
  navBorder: "rgba(10,10,12,0.08)",
  navIdle: "#6B6B76",
  scrim: "rgba(10,10,12,0.45)",
  onAccent: "#0A0A0C",
  ok: "#0B8F7E",
  warn: "#B77900",
  bad: "#E0442F",
  info: "#2F6FCB",
  mute: "#55555F",
  badSoft: "#B8402F",
  okTint: "rgba(11,143,126,0.12)",
  warnTint: "rgba(183,121,0,0.12)",
  badTint: "rgba(224,68,47,0.11)",
  infoTint: "rgba(47,111,203,0.11)",
  muteTint: "rgba(85,85,95,0.10)",
  badBorder: "rgba(224,68,47,0.28)",
  badWash: "rgba(224,68,47,0.07)",
  heroRing: "rgba(10,10,12,0.10)",
  heroDivider: "rgba(10,10,12,0.14)",
  heroWell: "rgba(10,10,12,0.08)",
  avatars: ["#FFB38A", "#A5B4FF", "#7EE8C9", "#F9D976", "#F7A8D8", "#9EE3FF"],
  avatarSelf: "#FFB38A",
};

/** Palette + the resolved accent, as screens consume it. */
export interface JoTheme extends JoPalette {
  accentKey: AccentKey;
  /** Accent fill. */
  accent: string;
  /** Accent as text / icon on the page (deeper step in light mode). */
  accentInk: string;
  /** Top-right page glow. */
  accentGlow: string;
  /** Faint accent wash behind a highlighted block. */
  accentTint: string;
}

const THEME_CACHE = new Map<string, JoTheme>();

/** One frozen object per (mode, accent) so memoised stylesheets stay stable. */
export function joTheme(isDark: boolean, accentKey: AccentKey): JoTheme {
  const id = `${isDark ? "d" : "l"}:${accentKey}`;
  const hit = THEME_CACHE.get(id);
  if (hit) return hit;
  const base = isDark ? JO_DARK : JO_LIGHT;
  const a = accentDef(accentKey);
  const fill = isDark && a.dark ? a.dark.color : a.color;
  const rgb = isDark && a.dark ? a.dark.rgb : a.rgb;
  const built: JoTheme = {
    ...base,
    accentKey: a.key,
    accent: fill,
    accentInk: isDark ? (a.dark?.ink ?? a.color) : a.ink,
    accentGlow: `rgba(${rgb},${isDark ? (a.key === "lime" ? 0.16 : 0.2) : 0.22})`,
    accentTint: `rgba(${rgb},${isDark ? (a.key === "lime" ? 0.08 : 0.1) : 0.16})`,
    // A dark accent carries light text, and its hero card light dividers.
    ...(a.onColor ? { onAccent: a.onColor, heroDivider: "rgba(255,255,255,0.18)" } : null),
  };
  THEME_CACHE.set(id, built);
  return built;
}

/** Status tone → colour pair. */
export type JoTone = "ok" | "warn" | "bad" | "info" | "mute";

export function toneFg(t: JoTheme, tone: JoTone): string {
  return t[tone];
}

export function toneBg(t: JoTheme, tone: JoTone): string {
  return t[`${tone}Tint` as const];
}

/** Stable avatar fill for a name (same hash as the artboard). */
export function avatarColor(t: JoPalette, seed: string): string {
  const sum = [...(seed || "?")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return t.avatars[sum % t.avatars.length]!;
}

/** "Pakshep Girdhar" → "PG". */
export function initials(name: string | null | undefined): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
