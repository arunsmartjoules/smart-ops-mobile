/**
 * Auth palette — layout from Claude Design "JouleOps Auth.dc.html", recoloured
 * to the app-wide navy/red scheme ("JouleOps Role Dashboard v2") in both its
 * dark and light variants.
 */
import { useTheme } from "@/contexts/ThemeContext";

/** Derived from the mock's `cornerRadius = 10` default (rSm = 0.8r, rMark = 0.9r). */
export const authRadius = {
  cta: 10,
  cell: 8,
  mark: 9,
} as const;


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
 * Navy/red — the app-wide palette from "JouleOps Role Dashboard v2".
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

/** Light counterpart of the navy/red palette. */
const light: AuthPalette = {
  isDark: false,
  bg: "#F4F6FB",
  text: "#0F1828",
  body: "#4B5A76",
  labelIdle: "#5D6B86",
  accent: "#D43535",
  line: "#DDE2EC",
  placeholder: "#98A2B6",
  valid: "#17984F",
  eye: "#5D6B86",
  backIcon: "#4B5A76",

  ctaBg: "#D43535",
  ctaBgPressed: "#B32828",
  ctaOffBg: "#DDE2EC",
  ctaOffFg: "#7A869E",

  dividerLine: "#DDE2EC",
  dividerLabel: "#98A2B6",

  googleBg: "#FFFFFF",
  googleBorder: "#DDE2EC",
  googleFg: "#0F1828",

  cellOn: "#FFFFFF",
  hint: "#7A869E",

  footText: "#5D6B86",
  footLink: "#D43535",

  pwStrong: "#17984F",
  pwWeak: "#D43535",
  pwEmpty: "#DDE2EC",

  bubbleLockBg: "#FCEBEB",
  bubbleLockFg: "#D43535",
  bubbleMailBg: "#EEF5FD",
  bubbleMailFg: "#2F74C9",

  success: "#17984F",
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
