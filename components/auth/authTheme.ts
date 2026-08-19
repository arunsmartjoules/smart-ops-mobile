/**
 * Auth palette — Claude Design "JouleOps Auth.dc.html".
 *
 * The mock ships a dark artboard (thunder canvas) and a light artboard (frost
 * canvas) for every auth screen. Colours below are copied verbatim from that
 * file; where a value already exists in the shared token set it is referenced
 * from `@/constants/ds` instead of being re-typed.
 */
import { ds } from "@/constants/ds";
import { useTheme } from "@/contexts/ThemeContext";

/** Derived from the mock's `cornerRadius = 10` default (rSm = 0.8r, rMark = 0.9r). */
export const authRadius = {
  cta: 10,
  cell: 8,
  mark: 9,
} as const;

/** Flame tint used for links/focus on the dark artboard — not part of the ds scale. */
const FLAME_TINT = "#E9B7A8";
/** Pressed states for the two CTA fills. */
const FLAME_PRESSED = "#A32A02";
const THUNDER_PRESSED = "#0C4048";

export interface AuthPalette {
  isDark: boolean;
  /** Screen canvas. */
  bg: string;
  /** Headings and input text. */
  text: string;
  /** Body copy under a heading. */
  body: string;
  /** Field caption, idle. */
  labelIdle: string;
  /** Field caption + underline, focused. */
  accent: string;
  /** Field underline, idle. */
  line: string;
  placeholder: string;
  /** Filled check on a valid email. */
  valid: string;
  /** Password eye toggle. */
  eye: string;
  /** Back chevron. */
  backIcon: string;

  ctaBg: string;
  ctaBgPressed: string;
  ctaOffBg: string;
  ctaOffFg: string;

  dividerLine: string;
  dividerLabel: string;

  googleBg: string;
  googleBorder: string;
  googleFg: string;

  /** 6-digit code cell fill once a digit is typed. */
  cellOn: string;
  /** Resend timer / security hint. */
  hint: string;

  /** Footer prompt + its inline action. */
  footText: string;
  footLink: string;

  /** Password-strength meter. */
  pwStrong: string;
  pwWeak: string;
  pwEmpty: string;

  /** Icon bubble on the forgot-password screen. */
  bubbleLockBg: string;
  bubbleLockFg: string;
  /** Icon bubble on the verification screen. */
  bubbleMailBg: string;
  bubbleMailFg: string;

  /** Confirmed / success fill (shared across both artboards). */
  success: string;
}

const dark: AuthPalette = {
  isDark: true,
  bg: ds.thunder[100],
  text: ds.white,
  body: ds.thunder[700],
  labelIdle: ds.thunder[600],
  accent: FLAME_TINT,
  line: "rgba(255,255,255,0.28)",
  placeholder: ds.thunder[600],
  valid: ds.sky[500],
  eye: ds.thunder[700],
  backIcon: ds.thunder[700],

  ctaBg: ds.flame[100],
  ctaBgPressed: FLAME_PRESSED,
  ctaOffBg: "rgba(255,255,255,0.14)",
  ctaOffFg: ds.thunder[700],

  dividerLine: "rgba(255,255,255,0.18)",
  dividerLabel: ds.thunder[600],

  googleBg: "transparent",
  googleBorder: "rgba(255,255,255,0.22)",
  googleFg: ds.white,

  cellOn: "rgba(255,255,255,0.08)",
  hint: ds.thunder[600],

  footText: ds.thunder[700],
  footLink: ds.white,

  pwStrong: ds.sky[500],
  pwWeak: FLAME_TINT,
  pwEmpty: "rgba(255,255,255,0.2)",

  bubbleLockBg: "rgba(255,255,255,0.1)",
  bubbleLockFg: FLAME_TINT,
  bubbleMailBg: "rgba(255,255,255,0.1)",
  bubbleMailFg: ds.sky[500],

  success: ds.sky[100],
};

const light: AuthPalette = {
  isDark: false,
  bg: ds.pageBg,
  text: ds.carbon[100],
  body: ds.carbon[400],
  labelIdle: ds.carbon[500],
  accent: ds.flame[100],
  line: ds.carbon[900],
  placeholder: ds.carbon[700],
  valid: ds.sky[100],
  eye: ds.carbon[500],
  backIcon: ds.carbon[400],

  ctaBg: ds.thunder[100],
  ctaBgPressed: THUNDER_PRESSED,
  ctaOffBg: ds.carbon[900],
  ctaOffFg: ds.carbon[500],

  dividerLine: ds.carbon[900],
  dividerLabel: ds.carbon[700],

  googleBg: ds.white,
  googleBorder: ds.carbon[900],
  googleFg: ds.carbon[100],

  cellOn: ds.white,
  hint: ds.carbon[600],

  footText: ds.carbon[500],
  footLink: ds.flame[100],

  pwStrong: "#1F757D",
  pwWeak: ds.flame[100],
  pwEmpty: ds.carbon[900],

  bubbleLockBg: ds.flame[1000],
  bubbleLockFg: ds.flame[100],
  bubbleMailBg: ds.sky[1000],
  bubbleMailFg: ds.sky[100],

  success: ds.sky[100],
};

export function useAuthPalette(): AuthPalette {
  const { isDark } = useTheme();
  return isDark ? dark : light;
}

/** Same rule the mock uses to gate the CTAs. */
export const isEmailValid = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Mock's scoring: length ≥ 8, an uppercase, a digit, a symbol. */
export function passwordScore(pw: string) {
  return (
    (pw.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0)
  );
}
