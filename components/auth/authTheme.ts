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

/** Pressed state for the light artboard's thunder CTA. */
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

/**
 * Navy/red — the app-wide palette from "JouleOps Role Dashboard v2" (the app is
 * dark-only, so this is the auth palette every user sees).
 */
const dark: AuthPalette = {
  isDark: true,
  bg: "#060C1A",
  text: "#EEF2FF",
  body: "#7A91BB",
  labelIdle: "#5D7196",
  accent: "#F2A7A7",
  line: "rgba(230,240,255,0.22)",
  placeholder: "#5D7196",
  valid: "#20BF6B",
  eye: "#7A91BB",
  backIcon: "#7A91BB",

  ctaBg: "#D43535",
  ctaBgPressed: "#B32828",
  ctaOffBg: "#152038",
  ctaOffFg: "#5D7196",

  dividerLine: "rgba(230,240,255,0.14)",
  dividerLabel: "#5D7196",

  googleBg: "transparent",
  googleBorder: "rgba(230,240,255,0.22)",
  googleFg: "#EEF2FF",

  cellOn: "#152038",
  hint: "#5D7196",

  footText: "#7A91BB",
  footLink: "#EEF2FF",

  pwStrong: "#20BF6B",
  pwWeak: "#F2A7A7",
  pwEmpty: "rgba(230,240,255,0.14)",

  bubbleLockBg: "rgba(212,53,53,0.14)",
  bubbleLockFg: "#F2A7A7",
  bubbleMailBg: "rgba(74,145,234,0.14)",
  bubbleMailFg: "#7FB4F2",

  success: "#20BF6B",
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
